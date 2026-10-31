import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [vue()],
    base: "./",
    server: {
      proxy: {
        "/relay": {
          target: env.TELEMETRY_PROXY_TARGET || "http://127.0.0.1:14650",
          ws: true,
        },
        "/telemetry": {
          target: env.TELEMETRY_PROXY_TARGET || "http://127.0.0.1:14650",
          changeOrigin: false,
        },
      },
    },
  };
});
