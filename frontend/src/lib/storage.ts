/** 選んだ問題を残す localStorage の鍵 */
export const PROJECT_KEY = 'studio-project'

/** 明暗を残す localStorage の鍵 (5 つのアプリと同じ) */
export const THEME_KEY = 'theme'

/** localStorage から読む (読めない環境では null) */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** localStorage に書く (null は消す. 書けない環境では何もしない) */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 残せなくても画面の中の状態は替える
  }
}
