import { expect, type Page, test } from '@playwright/test'

// 段階の並びの名前 (各段階の画面の頭の見出し h1 は, このどれか 1 つ. R12 の見出し)
const STAGE_NAMES = ['問題の設定', 'データの分析', 'モデルの作成・選定', '学習・評価', '推論']

/** 段階の頭の画面の h1 が 1 つで, 開いた段階の名前 (段階の名前の 1 つ) であることを確かめる */
async function expectStageHeading(page: Page, name: string) {
  expect(STAGE_NAMES).toContain(name)
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveCount(1)
  await expect(heading).toHaveText(name)
}

/**
 * 段階の下の画面の h1 が 1 つで, パンくずの頭が段階の名前 (段階の名前の 1 つ) の段階の頭の
 * 画面へのリンクであることを確かめる (下の画面の h1 は開いた物の名前)
 */
async function expectSubHeading(page: Page, name: string) {
  expect(STAGE_NAMES).toContain(name)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  const crumbs = page.getByRole('navigation', { name: 'パンくず' })
  await expect(crumbs.getByRole('link').first()).toHaveText(name)
}

// 殻を開き, 問題の設定の段階で問題を作り, 問題の欄で選んで開く
test('問題を作り, 問題の欄で選んで開く', async ({ page }, testInfo) => {
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
  const select = page.getByLabel('問題', { exact: true })
  await expect(select).toHaveValue('')

  // 問題の設定の段階の画面で新しく作ると開き, 殻の欄にも出て選ばれる. 名前はやり直し
  // (CI の retries) と繰り返しごとに分ける (殻の置き場は起動のときに 1 度だけ消すので,
  // 前の回に作った同じ名前の問題が欄に残るため)
  const name = `総菜の需要 ${testInfo.repeatEachIndex}-${testInfo.retry}`
  await page.getByLabel(/^問題の名前/).fill(name)
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expectSubHeading(page, '問題の設定')
  const opened = new URL(page.url()).pathname.split('/').pop()!
  await expect(select.getByRole('option', { name, exact: true })).toHaveCount(1)
  await expect(select).toHaveValue(opened)

  // 選びを外すと一覧に戻り, 欄で選ぶと開く
  await select.selectOption('')
  await expect(page).toHaveURL(/\/problem$/)
  await expect(page.getByRole('heading', { name: '問題の設定', exact: true })).toBeVisible()
  await expectStageHeading(page, '問題の設定')
  await select.selectOption({ label: name })
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // 再読み込みでも選びを保つ
  await page.reload()
  await expect(select).toHaveValue(opened)
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // 知らない頭は最初の段階に移し, 選んだ問題を開く
  await page.goto('/unknown')
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // 戻るで段階に合わない経路に来ても, 殻が置き換えて段階の画面を出す
  // (e2e は DOM の型を持たないので, ページの中で動かす式を文字列で渡す)
  await page.evaluate(
    "history.pushState(null, '', '/'); dispatchEvent(new PopStateEvent('popstate'))",
  )
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name })).toBeVisible()

  expect(errors).toEqual([])
})

// 殻で選んだ問題を引き継いでデータの分析の段階に移り, 段階の中の移動, API の呼び出し,
// 殻の明暗の切り替えが ML-Fathom の画面に効くことを確かめる
test('選んだ問題を引き継いでデータの分析の段階を開く', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('店の売上')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('問題', { exact: true })
  await expect(select).toHaveValue(opened)

  // 段階の並びでデータの分析に移ると, 選んだ問題の欄を ML-Fathom の API から出す
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
  await expect(page.getByRole('heading', { name: 'データの分析', exact: true })).toBeVisible()
  await expectStageHeading(page, 'データの分析')
  const card = page.getByRole('region', { name: '選んだ問題', exact: true })
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
  // (見本は登録済みの場所を登録し直さないので, やり直しと繰り返しの 2 回目からは「登録済み」と
  // 出る. 最初の回は置き場が新しく, studio で見本を入れるのはこのテストだけで workers も 1 なので,
  // 5 件の登録を求める (登録できたのに API が空を返す誤りを拾うため). どの回でも, 全てのデータを
  // 出すと 5 つの見本が 1 つずつ並ぶ)
  await page.getByRole('button', { name: '見本のデータを入れる' }).click()
  expect((await samples).status()).toBe(200)
  const first = testInfo.retry === 0 && testInfo.repeatEachIndex === 0
  await expect(page.getByRole('status')).toHaveText(
    first ? /^見本を 5 件登録しました/ : /^(見本を \d+ 件登録しました|見本は登録済みです)/,
    { timeout: 30_000 },
  )
  await page.getByLabel(/^全てのデータを出す/).check()
  // 見本の名前は ML-Fathom の backend/src/ml_fathom/samples.py の SAMPLES の鍵
  for (const sample of [
    '顧客の解約 (表)',
    '電力の使用量 (時系列)',
    '図形 (画像)',
    'レビュー (文)',
    '物体 (点群)',
  ]) {
    await expect(page.getByRole('link', { name: sample, exact: true })).toHaveCount(1)
  }

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

  // 問題の設定の段階に戻ると, 同じ問題を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '店の売上' })).toBeVisible()

  expect(errors).toEqual([])
})

