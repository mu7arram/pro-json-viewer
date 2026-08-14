(() => {
  const DEFAULT_SETTINGS = {
    theme: 'system',
    defaultExpandDepth: 2,
    tableScanDepth: 3,
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
      if (typeof window.launchProJsonScratchpad === 'function') {
        window.launchProJsonScratchpad(scratchpadView);
      }
      return;
    }

    // Settings view
    optionsView.style.display = 'block';
    scratchpadView.style.display = 'none';

    const settings = await getSettings();

    const themeSelect = document.getElementById('opt-theme');
    const depthSelect = document.getElementById('opt-depth');
    const scanDepthSelect = document.getElementById('opt-scan-depth');
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

    const scanDepthVal = document.getElementById('opt-scan-depth-val');
    const dotTrack = document.getElementById('opt-dot-track');
    const dotSliderContainer = document.getElementById('opt-dot-slider-container');

    depthSelect.value = String(settings.defaultExpandDepth);
    if (scanDepthSelect) {
      const curDepth = settings.tableScanDepth || 3;
      scanDepthSelect.value = String(curDepth);
      if (scanDepthVal) scanDepthVal.textContent = String(curDepth);

      let tooltipEl = null;
      if (dotSliderContainer) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'pjv-dot-tooltip';
        tooltipEl.textContent = `Depth ${curDepth}`;
        dotSliderContainer.appendChild(tooltipEl);
      }

      const updateTooltipPos = (val) => {
        if (!tooltipEl) return;
        const trackWidth = 150;
        const posX = 10 + ((val - 1) / 19) * trackWidth;
        tooltipEl.style.left = `${posX}px`;
      };
      updateTooltipPos(curDepth);

      if (dotSliderContainer && tooltipEl) {
        dotSliderContainer.onmousemove = (e) => {
          const rect = dotSliderContainer.getBoundingClientRect();
          const padding = 10;
          const trackWidth = rect.width - (padding * 2);
          const mouseX = Math.max(0, Math.min(trackWidth, e.clientX - rect.left - padding));
          const pct = trackWidth > 0 ? mouseX / trackWidth : 0;
          const hoverVal = Math.max(1, Math.min(20, Math.round(pct * 19) + 1));
          tooltipEl.textContent = `Depth ${hoverVal}`;
          tooltipEl.style.left = `${padding + ((hoverVal - 1) / 19) * trackWidth}px`;
        };

        dotSliderContainer.onmouseleave = () => {
          const curVal = Number(scanDepthSelect.value);
          tooltipEl.textContent = `Depth ${curVal}`;
          updateTooltipPos(curVal);
        };
      }

      const dotElements = [];
      if (dotTrack) {
        dotTrack.innerHTML = '';
        for (let i = 1; i <= 20; i++) {
          const dot = document.createElement('div');
          dot.className = 'pjv-dot-step';
          if (i <= curDepth) dot.classList.add('active');
          if (i === curDepth) dot.classList.add('current');
          dotTrack.appendChild(dot);
          dotElements.push(dot);
        }
      }

      const updateOptionDots = (val) => {
        if (scanDepthVal) scanDepthVal.textContent = String(val);
        if (tooltipEl) {
          tooltipEl.textContent = `Depth ${val}`;
          updateTooltipPos(val);
        }
        dotElements.forEach((dot, idx) => {
          const stepNum = idx + 1;
          dot.classList.toggle('active', stepNum <= val);
          dot.classList.toggle('current', stepNum === val);
        });
      };

      scanDepthSelect.oninput = () => {
        const val = Number(scanDepthSelect.value);
        updateOptionDots(val);
      };
    }
    lineNoCheckbox.checked = settings.showLineNumbers;
    jwtCheckbox.checked = settings.detectJwt;
    datesCheckbox.checked = settings.detectDates;
    schemaCheckbox.checked = settings.detectSchemaHints;

    const flashSaveToast = (msg = '✓ Settings Saved!') => {
      if (saveToast) {
        saveToast.textContent = msg;
        saveToast.style.display = 'inline';
        setTimeout(() => {
          saveToast.style.display = 'none';
        }, 2500);
      }
    };

    themeSelect.onchange = async () => {
      const newTheme = themeSelect.value;
      document.documentElement.setAttribute('data-theme', newTheme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : newTheme);
      await saveSettings({ theme: newTheme });
      flashSaveToast('✓ Theme Updated!');
    };

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      await saveSettings({
        theme: themeSelect.value,
        defaultExpandDepth: Number(depthSelect.value),
        tableScanDepth: scanDepthSelect ? Number(scanDepthSelect.value) : 20,
        showLineNumbers: lineNoCheckbox.checked,
        detectJwt: jwtCheckbox.checked,
        detectDates: datesCheckbox.checked,
        detectSchemaHints: schemaCheckbox.checked
      });

      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
      flashSaveToast('✓ Settings Saved Successfully!');
    };
  }

  document.addEventListener('DOMContentLoaded', initOptionsPage);
  window.onhashchange = () => {
    initOptionsPage();
  };
})();
