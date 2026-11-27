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

// 殻で選んだ問題の設定を引き継いでモデルの作成・選定の段階に移り, ML-CreateArchitecture の
// 画面が殻の問題の設定の欄を出し, 殻の明暗の切り替えがキャンバスに効くことを確かめる
test('選んだ問題の設定を引き継いでモデルの作成・選定の段階を開く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題の設定を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('部品の需要')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  // (段階の画面の「データセットとプロジェクト」のボタンと分けるため, 名前を全て合わせる)
  const select = page.getByLabel('プロジェクト', { exact: true })
  await expect(select).toHaveValue(opened)

  // 段階の並びでモデルの作成・選定に移ると, ML-CreateArchitecture の画面が API を /api/model の
  // 下に呼んで開く
  const checked = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/model/check',
  )
  const stages = page.getByRole('navigation', { name: '段階' })
  await stages.getByRole('link', { name: 'モデルの作成・選定' }).click()
  await expect(page).toHaveURL(/\/model$/)
  expect((await checked).status()).toBe(200)
  await expect(stages.getByRole('link', { name: 'モデルの作成・選定' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  const canvas = page.locator('.react-flow')
  await expect(canvas).toBeVisible()
  await expect(select).toHaveValue(opened)
  // 殻の下ではアプリの名前と明暗の切り替えを出さない (殻の上の帯が持つ)
  await expect(page.getByRole('heading', { name: 'ML-CreateArchitecture' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /表示にする$/ })).toHaveCount(1)

  // 「データセットとプロジェクト」に殻で選んだ問題の設定の欄が出る
  // (まだプロジェクトを書き出していないので, 使えない理由も出す)
  const problems = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/model/problems',
  )
  await page.getByRole('button', { name: 'データセットとプロジェクト' }).click()
  expect((await problems).status()).toBe(200)
  const dialog = page.getByRole('dialog', { name: 'データセットとプロジェクト' })
  const note = dialog.getByRole('region', { name: '選んだ問題の設定' })
  await expect(note.getByText('部品の需要')).toBeVisible()
  await expect(note.getByText(`(${opened})`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // 殻の明暗の切り替えがキャンバスの明暗 (React Flow の colorMode) に効く
  await expect(canvas).not.toHaveClass(/\bdark\b/)
  await page.getByRole('button', { name: '暗い表示にする' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(canvas).toHaveClass(/\bdark\b/)
  await page.getByRole('button', { name: '明るい表示にする' }).click()
  await expect(canvas).not.toHaveClass(/\bdark\b/)

  // 問題の設定の段階に戻ると, 同じ問題の設定を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '部品の需要' })).toBeVisible()

  expect(errors).toEqual([])
})

// 殻で選んだ問題の設定を引き継いで学習・評価の段階に移り, ML-Dashboard の画面が殻の問題の
// 設定の欄を出し, 殻の明暗の切り替えが段階の画面に効くことを確かめる
test('選んだ問題の設定を引き継いで学習・評価の段階を開く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題の設定を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('機械の故障')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('プロジェクト', { exact: true })
  await expect(select).toHaveValue(opened)

  // 段階の並びで学習・評価に移ると, ML-Dashboard の画面が API を /api/train の下に呼んで開き,
  // 殻で選んだ問題の設定を読む
  const problem = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/train/problems/${opened}/project`,
  )
  const stages = page.getByRole('navigation', { name: '段階' })
  await stages.getByRole('link', { name: '学習・評価' }).click()
  await expect(page).toHaveURL(/\/train$/)
  expect((await problem).status()).toBe(200)
  await expect(stages.getByRole('link', { name: '学習・評価' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('heading', { name: 'プロジェクト', exact: true })).toBeVisible()
  await expect(select).toHaveValue(opened)
  // 殻の下ではアプリの名前と明暗の切り替えを出さない (殻の上の帯が持つ)
  await expect(page.getByText('ML-Dashboard', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /表示にする$/ })).toHaveCount(1)

  // 殻で選んだ問題の設定の欄 (まだ学習のプロジェクトを記録していないので, 開けない理由も出す)
  const note = page.locator('section', {
    has: page.getByRole('heading', { name: '選んだ問題の設定' }),
  })
  await expect(note.getByText('機械の故障', { exact: true })).toBeVisible()
  await expect(note.getByText(opened, { exact: true })).toBeVisible()

  // 殻の明暗の切り替えが段階の画面の色 (色の変数) に効く
  await expect(note).toHaveCSS('background-color', 'rgb(252, 252, 251)')
  await page.getByRole('button', { name: '暗い表示にする' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(note).toHaveCSS('background-color', 'rgb(26, 26, 25)')
  await page.getByRole('button', { name: '明るい表示にする' }).click()
  await expect(note).toHaveCSS('background-color', 'rgb(252, 252, 251)')

  // 段階の中の移動 (左の欄のジョブ) は /train の下に留まる
  await page.getByRole('link', { name: 'ジョブ', exact: true }).click()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(page.getByRole('heading', { name: 'ジョブ', exact: true })).toBeVisible()

  // 問題の設定の段階に戻ると, 同じ問題の設定を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '機械の故障' })).toBeVisible()

  expect(errors).toEqual([])
})

// 段階の根の部品は段階ごとに分けて読む. 最初は開いた段階の分だけを読み, 各段階の頭を直に
// 開いても再読み込みしても段階の画面を出す
test('段階の画面を段階ごとに読み, 直に開いても再読み込みしても出す', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  // 読んだ段階のチャンク (ビルドの名前は根の部品のファイルの名前から付く. 各アプリの
  // 画面のパッケージの exports の `.` が src/StageApp.tsx である前提)
  const chunks = new Set<string>()
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (/\/assets\/StageApp-[^/]+\.js$/.test(path)) chunks.add(path)
  })

  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await expect(page.getByLabel(/^問題の名前/)).toBeVisible()
  expect(chunks.size).toBe(1)

  // モデルの作成・選定の頭を直に開き, 再読み込みしてもキャンバスを出す
  await page.goto('/model')
  await expect(page.locator('.react-flow')).toBeVisible()
  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(
    page
      .getByRole('navigation', { name: '段階' })
      .getByRole('link', { name: 'モデルの作成・選定' }),
  ).toHaveAttribute('aria-current', 'step')

  // データの分析の段階の中の経路を直に開き, 再読み込みしても同じ画面を出す
  await page.goto('/data/datasets')
  await expect(page.getByRole('heading', { name: '書き出したデータセット' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '書き出したデータセット' })).toBeVisible()
  expect(chunks.size).toBe(3)

  // 学習・評価の段階の中の経路を直に開き, 再読み込みしても同じ画面を出す
  await page.goto('/train/jobs')
  await expect(page.getByRole('heading', { name: 'ジョブ', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ジョブ', exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: '段階' }).getByRole('link', { name: '学習・評価' }),
  ).toHaveAttribute('aria-current', 'step')
  expect(chunks.size).toBe(4)

  expect(errors).toEqual([])
})

// 段階の画面を読めないときは, 殻の帯を残して段階の場所に理由と再読み込みのボタンを出し,
// 再読み込みで読み直す
test('段階の画面を読めないときは理由を出し, 再読み込みで読み直す', async ({ page }) => {
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await expect(page.getByLabel(/^問題の名前/)).toBeVisible()

  // 問題の設定の段階を開いた後は, 段階のチャンクを読めなくする
  await page.route(/\/assets\/StageApp-[^/]+\.js$/, (route) => route.abort())
  const stages = page.getByRole('navigation', { name: '段階' })
  await stages.getByRole('link', { name: 'データの分析' }).click()
  await expect(page).toHaveURL(/\/data$/)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('段階の画面を出せません')
  await expect(page.getByLabel('プロジェクト')).toBeVisible()

  // 読めるように戻して再読み込みすると, データの分析の段階を出す
  await page.unroute(/\/assets\/StageApp-[^/]+\.js$/)
  await alert.getByRole('button', { name: '再読み込み' }).click()
  await expect(page.getByRole('heading', { name: 'データ', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
