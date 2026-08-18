export interface KeyboardShortcutsHandlers {
  onSwitchView?: (view: 'tree' | 'table' | 'chart' | 'diagram' | 'raw') => void;
  onFocusSearch?: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onOpenTools?: () => void;
  onOpenDiff?: () => void;
  onOpenShortcuts?: () => void;
  onCloseModals?: () => void;
}

export function openShortcutsModal() {
  const existingBackdrop = document.querySelector('.pjv-modal-backdrop');
  if (existingBackdrop) existingBackdrop.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-modal-backdrop';
  backdrop.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
    z-index: 10000; display: flex; align-items: center; justify-content: center;
  `;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌥' : 'Alt';
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const modal = document.createElement('div');
  modal.className = 'pjv-modal pjv-shortcuts-modal';
  modal.style.cssText = `
    background: var(--pjv-bg-main); color: var(--pjv-text-main);
    border: 1px solid var(--pjv-border-color); border-radius: 10px;
    width: 90%; max-width: 620px; padding: 22px 26px; box-shadow: 0 12px 36px rgba(0,0,0,0.55);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--pjv-border-color); padding-bottom:12px; margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:20px;">⌨️</span>
        <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--pjv-syntax-key);">Keyboard Shortcuts Cheatsheet</h3>
      </div>
      <button id="pjv-shortcuts-close-x" class="pjv-btn" style="padding:4px 8px; font-weight:700; border-radius:4px;">✕</button>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; font-size:12px;">
      <!-- Views & Navigation -->
      <div class="pjv-shortcuts-section" style="background:var(--pjv-bg-badge); padding:12px 14px; border-radius:8px; border:1px solid var(--pjv-border-color);">
        <div style="font-weight:700; color:var(--pjv-syntax-key); margin-bottom:10px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Navigation & Views</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--pjv-text-muted);">Tree View</span>
            <span class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>1</kbd></span>
          </div>
          <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--pjv-text-muted);">Table View</span>
            <span class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>2</kbd></span>
          </div>
          <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--pjv-text-muted);">Chart View</span>
            <span class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>3</kbd></span>
          </div>
          <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--pjv-text-muted);">Diagram View</span>
            <span class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>4</kbd></span>
          </div>
          <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--pjv-text-muted);">Raw JSON View</span>
            <span class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>5</kbd></span>
          </div>
          <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--pjv-text-muted);">Compare Diff</span>
            <span class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>6</kbd></span>
          </div>
        </div>
      </div>

      <!-- Actions & Tree Operations -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="pjv-shortcuts-section" style="background:var(--pjv-bg-badge); padding:12px 14px; border-radius:8px; border:1px solid var(--pjv-border-color);">
          <div style="font-weight:700; color:var(--pjv-syntax-string); margin-bottom:10px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Search & Tools</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--pjv-text-muted);">Focus Search</span>
              <span class="pjv-kbd-group"><kbd>/</kbd> or <kbd>${cmdKey}</kbd>+<kbd>F</kbd></span>
            </div>
            <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--pjv-text-muted);">Developer Tools</span>
              <span class="pjv-kbd-group"><kbd>t</kbd></span>
            </div>
            <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--pjv-text-muted);">Help Cheatsheet</span>
              <span class="pjv-kbd-group"><kbd>?</kbd></span>
            </div>
          </div>
        </div>

        <div class="pjv-shortcuts-section" style="background:var(--pjv-bg-badge); padding:12px 14px; border-radius:8px; border:1px solid var(--pjv-border-color);">
          <div style="font-weight:700; color:#f59e0b; margin-bottom:10px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Tree Operations</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--pjv-text-muted);">Expand All</span>
              <span class="pjv-kbd-group"><kbd>e</kbd></span>
            </div>
            <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--pjv-text-muted);">Collapse All</span>
              <span class="pjv-kbd-group"><kbd>c</kbd></span>
            </div>
            <div class="pjv-shortcut-row" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--pjv-text-muted);">Close Dialogs</span>
              <span class="pjv-kbd-group"><kbd>Esc</kbd></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-top:20px;">
      <button id="pjv-shortcuts-close" class="pjv-btn active" style="padding:6px 16px;">Got It</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const closeBtn = modal.querySelector('#pjv-shortcuts-close') as HTMLButtonElement;
  const closeXBtn = modal.querySelector('#pjv-shortcuts-close-x') as HTMLButtonElement;

  const close = () => backdrop.remove();
  closeBtn.onclick = close;
  closeXBtn.onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

export function registerKeyboardShortcuts(handlers: KeyboardShortcutsHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    // Check if user is typing in an editable field
    const activeEl = document.activeElement;
    const isInput = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable
    );

    // Escape closes any open modals even if inside an input
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.pjv-modal-backdrop');
      if (openModal) {
        openModal.remove();
        e.preventDefault();
        return;
      }
      if (handlers.onCloseModals) {
        handlers.onCloseModals();
        return;
      }
    }

    // Alt/Option + 1..6 view switching (checking e.code handles macOS Option key unicode mappings)
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if ((e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1') && handlers.onSwitchView) {
        e.preventDefault();
        handlers.onSwitchView('tree');
        return;
      }
      if ((e.code === 'Digit2' || e.code === 'Numpad2' || e.key === '2') && handlers.onSwitchView) {
        e.preventDefault();
        handlers.onSwitchView('table');
        return;
      }
      if ((e.code === 'Digit3' || e.code === 'Numpad3' || e.key === '3') && handlers.onSwitchView) {
        e.preventDefault();
        handlers.onSwitchView('chart');
        return;
      }
      if ((e.code === 'Digit4' || e.code === 'Numpad4' || e.key === '4') && handlers.onSwitchView) {
        e.preventDefault();
        handlers.onSwitchView('diagram');
        return;
      }
      if ((e.code === 'Digit5' || e.code === 'Numpad5' || e.key === '5') && handlers.onSwitchView) {
        e.preventDefault();
        handlers.onSwitchView('raw');
        return;
      }
      if ((e.code === 'Digit6' || e.code === 'Numpad6' || e.key === '6') && handlers.onOpenDiff) {
        e.preventDefault();
        handlers.onOpenDiff();
        return;
      }
    }

    // Cmd+F or Ctrl+F / Slash for search
    if ((e.key === '/' && !isInput) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f')) {
      if (handlers.onFocusSearch) {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }
    }

    // Don't trigger letter hotkeys when typing in text fields
    if (isInput) return;

    if (e.key === 'e' || e.key === 'E') {
      if (handlers.onExpandAll) {
        e.preventDefault();
        handlers.onExpandAll();
      }
    } else if (e.key === 'c' || e.key === 'C') {
      if (handlers.onCollapseAll) {
        e.preventDefault();
        handlers.onCollapseAll();
      }
    } else if (e.key === 't' || e.key === 'T') {
      if (handlers.onOpenTools) {
        e.preventDefault();
        handlers.onOpenTools();
      }
    } else if (e.key === '?') {
      e.preventDefault();
      openShortcutsModal();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
