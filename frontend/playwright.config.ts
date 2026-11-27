import { defineConfig } from '@playwright/test'

// 殻の通しのテスト. e2e/serve.sh が作業用の置き場で殻を起動する
const port = Number(process.env.E2E_PORT ?? 8796)

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // 通しの確かめ (学習を含む) と殻の画面の確かめを分け, CI では別のジョブで流す
  projects: [
    { name: 'studio', testIgnore: /journey\.spec\.ts$/ },
    { name: 'journey', testMatch: /journey\.spec\.ts$/ },
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // 手元では入っている Chrome を使い, CI では Playwright の Chromium を使う
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    // 手元では古い画面で確かめないように, 先に画面をビルド (CI はビルド済み)
    command: process.env.CI ? 'bash e2e/serve.sh' : 'pnpm build && bash e2e/serve.sh',
    url: `http://127.0.0.1:${port}/problem`,
    env: { E2E_PORT: String(port) },
    timeout: 180_000,
    reuseExistingServer: false,
  },
})
