import { useCallback, useEffect, useState } from 'react'

import { FIRST_STAGE, stageBase, stageFromPath, type StageKey } from '../stages'

/** 選んだ段階と, 段階の根の部品を作り直すための回数 */
export interface StageLocation {
  /** 経路の最初の区切りで選んだ段階 */
  stage: StageKey
  /** 根の部品の key (段階を移るか, 同じ段階を押し直すたびに替わる) */
  key: string
}

/**
 * 今の経路から段階を選ぶ. 段階に合わない経路 (`/` と知らない頭, まだ載っていない段階) は
 * 最初の段階の頭に置き換える (履歴を増やさない). 置き換えたかも返す
 */
export function resolveStage(): { stage: StageKey; replaced: boolean } {
  const stage = stageFromPath(window.location.pathname)
  if (stage !== null) return { stage, replaced: false }
  window.history.replaceState(null, '', stageBase(FIRST_STAGE))
  return { stage: FIRST_STAGE, replaced: true }
}

/** 今の経路から段階を選ぶ (合わない経路は最初の段階の頭に置き換える) */
export const readStage = (): StageKey => resolveStage().stage

/**
 * 経路の最初の区切りで選ぶ段階と, 段階を移る関数
 *
 * 殻は react-router を使わず, 段階を移るときは `history.pushState` で経路を段階の頭に替え,
 * 戻ると進むは `popstate` で知る. 段階の中の移動 (部品のルーター) は頭を変えないので,
 * 同じ段階の間の戻ると進むでは作り直さない. 殻が経路を置き換えたときは, 部品のルーターが
 * 置き換えの前の経路を読んでいるので作り直す
 */
export function useStageLocation(): [StageLocation, (stage: StageKey) => void] {
  const [stage, setStage] = useState<StageKey>(readStage)
  // 同じ段階を押し直した回数 (部品のルーターに段階の頭を読み直させる)
  const [visit, setVisit] = useState(0)

  useEffect(() => {
    const onPopState = () => {
      const { stage: next, replaced } = resolveStage()
      setStage(next)
      if (replaced) setVisit((count) => count + 1)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const go = useCallback((next: StageKey) => {
    // 同じ段階を押し直したときは履歴を増やさず, 段階の頭から作り直す
    if (stageFromPath(window.location.pathname) === next)
      window.history.replaceState(null, '', stageBase(next))
    else window.history.pushState(null, '', stageBase(next))
    setStage(next)
    setVisit((count) => count + 1)
  }, [])

  return [{ stage, key: `${stage}:${visit}` }, go]
}
