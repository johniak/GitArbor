import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'repo-browser': path.resolve(__dirname, 'repo-browser.html'),
      },
    },
  },
});
