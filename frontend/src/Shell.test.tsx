import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StageAppProps } from 'ml-pathfinder-frontend'

import { Shell } from './Shell'

/** 最後に描いた根の部品の props と段階のアプリ, 作った回数, 描くと例外を出すアプリ */
const stage = vi.hoisted(() => ({
  props: null as StageAppProps | null,
  app: null as string | null,
  mounts: 0,
  fail: null as string | null,
}))

/** 根の部品の代わりに, 受け取った props を覚えて出す部品を作る */
const mockStageApp = vi.hoisted(() => async (app: string) => {
  const { useEffect } = await import('react')
  return {
    StageApp: (props: StageAppProps) => {
      if (stage.fail === app) throw new Error(`${app} の画面の誤り`)
      stage.props = props
      stage.app = app
      useEffect(() => {
        stage.mounts += 1
      }, [])
      return (
        <div>
          <p>
            {app} project: {props.project ?? '(none)'}
          </p>
          <button type="button" onClick={() => props.onProjectChange('p2')}>
            部品の中で開く
          </button>
          <button type="button" onClick={() => props.onProjectsChange()}>
            一覧が変わった
          </button>
        </div>
      )
    },
  }
})

vi.mock('ml-pathfinder-frontend', () => mockStageApp('ML-Pathfinder'))
vi.mock('ml-fathom-frontend', () => mockStageApp('ML-Fathom'))
vi.mock('ml-createarchitecture-frontend', () => mockStageApp('ML-CreateArchitecture'))
vi.mock('ml-dashboard-frontend', () => mockStageApp('ML-Dashboard'))

