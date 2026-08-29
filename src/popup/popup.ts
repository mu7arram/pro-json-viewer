import { getSettings, saveSettings } from '../shared/storage';

async function initPopup() {
  const settings = await getSettings();

  const autoActivateCheckbox = document.getElementById('auto-activate') as HTMLInputElement;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const scratchpadBtn = document.getElementById('open-scratchpad') as HTMLButtonElement;
  const optionsBtn = document.getElementById('open-options') as HTMLButtonElement;

  autoActivateCheckbox.checked = settings.autoActivateOnJson;
  themeSelect.value = settings.theme;

  autoActivateCheckbox.onchange = async () => {
    await saveSettings({ autoActivateOnJson: autoActivateCheckbox.checked });
  };

  themeSelect.onchange = async () => {
    await saveSettings({ theme: themeSelect.value as any });
  };

  scratchpadBtn.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#scratchpad') });
  };

  optionsBtn.onclick = () => {
    chrome.runtime.openOptionsPage();
  };

  // Check if running on Firefox
  const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Firefox');
  const firefoxTip = document.getElementById('firefox-tip') as HTMLDivElement;
  const firefoxGuideBtn = document.getElementById('open-firefox-guide') as HTMLButtonElement;

  if (isFirefox && firefoxTip) {
    firefoxTip.style.display = 'block';
    if (firefoxGuideBtn) {
      firefoxGuideBtn.onclick = () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#welcome') });
      };
    }
  }
}

document.addEventListener('DOMContentLoaded', initPopup);
