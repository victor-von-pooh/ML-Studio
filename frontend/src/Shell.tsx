import { Moon, Sun, Workflow } from 'lucide-react'
import { StageApp as DataStageApp } from 'ml-fathom-frontend'
import { StageApp as ProblemStageApp } from 'ml-pathfinder-frontend'
import type { ChangeEvent, MouseEvent } from 'react'

import { useStageLocation } from './lib/location'
import { useProjects, useSelectedProject, type ProjectItem } from './lib/projects'
import { useTheme } from './lib/theme'
import { STAGES, stageApiBase, stageBase, type StageKey } from './stages'

/** 選んでいないことを表すプロジェクトの欄の値 */
const NONE = ''

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

/** 段階の並び (載っていない段階は押せず, まだ載っていないと出す) */
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
            {item.available ? (
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
            ) : (
              <span
                title={`${item.app} はまだ載っていない`}
                className="cursor-not-allowed rounded-lg px-2 py-1 text-ink-3"
              >
                {item.label}
                <span className="sr-only"> (まだ載っていないので開けない)</span>
                <span aria-hidden className="ml-1 rounded border border-line px-1 text-[10px]">
                  準備中
                </span>
              </span>
            )}
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
        {location.stage === 'problem' && (
          <ProblemStageApp
            key={location.key}
            basename={stageBase('problem')}
            apiBase={stageApiBase('problem')}
            project={project}
            onProjectChange={selectProject}
            onProjectsChange={projects.reload}
            embedded
          />
        )}
        {location.stage === 'data' && (
          <DataStageApp
            key={location.key}
            basename={stageBase('data')}
            apiBase={stageApiBase('data')}
            project={project}
            onProjectChange={selectProject}
            onProjectsChange={projects.reload}
            embedded
          />
        )}
      </div>
    </div>
  )
}
