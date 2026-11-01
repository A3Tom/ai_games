import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', '').TELEMETRY_PROXY_TARGET || 'http://127.0.0.1:14650'
  return {
    base: './',
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          player: fileURLToPath(new URL('./player.html', import.meta.url)),
        },
      },
    },
    server: { proxy: { '/telemetry': { target, changeOrigin: false } } },
    preview: { proxy: { '/telemetry': { target, changeOrigin: false } } },
    test: { include: ['src/**/*.test.ts'] },
  }
})
