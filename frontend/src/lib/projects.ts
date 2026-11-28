import { useCallback, useEffect, useState } from 'react'

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

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${stageApiBase('problem')}/problems`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`問題の一覧を読めません (${response.status})`)
        setItems(toItems(await response.json()))
        setError(null)
      })
      .catch((reason: unknown) => {
        // 読めなかったときは前の一覧を残す (選びが一覧に無いように見せないため)
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => controller.abort()
  }, [version])

  const reload = useCallback(() => setVersion((count) => count + 1), [])

  return { items, error, reload }
}

/** 殻で選んだ問題と, 選びを替える関数 (localStorage の `studio-project` に残す) */
export function useSelectedProject(): [string | null, (project: string | null) => void] {
  const [project, setProject] = useState<string | null>(() => readStorage(PROJECT_KEY) || null)

  const select = useCallback((next: string | null) => {
    writeStorage(PROJECT_KEY, next)
    setProject(next)
  }, [])

  return [project, select]
}
