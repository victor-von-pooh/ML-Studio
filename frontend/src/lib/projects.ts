import { useCallback, useEffect, useRef, useState } from 'react'

import { stageApiBase } from '../stages'
import { PROJECT_KEY, readStorage, writeStorage } from './storage'

/** 問題の欄の 1 つ (問題の識別子と名前) */
export interface ProjectItem {
  id: string
  name: string
}

/** 問題の一覧の状態 */
export interface Projects {
  /** 一覧 (読み込む前は空. 読めなかったときは前に読めた一覧) */
  items: ProjectItem[]
  /** 読めなかったときの文 (読めたら null) */
  error: string | null
  /** 一覧を読み直す */
  reload: () => void
  /**
   * 一覧を読み直し, 読み直した後の一覧を渡す (読めなかったときは null. 途中で次の読み直しが
   * 始まったときは, その読み直しの後に渡す)
   */
  reloadThen: (done: (items: ProjectItem[] | null) => void) => void
}

/** 読み直した後に一覧を渡す相手 */
interface Waiter {
  /** 待つ読み直しの番号 (これより後の読み直しでもよい) */
  version: number
  done: (items: ProjectItem[] | null) => void
}

/** 一覧の応答から識別子と名前だけを取り出す (殻は問題の設定の形を読まない) */
function toItems(body: unknown): ProjectItem[] {
  if (!Array.isArray(body)) return []
  return body.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return []
    const { id, name } = row as { id?: unknown; name?: unknown }
    if (typeof id !== 'string') return []
    return [{ id, name: typeof name === 'string' && name ? name : id }]
  })
}

/** 問題の設定の段階の API から問題の一覧を読む */
export function useProjects(): Projects {
  const [items, setItems] = useState<ProjectItem[]>([])
  const [error, setError] = useState<string | null>(null)
  // 読み直すたびに増やす (増えたら読む)
  const [version, setVersion] = useState(0)
  // 最後に頼んだ読み直しの番号 (読み直しを頼んだ相手に番号を渡すため)
  const latest = useRef(0)
  // 読み直した後に一覧を渡す相手
  const waiters = useRef<Waiter[]>([])

  useEffect(() => {
    const controller = new AbortController()
    // 待つ読み直しの番号がこの読み直しまでの相手に一覧を渡す
    const settle = (loaded: ProjectItem[] | null) => {
      const ready = waiters.current.filter((waiter) => waiter.version <= version)
      waiters.current = waiters.current.filter((waiter) => waiter.version > version)
      for (const waiter of ready) waiter.done(loaded)
    }
    fetch(`${stageApiBase('problem')}/problems`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`問題の一覧を読めません (${response.status})`)
        const loaded = toItems(await response.json())
        if (controller.signal.aborted) return
        setItems(loaded)
        setError(null)
        settle(loaded)
      })
      .catch((reason: unknown) => {
        // 読めなかったときは前の一覧を残す (選びが一覧に無いように見せないため)
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : String(reason))
        settle(null)
      })
    return () => controller.abort()
  }, [version])

  const reload = useCallback(() => {
    latest.current += 1
    setVersion(latest.current)
  }, [])

  const reloadThen = useCallback(
    (done: (loaded: ProjectItem[] | null) => void) => {
      waiters.current.push({ version: latest.current + 1, done })
      reload()
    },
    [reload],
  )

  return { items, error, reload, reloadThen }
}

/**
 * 殻で選んだ問題と, 選びを替える関数 (localStorage の `studio-project` に残す)
 *
 * 部品の `onProjectChange` で受けた値は一覧にあるか null のときだけ採る. 一覧に無いときは
 * 一覧を読み直し, 読み直しても無ければ選びを替えない (殻の project は替わらず, 部品には知らせが届かない)
 *
 * @param projects - 問題の一覧
 * @returns 選んだ問題, 欄で選んだときの関数, 部品が知らせたときの関数
 */
export function useSelectedProject(
  projects: Projects,
): [string | null, (project: string | null) => void, (project: string | null) => void] {
  const [project, setProject] = useState<string | null>(() => readStorage(PROJECT_KEY) || null)
  // 選びを頼んだ回数 (読み直しの間に別の選びが入ったら, 前の知らせを採らないため)
  const asked = useRef(0)
  // 部品の知らせを確かめる一覧 (知らせる関数を替えずに今の一覧を読むため)
  const known = useRef(projects.items)
  useEffect(() => {
    known.current = projects.items
  }, [projects.items])
  const { reloadThen } = projects

  const store = useCallback((next: string | null) => {
    writeStorage(PROJECT_KEY, next)
    setProject(next)
  }, [])

  const select = useCallback(
    (next: string | null) => {
      asked.current += 1
      store(next)
    },
    [store],
  )

  const accept = useCallback(
    (next: string | null) => {
      asked.current += 1
      const has = (items: ProjectItem[]) => items.some((item) => item.id === next)
      if (next === null || has(known.current)) {
        store(next)
        return
      }
      // 新しく作った問題は一覧の読み直しより先に知らせが届きうるので, 読み直して確かめる
      const ticket = asked.current
      reloadThen((items) => {
        if (ticket === asked.current && items !== null && has(items)) store(next)
      })
    },
    [store, reloadThen],
  )

  return [project, select, accept]
}
