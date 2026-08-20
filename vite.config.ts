/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { resolve } from 'path';
import fs from 'fs';

// Custom plugin to copy public assets & manifest.json to dist
function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const iconsDist = resolve(distDir, 'icons');
      const publicIcons = resolve(__dirname, 'public/icons');

      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Copy manifest
      fs.copyFileSync(resolve(__dirname, 'manifest.json'), resolve(distDir, 'manifest.json'));

      // Copy icons
      if (fs.existsSync(publicIcons)) {
        if (!fs.existsSync(iconsDist)) {
          fs.mkdirSync(iconsDist, { recursive: true });
        }
        const files = fs.readdirSync(publicIcons);
        for (const file of files) {
          fs.copyFileSync(resolve(publicIcons, file), resolve(iconsDist, file));
        }
      }
    }
  };
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  },  
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'service-worker.js';
          }
          if (chunkInfo.name === 'content') {
            return 'content.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  plugins: [copyExtensionAssets()]
});