// 殻で選んだ問題を引き継いでモデルの作成・選定の段階に移り, ML-CreateArchitecture の
// 画面が殻で選んだ問題の欄を出し, 殻の明暗の切り替えがキャンバスに効くことを確かめる
test('選んだ問題を引き継いでモデルの作成・選定の段階を開く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('部品の需要')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  // (段階の画面の「問題の名前」などの欄と分けるため, 名前を全て合わせる)
  const select = page.getByLabel('問題', { exact: true })
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
  await expectStageHeading(page, 'モデルの作成・選定')
  await expect(select).toHaveValue(opened)
  // 殻の下ではアプリの名前と明暗の切り替えを出さない (殻の上の帯が持つ)
  await expect(page.getByRole('heading', { name: 'ML-CreateArchitecture' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /表示にする$/ })).toHaveCount(1)

  // 「データセットと学習のプロジェクト」に殻で選んだ問題の欄が出る
  // (まだ学習のプロジェクトを書き出していないので, 使えない理由も出す)
  const problems = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/model/problems',
  )
  await page.getByRole('button', { name: 'データセットと学習のプロジェクト', exact: true }).click()
  expect((await problems).status()).toBe(200)
  const dialog = page.getByRole('dialog', { name: 'データセットと学習のプロジェクト', exact: true })
  const note = dialog.getByRole('region', { name: '選んだ問題', exact: true })
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

  // 問題の設定の段階に戻ると, 同じ問題を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '部品の需要' })).toBeVisible()

  expect(errors).toEqual([])
})

// 殻で選んだ問題を引き継いで学習・評価の段階に移り, ML-Dashboard の画面が殻で選んだ
// 問題の欄を出し, 殻の明暗の切り替えが段階の画面に効くことを確かめる
test('選んだ問題を引き継いで学習・評価の段階を開く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('機械の故障')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('問題', { exact: true })
  await expect(select).toHaveValue(opened)

  // 段階の並びで学習・評価に移ると, ML-Dashboard の画面が API を /api/train の下に呼んで開き,
  // 殻で選んだ問題を読む
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
  await expectStageHeading(page, '学習・評価')
  await expect(select).toHaveValue(opened)
  // 殻の下ではアプリの名前と明暗の切り替えを出さない (殻の上の帯が持つ)
  await expect(page.getByText('ML-Dashboard', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /表示にする$/ })).toHaveCount(1)

  // 殻で選んだ問題の欄 (まだ学習のプロジェクトを記録していないので, 開けない理由も出す)
  const note = page.getByRole('region', { name: '選んだ問題', exact: true })
  await expect(note.getByText('機械の故障', { exact: true })).toBeVisible()
  await expect(note.getByText(opened, { exact: true })).toBeVisible()
  await expect(note.getByText(/プロジェクトの記録がありません/)).toBeVisible()

  // 殻の明暗の切り替えが段階の画面の色 (色の変数) に効く
  // (e2e は DOM の型を持たないので, ページの中で動かす関数を文字列で渡す)
  const color = () =>
    page.evaluate<string>(
      `getComputedStyle([...document.querySelectorAll('section')].find((section) => section.querySelector('h2')?.textContent === '選んだ問題')).backgroundColor`,
    )
  const light = await color()
  await page.getByRole('button', { name: '暗い表示にする' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect.poll(color).not.toBe(light)
  await page.getByRole('button', { name: '明るい表示にする' }).click()
  await expect.poll(color).toBe(light)

  // 段階の中の移動 (左の欄のジョブ) は /train の下に留まる
  await page.getByRole('link', { name: 'ジョブ', exact: true }).click()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(page.getByRole('heading', { name: 'ジョブ', exact: true })).toBeVisible()

  // 問題の設定の段階に戻ると, 同じ問題を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '機械の故障' })).toBeVisible()

  expect(errors).toEqual([])
})

