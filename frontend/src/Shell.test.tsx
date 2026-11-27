import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StageAppProps } from 'ml-pathfinder-frontend'

import { Shell } from './Shell'

/** 最後に描いた根の部品の props と段階のアプリ, 作った回数 */
const stage = vi.hoisted(() => ({
  props: null as StageAppProps | null,
  app: null as string | null,
  mounts: 0,
}))

/** 根の部品の代わりに, 受け取った props を覚えて出す部品を作る */
const mockStageApp = vi.hoisted(() => async (app: string) => {
  const { useEffect } = await import('react')
  return {
    StageApp: (props: StageAppProps) => {
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
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('殻の画面', () => {
  it('/ は /problem に移し, 問題の設定の根の部品に頭と殻の値を渡す', async () => {
    mockProblems([])
    render(<Shell />)
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

  it('段階の並びは 5 つの段階を出し, 載っていない段階は押せない', () => {
    mockProblems([])
    render(<Shell />)
    const nav = screen.getByRole('navigation', { name: '段階' })
    const current = screen.getByRole('link', { name: '問題の設定' })
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('link', { name: 'データの分析' })).toHaveAttribute('href', '/data')
    expect(screen.getByRole('link', { name: 'モデルの作成・選定' })).toHaveAttribute(
      'href',
      '/model',
    )
    expect(nav).toHaveTextContent('推論')
    // 押せない段階はリンクでなく, まだ載っていないと読み上げにも出す
    expect(screen.queryByRole('link', { name: /学習・評価/ })).toBeNull()
    const pending = screen.getByText('学習・評価', { exact: false })
    expect(pending).toHaveTextContent('学習・評価 (まだ載っていないので開けない)')
    expect(pending).toHaveAttribute('title', 'ML-Dashboard はまだ載っていない')
  })

  it('モデルの作成・選定を押すと, 選んだプロジェクトを引き継いで ML-CreateArchitecture の根の部品を出す', async () => {
    localStorage.setItem('studio-project', 'p1')
    mockProblems([{ id: 'p1', name: '需要' }])
    render(<Shell />)
    fireEvent.click(screen.getByRole('link', { name: 'モデルの作成・選定' }))
    expect(window.location.pathname).toBe('/model')
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

  it('データの分析を押すと, 選んだプロジェクトを引き継いで ML-Fathom の根の部品を出す', async () => {
    localStorage.setItem('studio-project', 'p1')
    mockProblems([{ id: 'p1', name: '需要' }])
    render(<Shell />)
    expect(stage.app).toBe('ML-Pathfinder')
    const length = window.history.length
    fireEvent.click(screen.getByRole('link', { name: 'データの分析' }))
    expect(window.location.pathname).toBe('/data')
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
    await waitFor(() => expect(stage.app).toBe('ML-Pathfinder'))
    expect(window.location.pathname).toBe('/problem')
  })

  it('/data で開くと, データの分析の段階から始める', () => {
    mockProblems([])
    window.history.replaceState(null, '', '/data/sources/s1')
    render(<Shell />)
    expect(window.location.pathname).toBe('/data/sources/s1')
    expect(stage.app).toBe('ML-Fathom')
    expect(stage.props?.basename).toBe('/data')
  })

  it('プロジェクトの欄で選ぶと部品に渡し, localStorage に残す', async () => {
    mockProblems([
      { id: 'p1', name: '需要' },
      { id: 'p2', name: '解約' },
    ])
    render(<Shell />)
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
    render(<Shell />)
    expect(stage.props?.project).toBe('p1')
    await screen.findByRole('option', { name: '解約' })

    fireEvent.click(screen.getByRole('button', { name: '部品の中で開く' }))
    expect(stage.props?.project).toBe('p2')
    expect(screen.getByLabelText('プロジェクト')).toHaveValue('p2')
    expect(localStorage.getItem('studio-project')).toBe('p2')
  })

  it('部品の onProjectsChange で一覧を読み直す', async () => {
    const fetchMock = mockProblems([], [{ id: 'p3', name: '新しい問題' }])
    render(<Shell />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '一覧が変わった' }))
    expect(await screen.findByRole('option', { name: '新しい問題' })).toBeInTheDocument()
  })

  it('一覧を読めないときは欄に知らせる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    render(<Shell />)
    expect(await screen.findByRole('alert')).toHaveTextContent('一覧を読めません (401)')
  })

  it('段階を押し直すと履歴を増やさずに頭に戻して部品を作り直す', () => {
    mockProblems([])
    window.history.replaceState(null, '', '/problem/problems/p1')
    render(<Shell />)
    const mounts = stage.mounts
    const length = window.history.length
    fireEvent.click(screen.getByRole('link', { name: '問題の設定' }))
    expect(window.location.pathname).toBe('/problem')
    expect(window.history.length).toBe(length)
    expect(stage.mounts).toBe(mounts + 1)

    // 修飾キー付きで押したときはブラウザに任せる
    fireEvent.click(screen.getByRole('link', { name: '問題の設定' }), { ctrlKey: true })
    expect(stage.mounts).toBe(mounts + 1)
  })

  it('戻ると進むで, 段階の中の移動では作り直さず, 殻が経路を置き換えたときは作り直す', () => {
    mockProblems([])
    render(<Shell />)
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
    expect(stage.mounts).toBe(mounts + 1)
  })

  it('一覧に無い選びも欄に出す', async () => {
    localStorage.setItem('studio-project', 'gone')
    mockProblems([{ id: 'p1', name: '需要' }])
    render(<Shell />)
    expect(await screen.findByRole('option', { name: 'gone (一覧に無い)' })).toBeInTheDocument()
    expect(screen.getByLabelText('プロジェクト')).toHaveValue('gone')
  })

  it('明暗の切り替えは html の dark と localStorage の theme に置く', () => {
    mockProblems([])
    render(<Shell />)
    fireEvent.click(screen.getByRole('button', { name: '暗い表示にする' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: '明るい表示にする' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('light')
  })
})
