import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: './',
  server: {
    proxy: {
      '/telemetry': {
        target: loadEnv(mode, '.', '').TELEMETRY_PROXY_TARGET || 'http://127.0.0.1:14650',
        changeOrigin: false,
      },
    },
  },
}))
