import { LoaderCircle, Moon, Sun, TriangleAlert, Workflow } from 'lucide-react'
import type { StageAppProps } from 'ml-pathfinder-frontend'
import { Component, Suspense, lazy } from 'react'
import type { ChangeEvent, ComponentType, MouseEvent, ReactNode } from 'react'

import { useStageLocation } from './lib/location'
import { useProjects, useSelectedProject, type ProjectItem } from './lib/projects'
import { useTheme } from './lib/theme'
import { STAGES, stageApiBase, stageBase, type StageKey } from './stages'

/** 選んでいないことを表すプロジェクトの欄の値 */
const NONE = ''

/** 段階の根の部品を読む (段階ごとに別のチャンクにして, 開いたときに読む) */
const lazyStage = (load: () => Promise<{ StageApp: ComponentType<StageAppProps> }>) =>
  lazy(async () => ({ default: (await load()).StageApp }))

/** 段階の根の部品 */
const STAGE_APPS: Record<StageKey, ComponentType<StageAppProps>> = {
  problem: lazyStage(() => import('ml-pathfinder-frontend')),
  data: lazyStage(() => import('ml-fathom-frontend')),
  model: lazyStage(() => import('ml-createarchitecture-frontend')),
  train: lazyStage(() => import('ml-dashboard-frontend')),
  infer: lazyStage(() => import('ml-provide-frontend')),
}

/** 段階の画面を読む間に段階の場所に出す表示 */
function StageLoading() {
  return (
    <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-ink-2">
      <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
      段階の画面を読み込んでいます
    </div>
  )
}

/**
 * 段階の画面の誤りの境界. 段階の画面を読めないときと段階の部品が描く途中で例外を
 * 出したときに, 殻の帯を残して段階の場所に理由と再読み込みのボタンを出す
 */
class StageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    // 読めなかったチャンクは React が失敗を覚えるので, ページごと読み直す
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div
          role="alert"
          className="flex max-w-lg flex-col items-start gap-3 rounded-lg border border-line bg-surface p-4"
        >
          <p className="flex items-center gap-2 font-medium text-critical-text">
            <TriangleAlert size={16} aria-hidden />
            段階の画面を出せません
          </p>
          <p className="text-sm break-all text-ink-2">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-line px-3 py-1 text-sm hover:bg-surface-2"
          >
            再読み込み
          </button>
        </div>
      </div>
    )
  }
}

/** プロジェクトの欄 (問題の設定の一覧から選ぶ) */
function ProjectSelect({
  items,
  error,
  project,
  onSelect,
}: {
  items: ProjectItem[]
  error: string | null
  project: string | null
  onSelect: (project: string | null) => void
}) {
  // 一覧に無い選び (消されたか, 一覧を読む前か, 読めなかった) も欄に出す
  const missing = project !== null && !items.some((item) => item.id === project)
  const note = error === null && items.length > 0 ? ' (一覧に無い)' : ''
  const change = (event: ChangeEvent<HTMLSelectElement>) =>
    onSelect(event.target.value === NONE ? null : event.target.value)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="studio-project" className="shrink-0 text-xs font-medium text-ink-2">
        プロジェクト
      </label>
      <select
        id="studio-project"
        value={project ?? NONE}
        onChange={change}
        aria-describedby={error ? 'studio-project-error' : undefined}
        className="h-8 max-w-56 min-w-0 rounded-lg border border-line bg-surface px-2 text-sm"
      >
        <option value={NONE}>選んでいない</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
        {missing && <option value={project}>{`${project}${note}`}</option>}
      </select>
      {error && (
        <span id="studio-project-error" role="alert" className="text-xs text-critical-text">
          {error}
        </span>
      )}
    </div>
  )
}

/** 段階の並び */
function StageNav({ stage, onGo }: { stage: StageKey; onGo: (stage: StageKey) => void }) {
  // 新しいタブで開くなどの操作はブラウザに任せ, 普通に押したときだけ殻が移る
  const click = (key: StageKey) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    onGo(key)
  }
  return (
    <nav aria-label="段階" className="min-w-0 overflow-x-auto">
      <ol className="flex items-center gap-1 text-sm">
        {STAGES.map((item, index) => (
          <li key={item.key} className="flex shrink-0 items-center gap-1">
            {index > 0 && (
              <span aria-hidden className="text-ink-3">
                →
              </span>
            )}
            <a
              href={stageBase(item.key)}
              onClick={click(item.key)}
              aria-current={item.key === stage ? 'step' : undefined}
              className={
                item.key === stage
                  ? 'rounded-lg bg-accent-soft px-2 py-1 font-medium text-accent-text'
                  : 'rounded-lg px-2 py-1 text-ink-2 hover:bg-surface-2'
              }
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * 殻の画面. 上に共通の帯 (名前, プロジェクトの欄, 段階の並び, 明暗の切り替え),
 * その下に経路の頭で選んだ段階の根の部品を置く
 */
export function Shell() {
  const [location, go] = useStageLocation()
  const [project, selectProject] = useSelectedProject()
  const projects = useProjects()
  const [theme, toggleTheme] = useTheme()
  const StageApp = STAGE_APPS[location.stage]
  return (
    <div className="flex h-full flex-col">
      <a
        href="#stage"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        段階の画面へ移る
      </a>
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-2">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Workflow size={20} className="text-accent" aria-hidden />
          ML-Studio
        </span>
        <ProjectSelect
          items={projects.items}
          error={projects.error}
          project={project}
          onSelect={selectProject}
        />
        <StageNav stage={location.stage} onGo={go} />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '明るい表示にする' : '暗い表示にする'}
          className="ml-auto rounded p-1 text-ink-3 hover:bg-surface-2"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      <div id="stage" tabIndex={-1} className="min-h-0 flex-1 outline-none">
        {/* 段階を移ると境界も作り直し, 前の段階の誤りを残さない */}
        <StageBoundary key={location.key}>
          <Suspense fallback={<StageLoading />}>
            <StageApp
              basename={stageBase(location.stage)}
              apiBase={stageApiBase(location.stage)}
              project={project}
              onProjectChange={selectProject}
              onProjectsChange={projects.reload}
              embedded
            />
          </Suspense>
        </StageBoundary>
      </div>
    </div>
  )
}
