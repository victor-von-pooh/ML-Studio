import { expect, test } from '@playwright/test'

// 殻を開き, 問題の設定の段階で問題を作り, プロジェクトの欄で選んで開く
test('問題の設定を作り, プロジェクトの欄で選んで開く', async ({ page }) => {
  // 画面の例外と console の誤り (React を 2 つ読んだときなど) を集める
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // トークンを Cookie に置き, / から最初の段階に移る
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  const stages = page.getByRole('navigation', { name: '段階' })
  await expect(stages.getByRole('link', { name: '問題の設定' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  const select = page.getByLabel('プロジェクト')
  await expect(select).toHaveValue('')

  // 問題の設定の段階の画面で新しく作ると開き, 殻の欄にも出て選ばれる
  await page.getByLabel(/^問題の名前/).fill('総菜の需要')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  await expect(page.getByRole('heading', { name: '総菜の需要' })).toBeVisible()
  const opened = new URL(page.url()).pathname.split('/').pop()!
  await expect(select.getByRole('option', { name: '総菜の需要' })).toHaveCount(1)
  await expect(select).toHaveValue(opened)

  // 選びを外すと一覧に戻り, 欄で選ぶと開く
  await select.selectOption('')
  await expect(page).toHaveURL(/\/problem$/)
  await expect(page.getByRole('heading', { name: '問題の設定', exact: true })).toBeVisible()
  await select.selectOption({ label: '総菜の需要' })
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '総菜の需要' })).toBeVisible()

  // 再読み込みでも選びを保つ
  await page.reload()
  await expect(select).toHaveValue(opened)
  await expect(page.getByRole('heading', { name: '総菜の需要' })).toBeVisible()

  // 知らない頭は最初の段階に移し, 選んだ問題の設定を開く
  await page.goto('/unknown')
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '総菜の需要' })).toBeVisible()

  // 戻るで段階に合わない経路に来ても, 殻が置き換えて段階の画面を出す
  // (e2e は DOM の型を持たないので, ページの中で動かす式を文字列で渡す)
  await page.evaluate(
    "history.pushState(null, '', '/'); dispatchEvent(new PopStateEvent('popstate'))",
  )
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '総菜の需要' })).toBeVisible()

  expect(errors).toEqual([])
})