/** 一覧の API の応答 (呼ばれるたびに次の一覧を返す) */
function mockProblems(...lists: { id: string; name: string }[][]) {
  const fetchMock = vi.fn(async () => {
    const body = lists.length > 1 ? lists.shift() : lists[0]
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  stage.props = null
  stage.app = null
  stage.mounts = 0
  stage.fail = null
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * 段階のアプリの根の部品を画面に出すまで待つ (根の部品は段階ごとに分けて読み,
 * React は読み込み中の表示を少しの間保つので, 描いた後の画面を見る)
 */
async function waitForStage(app?: string) {
  await waitFor(() => {
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText(new RegExp(`^${app ?? '.+'} project:`))).toBeInTheDocument()
  })
}

/** 殻を描き, 段階の根の部品を出すまで待つ */
async function renderShell() {
  render(<Shell />)
  await waitForStage()
}

describe('殻の画面', () => {
  it('/ は /problem に移し, 問題の設定の根の部品に頭と殻の値を渡す', async () => {
    mockProblems([])
    await renderShell()
    expect(window.location.pathname).toBe('/problem')
    expect(stage.props).toMatchObject({
      basename: '/problem',
      apiBase: '/api/problem',
      project: null,
      embedded: true,
    })
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/problem/problems', expect.anything()),
    )
  })

  it('段階の並びは 5 つの段階を出し, 載っていない段階は押せない', async () => {
    mockProblems([])
    await renderShell()
    const nav = screen.getByRole('navigation', { name: '段階' })
    const current = screen.getByRole('link', { name: '問題の設定' })
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('link', { name: 'データの分析' })).toHaveAttribute('href', '/data')
    expect(screen.getByRole('link', { name: 'モデルの作成・選定' })).toHaveAttribute(
      'href',
      '/model',
    )
    expect(screen.getByRole('link', { name: '学習・評価' })).toHaveAttribute('href', '/train')
    expect(nav).toHaveTextContent('推論')
    // 押せない段階はリンクでなく, まだ載っていないと読み上げにも出す
    expect(screen.queryByRole('link', { name: /推論/ })).toBeNull()
    const pending = screen.getByText('推論', { exact: false })
    expect(pending).toHaveTextContent('推論 (まだ載っていないので開けない)')
    expect(pending).toHaveAttribute('title', 'ML-Provide はまだ載っていない')
  })

  it('モデルの作成・選定を押すと, 選んだプロジェクトを引き継いで ML-CreateArchitecture の根の部品を出す', async () => {
    localStorage.setItem('studio-project', 'p1')
    mockProblems([{ id: 'p1', name: '需要' }])
    await renderShell()
    fireEvent.click(screen.getByRole('link', { name: 'モデルの作成・選定' }))
    expect(window.location.pathname).toBe('/model')
    await waitForStage('ML-CreateArchitecture')
    expect(screen.getByRole('link', { name: 'モデルの作成・選定' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(stage.app).toBe('ML-CreateArchitecture')
    expect(stage.props).toMatchObject({
      basename: '/model',
      apiBase: '/api/model',
      project: 'p1',
      embedded: true,
    })

    // 部品の onProjectChange で殻の選びを替える
    await screen.findByRole('option', { name: '需要' })
    fireEvent.click(screen.getByRole('button', { name: '部品の中で開く' }))
    expect(stage.props?.project).toBe('p2')
    expect(localStorage.getItem('studio-project')).toBe('p2')
  })

  it('学習・評価を押すと, 選んだプロジェクトを引き継いで ML-Dashboard の根の部品を出す', async () => {
    localStorage.setItem('studio-project', 'p1')
    mockProblems([{ id: 'p1', name: '需要' }])
    await renderShell()
    fireEvent.click(screen.getByRole('link', { name: '学習・評価' }))
    expect(window.location.pathname).toBe('/train')
    await waitForStage('ML-Dashboard')
    expect(screen.getByRole('link', { name: '学習・評価' })).toHaveAttribute('aria-current', 'step')
    expect(stage.props).toMatchObject({
      basename: '/train',
      apiBase: '/api/train',
      project: 'p1',
      embedded: true,
    })

    // 部品の onProjectChange で殻の選びを替える
    await screen.findByRole('option', { name: '需要' })
    fireEvent.click(screen.getByRole('button', { name: '部品の中で開く' }))
    expect(stage.props?.project).toBe('p2')
    expect(localStorage.getItem('studio-project')).toBe('p2')
  })

  it('データの分析を押すと, 選んだプロジェクトを引き継いで ML-Fathom の根の部品を出す', async () => {
    localStorage.setItem('studio-project', 'p1')
    mockProblems([{ id: 'p1', name: '需要' }])
    await renderShell()
    expect(stage.app).toBe('ML-Pathfinder')
    const length = window.history.length
    fireEvent.click(screen.getByRole('link', { name: 'データの分析' }))
    expect(window.location.pathname).toBe('/data')
    await waitForStage('ML-Fathom')
    expect(window.history.length).toBe(length + 1)
    expect(screen.getByRole('link', { name: 'データの分析' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(stage.app).toBe('ML-Fathom')
    expect(stage.props).toMatchObject({
      basename: '/data',
      apiBase: '/api/data',
      project: 'p1',
      embedded: true,
    })

    // 部品の onProjectChange で殻の選びを替える
    await screen.findByRole('option', { name: '需要' })
    fireEvent.click(screen.getByRole('button', { name: '部品の中で開く' }))
    expect(stage.props?.project).toBe('p2')
    expect(localStorage.getItem('studio-project')).toBe('p2')

    // 戻ると問題の設定の段階を作り直す
    act(() => {
      window.history.back()
    })
    await waitForStage('ML-Pathfinder')
    expect(window.location.pathname).toBe('/problem')
  })

  it('/data で開くと, データの分析の段階から始める', async () => {
    mockProblems([])
    window.history.replaceState(null, '', '/data/sources/s1')
    await renderShell()
    expect(window.location.pathname).toBe('/data/sources/s1')
    expect(stage.app).toBe('ML-Fathom')
    expect(stage.props?.basename).toBe('/data')
  })

  it('/model で開くと, モデルの作成・選定の段階から始める', async () => {
    mockProblems([])
    window.history.replaceState(null, '', '/model')
    await renderShell()
    expect(window.location.pathname).toBe('/model')
    expect(stage.app).toBe('ML-CreateArchitecture')
    expect(stage.props?.basename).toBe('/model')
    expect(stage.props?.apiBase).toBe('/api/model')
  })

  it('/train の下で開くと, 学習・評価の段階から始める', async () => {
    mockProblems([])
    window.history.replaceState(null, '', '/train/projects/x')
    await renderShell()
    expect(window.location.pathname).toBe('/train/projects/x')
    expect(stage.app).toBe('ML-Dashboard')
    expect(stage.props?.basename).toBe('/train')
    expect(stage.props?.apiBase).toBe('/api/train')
  })

  it('プロジェクトの欄で選ぶと部品に渡し, localStorage に残す', async () => {
    mockProblems([
      { id: 'p1', name: '需要' },
      { id: 'p2', name: '解約' },
    ])
    await renderShell()
    const select = screen.getByLabelText('プロジェクト')
    await screen.findByRole('option', { name: '解約' })
    fireEvent.change(select, { target: { value: 'p2' } })
    expect(stage.props?.project).toBe('p2')
    expect(localStorage.getItem('studio-project')).toBe('p2')

    // 選んでいない形に戻す
    fireEvent.change(select, { target: { value: '' } })
    expect(stage.props?.project).toBeNull()
    expect(localStorage.getItem('studio-project')).toBeNull()
  })

  it('残した選びで始め, 部品の onProjectChange で殻の選びを替える', async () => {
    localStorage.setItem('studio-project', 'p1')
    mockProblems([
      { id: 'p1', name: '需要' },
      { id: 'p2', name: '解約' },
    ])
    await renderShell()
    expect(stage.props?.project).toBe('p1')
    await screen.findByRole('option', { name: '解約' })

    fireEvent.click(screen.getByRole('button', { name: '部品の中で開く' }))
    expect(stage.props?.project).toBe('p2')
    expect(screen.getByLabelText('プロジェクト')).toHaveValue('p2')
    expect(localStorage.getItem('studio-project')).toBe('p2')
  })

  it('部品の onProjectsChange で一覧を読み直す', async () => {
    const fetchMock = mockProblems([], [{ id: 'p3', name: '新しい問題' }])
    await renderShell()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '一覧が変わった' }))
    expect(await screen.findByRole('option', { name: '新しい問題' })).toBeInTheDocument()
  })

  it('一覧を読めないときは欄に知らせる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    await renderShell()
    expect(await screen.findByRole('alert')).toHaveTextContent('一覧を読めません (401)')
  })

  it('段階を押し直すと履歴を増やさずに頭に戻して部品を作り直す', async () => {
    mockProblems([])
    window.history.replaceState(null, '', '/problem/problems/p1')
    await renderShell()
    const mounts = stage.mounts
    const length = window.history.length
    fireEvent.click(screen.getByRole('link', { name: '問題の設定' }))
    expect(window.location.pathname).toBe('/problem')
    expect(window.history.length).toBe(length)
    await waitFor(() => expect(stage.mounts).toBe(mounts + 1))

    // 修飾キー付きで押したときはブラウザに任せる
    fireEvent.click(screen.getByRole('link', { name: '問題の設定' }), { ctrlKey: true })
    expect(stage.mounts).toBe(mounts + 1)
  })

  it('戻ると進むで, 段階の中の移動では作り直さず, 殻が経路を置き換えたときは作り直す', async () => {
    mockProblems([])
    await renderShell()
    const mounts = stage.mounts

    // 段階の中の経路 (部品のルーターが読む)
    act(() => {
      window.history.pushState(null, '', '/problem/problems/p1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(stage.mounts).toBe(mounts)

    // 段階に合わない経路に戻ると, 最初の段階の頭に置き換えて作り直す
    act(() => {
      window.history.pushState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(window.location.pathname).toBe('/problem')
    await waitFor(() => expect(stage.mounts).toBe(mounts + 1))
  })

  it('一覧に無い選びも欄に出す', async () => {
    localStorage.setItem('studio-project', 'gone')
    mockProblems([{ id: 'p1', name: '需要' }])
    await renderShell()
    expect(await screen.findByRole('option', { name: 'gone (一覧に無い)' })).toBeInTheDocument()
    expect(screen.getByLabelText('プロジェクト')).toHaveValue('gone')
  })

  it('段階の画面を読む間は, 殻の帯を出したまま段階の場所に読み込み中と出す', async () => {
    mockProblems([])
    // 前のテストで読んだ根の部品を覚えていない殻を読み直す
    vi.resetModules()
    const { Shell: FreshShell } = await import('./Shell')
    render(<FreshShell />)
    expect(screen.getByRole('navigation', { name: '段階' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('段階の画面を読み込んでいます')
    await waitForStage('ML-Pathfinder')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('段階の画面を出せないときは, 殻の帯を残して理由を出し, 別の段階に移ると出し直す', async () => {
    // React と境界が出す誤りの記録を抑える
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockProblems([])
    stage.fail = 'ML-Fathom'
    window.history.replaceState(null, '', '/data')
    render(<Shell />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('段階の画面を出せません')
    expect(alert).toHaveTextContent('ML-Fathom の画面の誤り')
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
    expect(screen.getByLabelText('プロジェクト')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '問題の設定' }))
    await waitForStage('ML-Pathfinder')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('段階の画面を読めないときも, 殻の帯を残して理由を出す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockProblems([])
    window.history.replaceState(null, '', '/data')
    // データの分析の段階の画面を読めない殻を読み直す
    vi.resetModules()
    vi.doMock('ml-fathom-frontend', () => Promise.reject(new Error('チャンクを読めない')))
    try {
      const { Shell: FreshShell } = await import('./Shell')
      render(<FreshShell />)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('段階の画面を出せません')
      // (理由の文は vitest が包むので, 出せないことだけを見る)
      expect(screen.getByRole('navigation', { name: '段階' })).toBeInTheDocument()
    } finally {
      vi.doMock('ml-fathom-frontend', () => mockStageApp('ML-Fathom'))
    }
  })

  it('明暗の切り替えは html の dark と localStorage の theme に置く', async () => {
    mockProblems([])
    await renderShell()
    fireEvent.click(screen.getByRole('button', { name: '暗い表示にする' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: '明るい表示にする' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('light')
  })
})
