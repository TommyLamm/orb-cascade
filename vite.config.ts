import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-game-manifest-and-cover',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist');
        const assets = ['game.json', 'cover.png', 'playroom-sdk.js', 'playroom-sdk.d.ts'];
        for (const file of assets) {
          const src = path.resolve(__dirname, file);
          const dest = path.resolve(distDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[vite] Copied ${file} to dist/`);
          }
        }
      }
    }
  ]
});
