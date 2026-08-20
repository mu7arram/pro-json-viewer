import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings } from '../src/shared/storage';
import { DEFAULT_SETTINGS } from '../src/shared/types';

describe('Storage & Settings Manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns DEFAULT_SETTINGS when storage is unpopulated', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.theme).toBe('system');
    expect(settings.defaultExpandDepth).toBe(2);
  });

  it('persists and updates partial settings', async () => {
    const updated = await saveSettings({
      theme: 'dracula',
      defaultExpandDepth: 4
    });

    expect(updated.theme).toBe('dracula');
    expect(updated.defaultExpandDepth).toBe(4);
    // Other settings should be preserved from defaults
    expect(updated.showLineNumbers).toBe(DEFAULT_SETTINGS.showLineNumbers);

    // Reading settings back
    const retrieved = await getSettings();
    expect(retrieved.theme).toBe('dracula');
    expect(retrieved.defaultExpandDepth).toBe(4);
  });
});
