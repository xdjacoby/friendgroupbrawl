import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// `import MODEL_FILES from 'virtual:model-files'` lists every .glb in
// public/models, so a new outfit (byroncos2.glb) shows up in the game
// without touching any code. The list refreshes when a file is added.
function modelFiles() {
  const id = 'virtual:model-files';
  const dir = path.resolve('public/models');
  return {
    name: 'model-files',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f)) : [];
      return `export default ${JSON.stringify(files.sort())};`;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const refresh = (file) => {
        if (!file.startsWith(dir)) return;
        const mod = server.moduleGraph.getModuleById(`\0${id}`);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

// Relative base so the built game works from any folder or static host.
export default defineConfig({
  base: './',
  plugins: [modelFiles()],
  build: {
    chunkSizeWarningLimit: 1000,
    // The game, plus the model shrinker page for adding friends.
    rollupOptions: { input: { main: 'index.html', shrink: 'shrink.html' } },
  },
});
