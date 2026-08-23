import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pathToExtension = path.resolve(__dirname, '../../');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  page: Page;
}>({
  context: async ({}, use) => {
    const userDataDir = path.join(pathToExtension, '.playwright-profile');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null as any);
    }
    const extensionId = background ? background.url().split('/')[2] : '';
    await use(extensionId);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

test.describe('Pro JSON Viewer E2E Browser Test Suite', () => {
  test('renders interactive Tree View in Scratchpad', async ({ page, extensionId }) => {
    // Navigate directly to extension Options/Scratchpad UI
    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });

    // Assert that the Pro JSON Viewer injected container is visible
    const rootViewer = page.locator('.pjv-root');
    await expect(rootViewer).toBeVisible({ timeout: 10000 });

    // Assert Tree View is active
    const viewport = page.locator('.pjv-viewport');
    await expect(viewport).toBeVisible();

    // Assert search input is present in the sub-toolbar
    const searchInput = page.locator('#pjv-search-input');
    await expect(searchInput).toBeVisible();
  });

  test('switches across Table, Chart, Diagram, and Diff view modes seamlessly', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    // 1. Switch to Table View
    await page.click('button:has-text("📊 Table")');
    await expect(page.locator('.pjv-table-wrapper')).toBeVisible({ timeout: 5000 });

    // 2. Switch to Chart View
    await page.click('button:has-text("📈 Chart")');
    await expect(page.locator('.pjv-chart-container')).toBeVisible({ timeout: 5000 });

    // 3. Switch to Diagram View
    await page.click('button:has-text("🗺️ Diagram")');
    await expect(page.locator('.pjv-diagram-container')).toBeVisible({ timeout: 5000 });

    // 4. Switch to Diff View
    await page.click('button:has-text("🔀 Diff")');
    await expect(page.locator('.pjv-diff-workspace')).toBeVisible({ timeout: 5000 });

    // Test Diff actions: Load Sample and Compare
    await page.click('#pjv-diff-btn-sample');
    await page.click('#pjv-diff-btn-compare');
    await expect(page.locator('.pjv-diff-tree-view')).toBeVisible({ timeout: 5000 });
  });

  test('exercises enhanced Diff UX workspace: auto-diff, stepper, and apply to viewer', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    // Open Diff View
    await page.click('button:has-text("🔀 Diff")');
    await expect(page.locator('.pjv-diff-workspace')).toBeVisible({ timeout: 5000 });

    // Load sample payloads
    await page.click('#pjv-diff-btn-sample');

    // Verify stats pills updated
    const statsPills = page.locator('.pjv-diff-stats-pills');
    await expect(statsPills).toBeVisible({ timeout: 5000 });

    // Toggle Sync Scroll and Sort Keys
    await page.click('#pjv-diff-btn-sync-scroll');
    await expect(page.locator('#pjv-diff-btn-sync-scroll')).toContainText('OFF');
    await page.click('#pjv-diff-btn-sync-scroll');
    await expect(page.locator('#pjv-diff-btn-sync-scroll')).toContainText('ON');

    // Switch to Visual Diff Tree
    await page.click('#pjv-diff-tab-tree');
    await expect(page.locator('.pjv-diff-tree-view')).toBeVisible();

    // Step through differences with next/prev buttons
    const stepCounter = page.locator('#pjv-diff-step-counter');
    await expect(stepCounter).toBeVisible();
    await page.click('#pjv-diff-next');
    await page.click('#pjv-diff-prev');

    // Switch back to Editors and Apply Target to Viewer
    await page.click('#pjv-diff-tab-editors');
    await page.click('#pjv-diff-apply-right');

    // Verify app transitions back to Tree view with updated target JSON
    await expect(page.locator('.pjv-viewport')).toBeVisible({ timeout: 5000 });
  });

  test('developer tools modal opens and displays schema inspection', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    // Click Tools button in topbar
    await page.click('button:has-text("🛠️ Tools")');
    const modal = page.locator('.pjv-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });
});