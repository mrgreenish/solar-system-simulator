import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // use relative paths so it works on GitHub Pages subpaths
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, '3d.html'),
      },
    },
  },
});

