import { DEFAULT_SETTINGS, UserSettings } from './types';

export async function getSettings(): Promise<UserSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get('pro_json_settings');
      return { ...DEFAULT_SETTINGS, ...data.pro_json_settings };
    }
  } catch (err) {
    console.warn('chrome.storage not available, using localStorage fallback', err);
  }

  const raw = localStorage.getItem('pro_json_settings');
  if (raw) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // Fallback
    }
  }

  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ pro_json_settings: updated });
    }
  } catch (err) {
    console.warn('chrome.storage save failed', err);
  }

  try {
    localStorage.setItem('pro_json_settings', JSON.stringify(updated));
  } catch {
    // Ignore
  }

  return updated;
}
