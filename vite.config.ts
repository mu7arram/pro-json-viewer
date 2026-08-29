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

      // Copy target manifest
      const targetBrowser = process.env.TARGET_BROWSER || 'chrome';
      const manifestSource = targetBrowser === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';
      fs.copyFileSync(resolve(__dirname, manifestSource), resolve(distDir, 'manifest.json'));

      // Copy standalone scripts & styles
      fs.copyFileSync(resolve(__dirname, 'content.js'), resolve(distDir, 'content.js'));
      fs.copyFileSync(resolve(__dirname, 'service-worker.js'), resolve(distDir, 'service-worker.js'));
      fs.copyFileSync(resolve(__dirname, 'theme.css'), resolve(distDir, 'theme.css'));
      fs.copyFileSync(resolve(__dirname, 'popup.html'), resolve(distDir, 'popup.html'));
      fs.copyFileSync(resolve(__dirname, 'popup.js'), resolve(distDir, 'popup.js'));
      fs.copyFileSync(resolve(__dirname, 'options.html'), resolve(distDir, 'options.html'));
      fs.copyFileSync(resolve(__dirname, 'options.js'), resolve(distDir, 'options.js'));

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
  base: './',
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
        options: resolve(__dirname, 'src/options/options.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  plugins: [copyExtensionAssets()]
});
