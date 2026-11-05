import { defineConfig } from 'vite';

// 개발할 때: 백엔드(8080)를 띄우고 `npm run dev` → http://localhost:5173/t/{팀코드}
export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
});
