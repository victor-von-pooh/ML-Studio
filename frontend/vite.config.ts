import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// 開発時は API をバックエンドに転送し, ビルドはバックエンドのパッケージの中に出力
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 殻と段階のアプリの画面で React を 1 つだけ読む (2 つ読むとフックが動かない)
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      // バックエンドのポートは make dev PORT=... で揃える
      '/api': `http://127.0.0.1:${process.env.API_PORT ?? '8760'}`,
    },
    fs: {
      // submodule の段階のアプリの画面のソースも配る
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        '../ML-Pathfinder/frontend',
        '../ML-Fathom/frontend',
      ],
    },
  },
  build: {
    outDir: '../backend/src/ml_studio/static',
    emptyOutDir: true,
    // 段階のアプリの画面を 1 つのビルドにまとめる (データの分析の段階のグラフの部品が大きい)
    chunkSizeWarningLimit: 2500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
