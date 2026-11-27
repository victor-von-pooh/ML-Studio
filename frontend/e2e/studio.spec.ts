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

// 殻で選んだ問題の設定を引き継いでデータの分析の段階に移り, 段階の中の移動, API の呼び出し,
// 殻の明暗の切り替えが ML-Fathom の画面に効くことを確かめる
test('選んだ問題の設定を引き継いでデータの分析の段階を開く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題の設定を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('店の売上')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('プロジェクト')
  await expect(select).toHaveValue(opened)

  // 段階の並びでデータの分析に移ると, 選んだ問題の設定の欄を ML-Fathom の API から出す
  const problems = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/data/problems',
  )
  const stages = page.getByRole('navigation', { name: '段階' })
  await stages.getByRole('link', { name: 'データの分析' }).click()
  await expect(page).toHaveURL(/\/data$/)
  expect((await problems).status()).toBe(200)
  await expect(stages.getByRole('link', { name: 'データの分析' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('heading', { name: 'データ', exact: true })).toBeVisible()
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '選んだ問題の設定' }) })
  await expect(card.getByText('店の売上')).toBeVisible()
  await expect(card.getByText(new RegExp(`/${opened}/problem\\.yaml$`))).toBeVisible()
  await expect(select).toHaveValue(opened)
  // 殻の下ではアプリの名前と明暗の切り替えを出さない (殻の上の帯が持つ)
  await expect(page.getByRole('button', { name: /表示にする$/ })).toHaveCount(1)

  // 段階の中の移動は /data の下に留まり, 再読み込みしても同じ画面を開く
  const side = page.getByRole('navigation', { name: '移動' })
  const datasets = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/data/datasets',
  )
  await side.getByRole('link', { name: 'データセット' }).click()
  await expect(page).toHaveURL(/\/data\/datasets$/)
  expect((await datasets).status()).toBe(200)
  await expect(page.getByRole('heading', { name: '書き出したデータセット' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '書き出したデータセット' })).toBeVisible()
  await side.getByRole('link', { name: 'データ', exact: true }).click()
  await expect(page).toHaveURL(/\/data$/)

  // 書き込みの API も殻の確かめ (トークンと Origin) を通る
  const samples = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/data/samples',
  )
  await page.getByRole('button', { name: '見本のデータを入れる' }).click()
  expect((await samples).status()).toBe(200)
  await expect(page.getByRole('status')).toHaveText(/見本を \d+ 件登録しました/, {
    timeout: 30_000,
  })

  // 殻の明暗の切り替えが段階の画面の色に効く
  // (e2e は DOM の型を持たないので, ページの中で動かす関数を文字列で渡す)
  const color = () =>
    page.evaluate<string>(
      `getComputedStyle(document.querySelector('nav[aria-label="移動"]')).backgroundColor`,
    )
  const light = await color()
  await page.getByRole('button', { name: '暗い表示にする' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect.poll(color).not.toBe(light)
  await page.getByRole('button', { name: '明るい表示にする' }).click()
  await expect.poll(color).toBe(light)

  // 問題の設定の段階に戻ると, 同じ問題の設定を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '店の売上' })).toBeVisible()

  expect(errors).toEqual([])
})
