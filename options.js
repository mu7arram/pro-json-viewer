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

async function initOptionsPage() {
  const isScratchpad = window.location.hash === '#scratchpad';
  const optionsView = document.getElementById('options-view');
  const scratchpadView = document.getElementById('scratchpad-view');

  if (isScratchpad) {
    optionsView.style.display = 'none';
    scratchpadView.style.display = 'block';
    // Let content.js load the scratchpad view
    if (typeof window.launchProJsonScratchpad === 'function') {
      window.launchProJsonScratchpad(scratchpadView);
    }
    return;
  }

  // Options settings binding
  const settings = await getSettings();

  const themeSelect = document.getElementById('opt-theme');
  const depthSelect = document.getElementById('opt-depth');
  const lineNoCheckbox = document.getElementById('opt-line-numbers');
  const jwtCheckbox = document.getElementById('opt-detect-jwt');
  const datesCheckbox = document.getElementById('opt-detect-dates');
  const schemaCheckbox = document.getElementById('opt-detect-schema');
  const saveBtn = document.getElementById('opt-save-btn');
  const saveToast = document.getElementById('opt-save-toast');

  themeSelect.value = settings.theme;
  document.documentElement.setAttribute('data-theme', settings.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : settings.theme);

  depthSelect.value = String(settings.defaultExpandDepth);
  lineNoCheckbox.checked = settings.showLineNumbers;
  jwtCheckbox.checked = settings.detectJwt;
  datesCheckbox.checked = settings.detectDates;
  schemaCheckbox.checked = settings.detectSchemaHints;

  themeSelect.onchange = async () => {
    const newTheme = themeSelect.value;
    document.documentElement.setAttribute('data-theme', newTheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : newTheme);
    await saveSettings({ theme: newTheme });
  };

  saveBtn.onclick = async () => {
    await saveSettings({
      theme: themeSelect.value,
      defaultExpandDepth: Number(depthSelect.value),
      showLineNumbers: lineNoCheckbox.checked,
      detectJwt: jwtCheckbox.checked,
      detectDates: datesCheckbox.checked,
      detectSchemaHints: schemaCheckbox.checked
    });

    saveToast.style.display = 'inline';
    setTimeout(() => (saveToast.style.display = 'none'), 2000);
  };
}

document.addEventListener('DOMContentLoaded', initOptionsPage);
window.onhashchange = () => {
  window.location.reload();
};
