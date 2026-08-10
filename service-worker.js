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

// Service Worker setup & installation
chrome.runtime.onInstalled.addListener(async () => {
  // Initialize storage default settings if missing
  const { pro_json_settings } = await chrome.storage.local.get('pro_json_settings');
  if (!pro_json_settings) {
    await chrome.storage.local.set({ pro_json_settings: DEFAULT_SETTINGS });
  }

  // Create context menu item
  chrome.contextMenus.create({
    id: 'pjv-format-selection',
    title: 'Format & View with Pro JSON',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'pjv-format-selection' && info.selectionText && tab?.id) {
    try {
      // Validate JSON selection
      const parsed = JSON.parse(info.selectionText);
      await chrome.storage.local.set({ pjv_scratchpad_json: JSON.stringify(parsed) });
      await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#scratchpad') });
    } catch {
      await chrome.action.setBadgeText({ tabId: tab.id, text: 'ERR' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#EF4444' });
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 2500);
    }
  }
});
