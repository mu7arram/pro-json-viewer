import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pathToExtension = path.resolve(__dirname);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
        launchOptions: {
          headless: false,
          args: [
            `--headless=new`,
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`
          ]
        }
      }
    }
  ]
});