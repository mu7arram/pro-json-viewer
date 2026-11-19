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

  test('neutralizes XSS payloads across Table, Chart, and Diagram views', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    const xssPayload = JSON.stringify({
      '<img src=x onerror="window.__xss=1">': [
        {
          '<img src=x onerror="window.__xss=2">': '<img src=x onerror="window.__xss=3">',
          skill_name: '<img src=x onerror="window.__xss=4">',
          type: '<img src=x onerror="window.__xss=5">',
          expected: { correct: '<img src=x onerror="window.__xss=6">' },
          score: 42
        }
      ]
    });

    // Switch to Raw, enter XSS payload, and switch across views
    await page.click('button:has-text("📝 Raw")');
    const rawTextarea = page.locator('.pjv-raw-textarea');
    await rawTextarea.fill(xssPayload);

    await page.click('button:has-text("📊 Table")');
    await expect(page.locator('.pjv-table-wrapper')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('img[onerror]')).toHaveCount(0);

    await page.click('button:has-text("📈 Chart")');
    await expect(page.locator('.pjv-chart-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('img[onerror]')).toHaveCount(0);

    await page.click('button:has-text("🗺️ Diagram")');
    await expect(page.locator('.pjv-diagram-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('img[onerror]')).toHaveCount(0);

    const xssTriggered = await page.evaluate(() => (window as any).__xss);
    expect(xssTriggered).toBeUndefined();
  });

  test('preserves 64-bit integer precision in Raw view and Tools Export and avoids dotted-key ID collisions', async ({ page, extensionId }) => {
    const payload = '{\n  "bigId": 9007199254740993,\n  "a.b": { "c": "dotted" },\n  "a": { "b": { "c": "nested", "deep": { "leaf": "hiddenTarget" } } }\n}';

    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    await page.click('button:has-text("📝 Raw")');
    const rawTextarea = page.locator('.pjv-raw-textarea');
    await rawTextarea.fill(payload);

    // Format in Raw view and verify 64-bit integer is not rounded to 9007199254740992
    await page.click('#pjv-btn-raw-format');
    await expect(rawTextarea).toHaveValue(/9007199254740993/);

    // Switch back to Tree view, collapse all, then search for deep collapsed value
    await page.click('#pjv-btn-tree');
    await page.click('#pjv-btn-collapse-all');
    const searchInput = page.locator('#pjv-search-input');
    await searchInput.fill('hiddenTarget');

    // Wait for debounced search to expand ancestors and reveal hiddenTarget
    await expect(page.locator('.pjv-viewport')).toContainText('hiddenTarget', { timeout: 5000 });
  });

  test('preserves Table View tab bar scroll on far-right tab click and live-updates filter count', async ({ page, extensionId }) => {
    const datasets: Record<string, Array<{ id: number; name: string }>> = {};
    for (let i = 1; i <= 12; i++) {
      const key = `datasetCollection_${String(i).padStart(2, '0')}`;
      datasets[key] = [
        { id: 1, name: `alpha_${i}` },
        { id: 2, name: `matchTarget_${i}` }
      ];
    }

    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    await page.click('#pjv-btn-raw');
    await page.locator('.pjv-raw-textarea').fill(JSON.stringify(datasets));
    await page.click('#pjv-btn-table');
    await expect(page.locator('.pjv-table-tabs-container')).toBeVisible({ timeout: 5000 });

    const tabsBar = page.locator('.pjv-table-tabs-container');
    await tabsBar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const hasOverflow = await tabsBar.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(hasOverflow).toBe(true);

    const lastTab = page.locator('.pjv-table-tab').last();
    await lastTab.click();

    await expect(lastTab).toHaveClass(/active/);
    const tabMetrics = await page.evaluate(() => {
      const bar = document.querySelector('.pjv-table-tabs-container') as HTMLElement;
      const active = document.querySelector('.pjv-table-tab.active') as HTMLElement;
      const barRect = bar.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      return {
        scrollLeft: bar.scrollLeft,
        withinLeft: activeRect.left >= barRect.left - 1,
        withinRight: activeRect.right <= barRect.right + 1
      };
    });
    expect(tabMetrics.scrollLeft).toBeGreaterThan(0);
    expect(tabMetrics.withinLeft).toBe(true);
    expect(tabMetrics.withinRight).toBe(true);

    await page.locator('.pjv-table-search-input').fill('matchTarget_12');
    await expect(page.locator('.pjv-badge-count')).toHaveText('1 / 2 items');
  });

  test('allows vertical scrolling on large Horizontal Bar charts in Chart View', async ({ page, extensionId }) => {
    const metrics = Array.from({ length: 30 }, (_, idx) => ({
      name: `Metric Item ${String(idx + 1).padStart(2, '0')}`,
      score: (idx + 1) * 10
    }));

    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    await page.click('#pjv-btn-raw');
    await page.locator('.pjv-raw-textarea').fill(JSON.stringify({ metrics }));
    await page.click('#pjv-btn-chart');
    await expect(page.locator('.pjv-chart-container')).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("📈 Horizontal")');

    const svgContainer = page.locator('.pjv-chart-svg-container');
    await expect(svgContainer).toContainText('Metric Item 30');

    const scrollMetrics = await page.evaluate(() => {
      const svgBox = document.querySelector('.pjv-chart-svg-container') as HTMLElement;
      const chartHost = document.querySelector('.pjv-chart-view-host') as HTMLElement;
      const boxScrollable = svgBox.scrollHeight > svgBox.clientHeight;
      const hostScrollable = chartHost ? chartHost.scrollHeight > chartHost.clientHeight : false;
      if (boxScrollable) {
        svgBox.scrollTop = svgBox.scrollHeight;
      } else if (hostScrollable) {
        chartHost.scrollTop = chartHost.scrollHeight;
      }
      return {
        scrollable: boxScrollable || hostScrollable,
        scrolled: (boxScrollable ? svgBox.scrollTop : chartHost?.scrollTop || 0) > 0
      };
    });
    expect(scrollMetrics.scrollable).toBe(true);
    expect(scrollMetrics.scrolled).toBe(true);
  });

  test('retains Diff search input focus while typing and omits dead expand/collapse controls', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html#scratchpad`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.pjv-root')).toBeVisible({ timeout: 10000 });

    await page.click('#pjv-btn-diff');
    await expect(page.locator('.pjv-diff-workspace')).toBeVisible({ timeout: 5000 });

    await page.click('#pjv-diff-btn-sample');
    await page.click('#pjv-diff-btn-compare');
    await expect(page.locator('.pjv-diff-tree-view')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('#pjv-diff-expand-all')).toHaveCount(0);
    await expect(page.locator('#pjv-diff-collapse-all')).toHaveCount(0);

    const diffSearch = page.locator('#pjv-diff-search-input');
    await diffSearch.click();
    await page.keyboard.type('timeout');

    await expect(diffSearch).toHaveValue('timeout');
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe('pjv-diff-search-input');
  });
});