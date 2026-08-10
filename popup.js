const DEFAULT_SETTINGS = {
  theme: 'system',
  defaultExpandDepth: 2,
  fontSize: 13,
  indentSize: 18,
  showLineNumbers: true,
  virtualRowHeight: 26,
  detectDates: true,
  detectJwt: true,
  detectUrls: true,
  detectBase64: true,
  detectSchemaHints: true,
  autoActivateOnJson: true
};

async function getSettings() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get('pro_json_settings');
      return { ...DEFAULT_SETTINGS, ...data.pro_json_settings };
    }
  } catch (err) {
    console.warn(err);
  }
  return DEFAULT_SETTINGS;
}

async function saveSettings(settings) {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ pro_json_settings: updated });
    }
  } catch (err) {
    console.warn(err);
  }
  return updated;
}

async function initPopup() {
  const settings = await getSettings();

  const autoActivateCheckbox = document.getElementById('auto-activate');
  const themeSelect = document.getElementById('theme-select');
  const scratchpadBtn = document.getElementById('open-scratchpad');
  const optionsBtn = document.getElementById('open-options');

  autoActivateCheckbox.checked = settings.autoActivateOnJson;
  themeSelect.value = settings.theme;

  autoActivateCheckbox.onchange = async () => {
    await saveSettings({ autoActivateOnJson: autoActivateCheckbox.checked });
  };

  themeSelect.onchange = async () => {
    await saveSettings({ theme: themeSelect.value });
  };

  scratchpadBtn.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#scratchpad') });
  };

  optionsBtn.onclick = () => {
    chrome.runtime.openOptionsPage();
  };
}

document.addEventListener('DOMContentLoaded', initPopup);