// 学習・評価の段階で, ブラウザの戻ると進むが段階の中の移動と段階をまたぐ移動の両方で効き,
// 作り直した段階の画面が今の経路を読むことを確かめる
test('学習・評価の段階でブラウザの戻ると進むが段階の中と段階をまたいで効く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  const stages = page.getByRole('navigation', { name: '段階' })
  const train = stages.getByRole('link', { name: '学習・評価' })
  const projects = page.getByRole('heading', { name: 'プロジェクト', exact: true })
  const jobs = page.getByRole('heading', { name: 'ジョブ', exact: true })

  // 段階の並びで学習・評価に移り, 段階の中のリンクでジョブに移る
  await train.click()
  await expect(page).toHaveURL(/\/train$/)
  await expect(projects).toBeVisible()
  await page.getByRole('link', { name: 'ジョブ', exact: true }).click()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()

  // 段階の中で戻ると /train の画面に, 進むとジョブの画面に戻る
  await page.goBack()
  await expect(page).toHaveURL(/\/train$/)
  await expect(projects).toBeVisible()
  await expect(jobs).toHaveCount(0)
  await page.goForward()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()
  await expect(projects).toHaveCount(0)

  // 段階の並びで問題の設定に移って戻ると, 作り直した学習・評価の段階の画面が今の経路
  // (/train/jobs) を読んで出す
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(/\/problem$/)
  await expect(page.getByLabel(/^問題の名前/)).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()
  await expect(train).toHaveAttribute('aria-current', 'step')

  // 作り直した後の段階の画面でも, 段階の中の戻ると進むが効く
  await page.goBack()
  await expect(page).toHaveURL(/\/train$/)
  await expect(projects).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()

  // 段階をまたいで進むと, 問題の設定の段階の画面に戻る
  await page.goForward()
  await expect(page).toHaveURL(/\/problem$/)
  await expect(page.getByLabel(/^問題の名前/)).toBeVisible()

  expect(errors).toEqual([])
})

// 殻の欄で問題を選んだ状態でも, 段階をまたいで戻ると作り直した学習・評価の段階の画面が
// 今の経路を保つ (殻の選びに合わせる見張りが一覧に移さない) ことを確かめる
test('問題を選んだまま学習・評価の段階に戻っても今の経路を保つ', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('窯の温度')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('問題', { exact: true })
  await expect(select).toHaveValue(opened)

  const stages = page.getByRole('navigation', { name: '段階' })
  const train = stages.getByRole('link', { name: '学習・評価' })
  const jobs = page.getByRole('heading', { name: 'ジョブ', exact: true })

  // 段階の並びで学習・評価に移り, 段階の中のリンクでジョブに移る
  await train.click()
  await expect(page).toHaveURL(/\/train$/)
  await expect(page.getByRole('heading', { name: 'プロジェクト', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'ジョブ', exact: true }).click()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()

  // 問題の設定の段階に移ると, 選んだ問題を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '窯の温度' })).toBeVisible()

  // 戻ると, 作り直した学習・評価の段階の画面が選びを受け取っても /train/jobs に留まる
  await page.goBack()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()
  await expect(train).toHaveAttribute('aria-current', 'step')
  await expect(select).toHaveValue(opened)

  // 段階の中で戻ると /train に移り, 進むと /train/jobs に戻る
  await page.goBack()
  await expect(page).toHaveURL(/\/train$/)
  await page.goForward()
  await expect(page).toHaveURL(/\/train\/jobs$/)
  await expect(jobs).toBeVisible()

  // 段階をまたいで進むと, 選んだ問題の画面に戻る (一覧に移していれば, 進む先の履歴が消える)
  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '窯の温度' })).toBeVisible()

  expect(errors).toEqual([])
})

