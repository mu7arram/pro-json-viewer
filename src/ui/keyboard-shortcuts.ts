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
  const existingBackdrop = document.querySelector('.pjv-shortcuts-backdrop');
  if (existingBackdrop) existingBackdrop.remove();

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌥' : 'Alt';
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-shortcuts-backdrop';

  const modal = document.createElement('div');
  modal.className = 'pjv-shortcuts-dialog';

  modal.innerHTML = `
    <div class="pjv-shortcuts-header">
      <div class="pjv-shortcuts-title-wrap">
        <span class="pjv-shortcuts-icon">⌨️</span>
        <h3>Keyboard Shortcuts</h3>
      </div>
      <button id="pjv-shortcuts-close-x" class="pjv-btn">✕</button>
    </div>

    <div class="pjv-shortcuts-body">
      <!-- Views & Navigation -->
      <div class="pjv-shortcuts-group">
        <div class="pjv-shortcuts-group-title">Navigation & Views</div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Tree View</span>
          <div class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>1</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Table View</span>
          <div class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>2</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Chart View</span>
          <div class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>3</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Diagram View</span>
          <div class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>4</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Raw JSON View</span>
          <div class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>5</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Compare Diff</span>
          <div class="pjv-kbd-group"><kbd>${modKey}</kbd> + <kbd>6</kbd></div>
        </div>
      </div>

      <!-- Actions & Tree Operations -->
      <div class="pjv-shortcuts-group">
        <div class="pjv-shortcuts-group-title">Search & Tools</div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Focus Search</span>
          <div class="pjv-kbd-group"><kbd>/</kbd> or <kbd>${cmdKey}</kbd>+<kbd>F</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Developer Tools</span>
          <div class="pjv-kbd-group"><kbd>t</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Help Cheatsheet</span>
          <div class="pjv-kbd-group"><kbd>?</kbd></div>
        </div>
      </div>

      <div class="pjv-shortcuts-group">
        <div class="pjv-shortcuts-group-title">Tree Operations</div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Expand All</span>
          <div class="pjv-kbd-group"><kbd>e</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Collapse All</span>
          <div class="pjv-kbd-group"><kbd>c</kbd></div>
        </div>
        <div class="pjv-shortcuts-row">
          <span class="pjv-shortcuts-desc">Close Dialogs</span>
          <div class="pjv-kbd-group"><kbd>Esc</kbd></div>
        </div>
      </div>
    </div>

    <div class="pjv-shortcuts-footer">
      <span>Press <kbd>Esc</kbd> or click ✕ to dismiss</span>
      <button id="pjv-shortcuts-close" class="pjv-btn active">Got It</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const closeBtn = modal.querySelector('#pjv-shortcuts-close') as HTMLButtonElement;
  const closeXBtn = modal.querySelector('#pjv-shortcuts-close-x') as HTMLButtonElement;

  const close = () => backdrop.remove();
  if (closeBtn) closeBtn.onclick = close;
  if (closeXBtn) closeXBtn.onclick = close;
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
