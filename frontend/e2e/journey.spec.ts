import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

// 小さな見本で 5 つの段階を画面で通す. 前の段階の結果 (問題の設定に記録した学習の
// プロジェクト, 書き出したデータセット, 保存したモデルの定義, 学習の実験) を次の段階が
// 殻で選んだ問題の設定から読むことを確かめ, 段階の間で値やファイルを手で写さない.
// テストが決めるのは, 問題の設定に入れる手元のデータと学習のプロジェクトの書き出し先の
// 2 つの場所だけ (どちらも段階の外から来る値). 推論するデータは, 学習に使ったデータセットの
// テスト用の分割を推論の段階の画面で選ぶ

/** 段階の並びで段階に移る */
async function goStage(page: Page, name: string, path: RegExp) {
  await page.getByRole('navigation', { name: '段階' }).getByRole('link', { name }).click()
  await expect(page).toHaveURL(path)
}

/**
 * 解約の引き止めの見本と同じ列の小さな表 (会員ごとに 1 行). 書き出した学習のスクリプトが
 * 数の列だけを読むので, 種類の列 (plan) も数で書く
 */
function churnTable(): string {
  const rows = ['member_id,plan,months,inquiries,monthly_fee,churned']
  for (let i = 0; i < 80; i++) {
    const plan = i % 3
    const months = 1 + ((i * 7) % 36)
    const inquiries = (i * 5) % 6
    const fee = 1000 + plan * 500
    // 問い合わせが多く, 入って短い会員が解約する
    const churned = inquiries >= 3 && months < 20 ? 'yes' : 'no'
    rows.push(`m${i},${plan},${months},${inquiries},${fee},${churned}`)
  }
  return rows.join('\n') + '\n'
}

