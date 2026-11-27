import { useCallback, useState } from 'react'

import { THEME_KEY, writeStorage } from './storage'

/** 明暗 */
export type Theme = 'light' | 'dark'

/** 今の明暗 (html のクラス. index.html が描画の前に決める) を読む */
function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * 明暗と切り替える関数
 *
 * html のクラス `dark` と localStorage の `theme` に置く (5 つのアプリと同じ場所にして,
 * 段階の部品がクラスの変化を見て読み直せるように)
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    writeStorage(THEME_KEY, next)
    setTheme(next)
  }, [])

  return [theme, toggle]
}
