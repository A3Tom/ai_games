import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', '').TELEMETRY_PROXY_TARGET || 'http://127.0.0.1:14650'
  return {
    base: './',
    server: {
      proxy: {
        '/api': { target, changeOrigin: false },
        '/telemetry': { target, changeOrigin: false },
      },
    },
    preview: {
      proxy: {
        '/api': { target, changeOrigin: false },
        '/telemetry': { target, changeOrigin: false },
      },
    },
    test: { include: ['src/**/*.test.ts'] },
  }
})
