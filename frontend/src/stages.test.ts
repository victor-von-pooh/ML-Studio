import { readStage } from './lib/location'
import { STAGES, stageApiBase, stageBase, stageFromPath } from './stages'

describe('段階の選び方', () => {
  it('経路の最初の区切りで, 殻に載っている段階を選ぶ', () => {
    expect(stageFromPath('/problem')).toBe('problem')
    expect(stageFromPath('/problem/problems/abc')).toBe('problem')
    expect(stageFromPath('/')).toBeNull()
    expect(stageFromPath('/unknown')).toBeNull()
    // 頭の一部だけが合うものは選ばない
    expect(stageFromPath('/problems')).toBeNull()
    expect(stageFromPath('/data')).toBe('data')
    expect(stageFromPath('/data/sources/abc')).toBe('data')
    expect(stageFromPath('/model')).toBe('model')
    expect(stageFromPath('/train')).toBe('train')
    expect(stageFromPath('/train/projects/abc')).toBe('train')
    // まだ載っていない段階は選ばない
    expect(stageFromPath('/infer')).toBeNull()
  })

  it('5 つの段階を決まった順で並べ, 頭を段階の鍵から作る', () => {
    expect(STAGES.map((stage) => stage.key)).toEqual(['problem', 'data', 'model', 'train', 'infer'])
    expect(stageBase('problem')).toBe('/problem')
    expect(stageApiBase('problem')).toBe('/api/problem')
    expect(stageBase('data')).toBe('/data')
    expect(stageApiBase('data')).toBe('/api/data')
    expect(stageBase('model')).toBe('/model')
    expect(stageApiBase('model')).toBe('/api/model')
    expect(stageBase('train')).toBe('/train')
    expect(stageApiBase('train')).toBe('/api/train')
  })

  it('段階に合わない経路は最初の段階の頭に置き換える', () => {
    window.history.replaceState(null, '', '/')
    expect(readStage()).toBe('problem')
    expect(window.location.pathname).toBe('/problem')

    window.history.replaceState(null, '', '/infer/x')
    expect(readStage()).toBe('problem')
    expect(window.location.pathname).toBe('/problem')

    // 段階の中の経路はそのまま
    window.history.replaceState(null, '', '/problem/problems/abc')
    expect(readStage()).toBe('problem')
    expect(window.location.pathname).toBe('/problem/problems/abc')
  })
})