// 段階を往復しても, 外した学習・評価の段階の画面のルーターが戻ると進むの見張りを残さず,
// 作り直した画面が見張りを付け直すことを確かめる (残っても欠けても画面の見え方はすぐには
// 変わらないので, 生きている見張りの数で見る. 殻とルーターの見張りは決まった数なので等しさで比べる)
test('学習・評価の段階を往復しても戻ると進むの見張りの数が変わらない', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  // window の popstate の見張りを, 関数と capture の組で数えて window.__popstate に出す
  // (同じ組の付け直しと, 付けていない組の外しは数を変えないので, 組の集まりで数える.
  // e2e は DOM の型を持たないので, ページの中で動かす式を文字列で渡す)
  await page.addInitScript(`(() => {
    const alive = new Set()
    const key = (listener, options) => {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
      return { listener, capture }
    }
    const find = (listener, capture) =>
      [...alive].find((item) => item.listener === listener && item.capture === capture)
    const add = window.addEventListener
    const remove = window.removeEventListener
    window.addEventListener = function (type, listener, options) {
      if (type === 'popstate' && listener) {
        const { capture } = key(listener, options)
        if (!find(listener, capture)) alive.add({ listener, capture })
      }
      return add.call(this, type, listener, options)
    }
    window.removeEventListener = function (type, listener, options) {
      if (type === 'popstate' && listener) {
        const item = find(listener, key(listener, options).capture)
        if (item) alive.delete(item)
      }
      return remove.call(this, type, listener, options)
    }
    Object.defineProperty(window, '__popstate', { get: () => alive.size })
  })()`)
  const watchers = () => page.evaluate<number>('window.__popstate')

  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  const stages = page.getByRole('navigation', { name: '段階' })
  const projects = page.getByRole('heading', { name: 'プロジェクト', exact: true })

  // 最初に学習・評価の段階を開いたときの見張りの数
  await stages.getByRole('link', { name: '学習・評価' }).click()
  await expect(page).toHaveURL(/\/train$/)
  await expect(projects).toBeVisible()
  const first = await watchers()
  // 数える仕掛けが効いている (殻とルーターの見張りが見える)
  expect(first).toBeGreaterThan(0)

  // 問題の設定と学習・評価を 3 度往復しても, 見張りの数が最初と同じ
  for (let round = 0; round < 3; round += 1) {
    await stages.getByRole('link', { name: '問題の設定' }).click()
    await expect(page).toHaveURL(/\/problem$/)
    await expect(page.getByLabel(/^問題の名前/)).toBeVisible()
    await stages.getByRole('link', { name: '学習・評価' }).click()
    await expect(page).toHaveURL(/\/train$/)
    await expect(projects).toBeVisible()
  }
  expect(await watchers()).toBe(first)

  expect(errors).toEqual([])
})

