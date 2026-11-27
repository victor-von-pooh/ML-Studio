/** 段階の鍵 (経路の頭に使う語) */
export type StageKey = 'problem' | 'data' | 'model' | 'train' | 'infer'

/** 段階の並びの 1 つ */
export interface Stage {
  /** 段階の鍵 */
  key: StageKey
  /** 段階の名前 */
  label: string
  /** 担うアプリ */
  app: string
}

/** 段階の並び (問題の設定 → データの分析 → モデルの作成・選定 → 学習・評価 → 推論) */
export const STAGES: readonly Stage[] = [
  { key: 'problem', label: '問題の設定', app: 'ML-Pathfinder' },
  { key: 'data', label: 'データの分析', app: 'ML-Fathom' },
  { key: 'model', label: 'モデルの作成・選定', app: 'ML-CreateArchitecture' },
  { key: 'train', label: '学習・評価', app: 'ML-Dashboard' },
  { key: 'infer', label: '推論', app: 'ML-Provide' },
]

/** 最初の段階 (`/` と知らない頭はここに移す) */
export const FIRST_STAGE: StageKey = 'problem'

/** 段階の画面の経路の頭 (例 `/problem`) */
export const stageBase = (key: StageKey) => `/${key}`

/** 段階の API の頭 (例 `/api/problem`) */
export const stageApiBase = (key: StageKey) => `/api/${key}`

/** 経路の最初の区切りに合う段階 (合わなければ null) */
export function stageFromPath(pathname: string): StageKey | null {
  const head = pathname.split('/')[1] ?? ''
  const stage = STAGES.find((item) => item.key === head)
  return stage?.key ?? null
}