test('小さな見本で 5 つの段階を通し, 前の段階の結果を次の段階が読む', async ({
  page,
}, testInfo) => {
  // 学習を含むので長めに待つ
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // この流れでは確かめの窓 (window.confirm など) は出ない. 出たら誤りとして断る
  page.on('dialog', (dialog) => {
    errors.push(`想定しない確かめ: ${dialog.message()}`)
    void dialog.dismiss()
  })

  // やり直し (CI の retries) と繰り返しごとに別の場所に書き出す (殻の置き場は起動のときに
  // 1 度だけ消すので, 同じ場所だと前の書き出しや登録が残り, 上書きの確かめで止まるため)
  const work = `${process.cwd()}/e2e/.work/journey-${testInfo.repeatEachIndex}-${testInfo.retry}`
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const table = `${work}/churn.csv`
  writeFileSync(table, churnTable())
  const projectDir = `${work}/project`

  // 1. 問題の設定: 見本を開くと殻の欄で選ばれ, 手元のデータを入れて学習のプロジェクトを書き出す
  await page.goto('/api/auth?token=e2e-token')
  await expect(page).toHaveURL(/\/problem$/)
  await page.getByRole('button', { name: '解約の引き止め' }).click()
  await expect(page.getByRole('heading', { name: '解約の引き止め' })).toBeVisible()
  await expect(page).toHaveURL(/\/problem\/problems\/[^/]+$/)
  const opened = new URL(page.url()).pathname.split('/').pop()!
  const select = page.getByLabel('プロジェクト', { exact: true })
  await expect(select).toHaveValue(opened)

  await page
    .getByRole('navigation', { name: '問いの節' })
    .getByRole('button', { name: /^5\b/ })
    .click()
  await page.getByRole('button', { name: 'データを入れる' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByLabel('パス').fill(table)
  await picker.getByRole('button', { name: '移動' }).click()
  await picker.getByRole('button', { name: '選ぶ', exact: true }).click()
  await expect(page.getByText('80 行, 6 列')).toBeVisible({ timeout: 20_000 })
  // 小さな表なので「見直す」の確かめは出るが, 直すところは無く書き出せる
  const write = page.getByRole('button', { name: '学習のプロジェクトを書き出す' })
  await expect(write).toBeEnabled()

  await write.click()
  const exporting = page.getByRole('dialog')
  await exporting.getByLabel('書き出すディレクトリ (無ければ作る)').fill(projectDir)
  await exporting.getByRole('button', { name: '書き出す' }).click()
  await expect(exporting.getByRole('status')).toContainText('この場所を問題の設定に記録しました')
  await page.keyboard.press('Escape')
  await expect(exporting).toHaveCount(0)

  // 2. データの分析: 殻で選んだ問題の設定から始め, 記録した場所へデータセットを書き出す
  await goStage(page, 'データの分析', /\/data$/)
  const card = page.getByRole('region', { name: '選んだ問題の設定' })
  await expect(card.getByText('解約の引き止め')).toBeVisible()
  await card.getByRole('button', { name: 'この問題の設定から始める' }).click()
  await expect(page).toHaveURL(/\/data\/sources\/[^/]+$/, { timeout: 30_000 })
  await page.getByRole('tab', { name: '前処理と書き出し' }).click()
  const exportDataset = page.getByRole('region', { name: 'プロジェクトへ書き出す' })
  await expect(
    exportDataset.getByText(`${projectDir}/outputs/dataset`, { exact: true }),
  ).toBeVisible()
  await exportDataset.getByRole('button', { name: 'プロジェクトへ書き出す' }).click()
  await expect(exportDataset.getByRole('status')).toContainText('プロジェクトへ書き出しました', {
    timeout: 30_000,
  })

  // 3. モデルの作成・選定: 殻で選んだ問題の設定の記録からデータセットと保存先が入り,
  // 入力と出力を作って学習のプロジェクトに保存する
  await goStage(page, 'モデルの作成・選定', /\/model$/)
  await expect(page.locator('.react-flow')).toBeVisible()
  await page.getByRole('button', { name: 'データセットとプロジェクト' }).click()
  const project = page.getByRole('dialog', { name: 'データセットとプロジェクト' })
  await expect(
    project.getByRole('region', { name: '選んだ問題の設定' }).getByText(`(${opened})`),
  ).toBeVisible()
  await expect(project.getByLabel('データセットのディレクトリ')).toHaveValue(
    `${projectDir}/outputs/dataset`,
    { timeout: 20_000 },
  )
  await project.getByRole('button', { name: '入力と出力を作る' }).click()
  await expect(
    project.getByRole('region', { name: 'データセットから入力と出力を作る' }).getByRole('status'),
  ).toContainText('データセットから入れました', { timeout: 20_000 })
  const saving = project.getByRole('region', { name: 'プロジェクトに保存' })
  await expect(
    saving
      .getByRole('group', { name: '保存先' })
      .getByText(`${projectDir}/models/model.yaml`, { exact: true }),
  ).toBeVisible()
  await saving.getByRole('button', { name: 'この場所に保存' }).click()
  await expect(saving.getByRole('status')).toContainText('に保存しました', { timeout: 20_000 })
  await project.getByRole('button', { name: '閉じる' }).click()
  await expect(page.locator('header').getByText('誤り 0 件')).toBeVisible({ timeout: 20_000 })

  // 4. 学習・評価: 殻で選んだ問題の設定が記録したプロジェクトを登録し, 1 エポックだけ学習する
  await goStage(page, '学習・評価', /\/train$/)
  // 記録したプロジェクトの場所は欄の中の term と definition の対. Playwright は ARIA 1.3 に
  // 従って term と definition の名前を計算しないので, 名前でなく欄の中の役割で選び, term の
  // 文を確かめる (欄の中に対が 2 つ出たら, 厳密な選びで落ちる)
  const note = page.getByRole('region', { name: '選んだ問題の設定' })
  await expect(note.getByRole('term')).toHaveText(/^記録したプロジェクト/)
  await expect(note.getByRole('definition')).toHaveText(projectDir)
  await note.getByRole('button', { name: '登録して開く' }).click()
  await expect(page).toHaveURL(/\/train\/projects\/[^/]+$/)
  await page.getByRole('link', { name: '学習を起動', exact: true }).click()
  await expect(page).toHaveURL(/\/launch$/)
  const epochs = page.getByLabel('エポック数')
  await epochs.fill('1')
  await epochs.press('Enter')
  await page.getByRole('button', { name: '学習を開始' }).click()
  await expect(page).toHaveURL(/\/train\/jobs\/[^/]+$/)
  // ジョブの画面は, 学習の後に評価と推論の一式を書き出してから状態の印を「完了」にする
  // (書き出しの間は「後の処理中」). 印は「状態: 完了」などの名前で選ぶ. 失敗か中断で
  // 止まったら, ジョブの画面の文を付けてすぐ落とす
  const main = page.getByRole('main')
  const settled = main.getByRole('img', { name: /^状態: (完了|失敗|中断)$/ })
  await expect(settled).toBeVisible({ timeout: 180_000 })
  expect(await settled.getAttribute('aria-label'), await main.innerText()).toBe('状態: 完了')

  // 5. 推論: 殻で選んだ問題の設定の実験から一式を登録し, 学習に使ったデータセットの
  // テスト用の分割を選んで推論する (場所は推論の段階が一式の実験から見つける)
  await goStage(page, '推論', /\/infer$/)
  await page.getByRole('button', { name: '実験の一覧から登録' }).click()
  const experiments = page.getByRole('dialog', { name: '実験の一覧から登録' })
  await expect(experiments.getByText(`選んだプロジェクト ${opened}`)).toBeVisible()
  await experiments.getByRole('button', { name: /^解約の引き止め \(.+\) を登録$/ }).click()
  await expect(page).toHaveURL(/\/infer\/bundles\/[^/]+$/, { timeout: 30_000 })
  await page.getByRole('radio', { name: '元のデータセットのテスト用の分割' }).check()
  const split = page.getByRole('region', { name: 'テスト用の分割' })
  await expect(split).toContainText(`${projectDir}/outputs/dataset`)
  await page.getByRole('button', { name: '推論する', exact: true }).click()
  await expect(page).toHaveURL(/\/infer\/results\/[^/]+$/, { timeout: 60_000 })
  // 結果の入力が, 一式の実験が指すデータセットのテスト用の分割であること
  await expect(
    page.getByText(`元のデータセットのテスト用の分割 (${projectDir}/outputs/dataset の test)`),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'CSV' })).toBeVisible()
  await expect(select).toHaveValue(opened)

  expect(errors).toEqual([])
})
