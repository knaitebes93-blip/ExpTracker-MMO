import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'renderer',
  base: '',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'renderer/index.html'),
        overlay: resolve(__dirname, 'renderer/overlay.html'),
        region: resolve(__dirname, 'renderer/region-selector.html')
      }
    }
  },
  server: {
    port: 5173
  }
});
