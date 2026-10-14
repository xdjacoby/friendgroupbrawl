import { defineConfig } from 'vite';

// Relative base so the built game works from any folder or static host.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
    // The game, plus the model shrinker page for adding friends.
    rollupOptions: { input: { main: 'index.html', shrink: 'shrink.html' } },
  },
});
