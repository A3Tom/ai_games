import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index-new.html'),
      },
    },
  },
});
