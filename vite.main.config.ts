import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  build: {
    rollupOptions: {
      external: ['sql.js'],
    },
  },
});