// 殻で選んだ問題を引き継いで推論の段階に移り, ML-Provide の画面が実験の一覧を殻の
// 問題で絞り, 殻の明暗の切り替えが段階の画面に効くことを確かめる
test('選んだ問題を引き継いで推論の段階を開く', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 問題を作って殻の欄で選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByLabel(/^問題の名前/).fill('解約の見込み')
  await page.getByRole('button', { name: '作る', exact: true }).click()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('問題', { exact: true })
  await expect(select).toHaveValue(opened)

  // 段階の並びで推論に移ると, ML-Provide の画面が API を /api/infer の下に呼んで開く
  const bundles = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/infer/bundles',
  )
  const stages = page.getByRole('navigation', { name: '段階' })
  await stages.getByRole('link', { name: '推論' }).click()
  await expect(page).toHaveURL(/\/infer$/)
  expect((await bundles).status()).toBe(200)
  await expect(stages.getByRole('link', { name: '推論' })).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('heading', { name: '推論の一式', exact: true })).toBeVisible()
  await expectStageHeading(page, '推論')
  await expect(select).toHaveValue(opened)
  // 殻の下ではアプリの名前と明暗の切り替えを出さない (殻の上の帯が持つ)
  await expect(page.getByText('ML-Provide', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /表示にする$/ })).toHaveCount(1)

  // 実験の一覧は殻で選んだ問題で絞る (まだ実験が無いので, 無いと出す)
  const experiments = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/infer/experiments' && url.searchParams.get('project') === opened
  })
  await page.getByRole('button', { name: '実験の一覧から登録' }).click()
  expect((await experiments).status()).toBe(200)
  const dialog = page.getByRole('dialog', { name: '実験の一覧から登録' })
  await expect(dialog.getByText(`選んだ問題 ${opened}`)).toBeVisible()
  await expect(dialog.getByText(/一式を持つ実験がありません/)).toBeVisible()
  await dialog.getByRole('button', { name: '閉じる' }).click()
  await expect(dialog).toHaveCount(0)

  // 殻の明暗の切り替えが段階の画面の色 (色の変数) に効く
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

  // 段階の中の移動 (左の欄の結果) は /infer の下に留まる
  await page.getByRole('link', { name: '結果', exact: true }).click()
  await expect(page).toHaveURL(/\/infer\/results$/)
  await expect(page.getByRole('heading', { name: '結果', exact: true })).toBeVisible()

  // 問題の設定の段階に戻ると, 同じ問題を開く
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${opened}$`))
  await expect(page.getByRole('heading', { name: '解約の見込み' })).toBeVisible()

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
  await expectStageHeading(page, 'モデルの作成・選定')
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
  await expectSubHeading(page, 'データの分析')
  expect(chunks.size).toBe(3)

  // 学習・評価の段階の中の経路を直に開き, 再読み込みしても同じ画面を出す
  await page.goto('/train/jobs')
  await expect(page.getByRole('heading', { name: 'ジョブ', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ジョブ', exact: true })).toBeVisible()
  await expectSubHeading(page, '学習・評価')
  await expect(
    page.getByRole('navigation', { name: '段階' }).getByRole('link', { name: '学習・評価' }),
  ).toHaveAttribute('aria-current', 'step')
  expect(chunks.size).toBe(4)

  // 推論の段階の中の経路を直に開き, 再読み込みしても同じ画面を出す
  await page.goto('/infer/results')
  await expect(page.getByRole('heading', { name: '結果', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '結果', exact: true })).toBeVisible()
  await expectSubHeading(page, '推論')
  await expect(
    page.getByRole('navigation', { name: '段階' }).getByRole('link', { name: '推論' }),
  ).toHaveAttribute('aria-current', 'step')
  expect(chunks.size).toBe(5)

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
  await expect(page.getByLabel('問題', { exact: true })).toBeVisible()

  // 読めるように戻して再読み込みすると, データの分析の段階を出す
  await page.unroute(/\/assets\/StageApp-[^/]+\.js$/)
  await alert.getByRole('button', { name: '再読み込み' }).click()
  await expect(page.getByRole('heading', { name: 'データの分析', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

// モデルの作成・選定の段階で, 殻の上の帯に focus があるときのキーが段階の中身を変えないこと
// (R9) と, 書きかけのまま段階を移って戻るか殻の欄で問題を替えて戻ると下書きから
// 戻せること (R10) を確かめる
test('殻の帯のキーで段階の中身を変えず, 書きかけを下書きから戻せる', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // 確かめの窓は, 書きかけのまま読み込み直すときの離れる前の確かめだけが出る (下書きを
  // 開くときは今の変更が無い). 他が出たら誤りとして断る
  let leaving = false
  page.on('dialog', (dialog) => {
    if (leaving && dialog.type() === 'beforeunload') {
      void dialog.accept()
      return
    }
    errors.push(`想定しない確かめ: ${dialog.message()}`)
    void dialog.dismiss()
  })

  // 殻の欄で替える 2 つの問題を作り, 後で替える先から作って, 書きかけの元を選ぶ
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  const select = page.getByLabel('問題', { exact: true })
  const created: string[] = []
  for (const name of ['替える先の需要', '書きかけの需要']) {
    await page.getByLabel(/^問題の名前/).fill(name)
    await page.getByRole('button', { name: '作る', exact: true }).click()
    await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    const id = new URL(page.url()).pathname.split('/').pop()!
    // 殻は一覧を読み直してから作った問題を採るので, 欄で選ばれるまで待ってから外す
    await expect(select).toHaveValue(id)
    created.push(id)
    await select.selectOption('')
    await expect(page).toHaveURL(/\/problem$/)
  }
  const [other, own] = created
  await select.selectOption(own)
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${own}$`))
  const stages = page.getByRole('navigation', { name: '段階' })
  await stages.getByRole('link', { name: 'モデルの作成・選定' }).click()
  await expect(page).toHaveURL(/\/model$/)

  // x → relu1 を置いて選ぶ (書きかけになる)
  await page.locator('[data-id="x"]').click()
  await page.getByPlaceholder('部品を探す').fill('nn.ReLU')
  await page.getByPlaceholder('部品を探す').press('Enter')
  const relu = page.locator('[data-id="relu1"]')
  await expect(relu).toBeVisible()
  await expect(page.getByRole('button', { name: '保存 *' })).toBeVisible()
  await relu.click()

  // R9: 殻の帯のボタンに focus を置いて押したキーは, 1 つずつ中身を変えない
  const theme = page.getByRole('button', { name: /表示にする$/ })
  const edges = page.locator('.react-flow__edge')
  await expect(edges).toHaveCount(1)
  await theme.focus()
  for (const key of ['Delete', 'Backspace']) {
    // 選んだ relu1 を消さない
    await page.keyboard.press(key)
    await expect(theme).toBeFocused()
    await expect(relu).toHaveCount(1)
    await expect(edges).toHaveCount(1)
  }
  // 何も消していない状態の元に戻すで, 置いた relu1 を消さない
  await page.keyboard.press('ControlOrMeta+z')
  await expect(theme).toBeFocused()
  await expect(relu).toHaveCount(1)
  await expect(edges).toHaveCount(1)

  // 対照: 段階の中に focus を戻すと, 同じキーで消え, 元に戻すで戻る
  await relu.click()
  await page.keyboard.press('Delete')
  await expect(relu).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(relu).toBeVisible()

  // R10: 待たずに段階を移って戻ると, 書きかけを下書きから戻せる
  await stages.getByRole('link', { name: '問題の設定' }).click()
  await expect(page).toHaveURL(new RegExp(`/problem/problems/${own}$`))
  await stages.getByRole('link', { name: 'モデルの作成・選定' }).click()
  await expect(page).toHaveURL(/\/model$/)
  await expect(page.locator('[data-id="x"]')).toBeVisible()
  await expect(relu).toHaveCount(0)
  const draft = page.getByRole('region', { name: '保存していない定義の下書き' })
  await expect(draft).toBeVisible()
  await draft.getByRole('button', { name: '下書きを開く' }).click()
  await expect(relu).toBeVisible()
  await expect(page.getByRole('button', { name: '保存 *' })).toBeVisible()

  // R10: 書きかけのまま殻の欄で問題を替えると, 部品は外れず待たずに下書きに書く.
  // 保存する名前を打った直後に替えて戻し, 少し待って書く分を待たずに読み込み直しても
  // (待っている書き込みは読み込み直しで消える), 打った名前ごと下書きから戻せる
  const saveName = page.getByLabel('保存する名前')
  await saveName.fill('r10_project')
  await select.selectOption(other)
  await expect(select).toHaveValue(other)
  await expect(page).toHaveURL(/\/model$/)
  await expect(relu).toBeVisible()
  await select.selectOption(own)
  await expect(select).toHaveValue(own)
  leaving = true
  await page.reload()
  leaving = false
  await expect(select).toHaveValue(own)
  await expect(page.locator('[data-id="x"]')).toBeVisible()
  await expect(relu).toHaveCount(0)
  await expect(draft).toContainText('r10_project')
  await draft.getByRole('button', { name: '下書きを開く' }).click()
  await expect(relu).toBeVisible()
  await expect(saveName).toHaveValue('r10_project')
  await expect(page.getByRole('button', { name: '保存 *' })).toBeVisible()

  expect(errors).toEqual([])
})
