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
      // バックエンドのポートは make dev PORT=... で揃える. Host を画面のまま渡し,
      // バックエンドの Origin の確かめ (Origin と Host の一致) を通す
      '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? '8760'}`, changeOrigin: false },
    },
    fs: {
      // submodule の段階のアプリの画面のソースも配る
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        '../ML-Pathfinder/frontend',
        '../ML-Fathom/frontend',
        '../ML-CreateArchitecture/frontend',
        '../ML-Dashboard/frontend',
        '../ML-Provide/frontend',
      ],
    },
  },
  build: {
    outDir: '../backend/src/ml_studio/static',
    emptyOutDir: true,
    // 段階の根の部品は段階ごとのチャンクに分けて読む (Shell.tsx). 超えたら閾値を上げずに分け方を見直す
    chunkSizeWarningLimit: 2500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
