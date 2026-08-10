import { computeStructuralDiff } from '../engine/diff-engine';
import { FlatNode } from '../shared/types';

export interface DiffViewOptions {
  primaryData: any;
  onDiffReady: (diffNodes: FlatNode[], stats: { added: number; removed: number; modified: number }) => void;
}

export function openDiffModal(options: DiffViewOptions) {
  const backdrop = document.createElement('div');
  backdrop.className = 'pjv-modal-backdrop';
  backdrop.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
    z-index: 10000; display: flex; align-items: center; justify-content: center;
  `;

  const modal = document.createElement('div');
  modal.className = 'pjv-modal';
  modal.style.cssText = `
    background: var(--pjv-bg-main); color: var(--pjv-text-main);
    border: 1px solid var(--pjv-border-color); border-radius: 8px;
    width: 90%; max-width: 650px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  `;

  modal.innerHTML = `
    <h3 style="margin-top:0; color:var(--pjv-syntax-key);">Diff Mode — Compare Secondary JSON</h3>
    <p style="font-size:12px; color:var(--pjv-text-muted);">
      Paste another JSON document or API payload below to compare against the current document.
    </p>
    <textarea id="pjv-diff-textarea" style="
      width: 100%; height: 220px; box-sizing: border-box;
      background: var(--pjv-bg-badge); color: var(--pjv-text-main);
      font-family: var(--pjv-font-mono); font-size: 12px; padding: 10px;
      border: 1px solid var(--pjv-border-color); border-radius: 6px; outline: none;
    " placeholder='{"status": "success", "data": ...}'></textarea>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button id="pjv-diff-cancel" class="pjv-btn" style="background:var(--pjv-bg-badge);">Cancel</button>
      <button id="pjv-diff-compare" class="pjv-btn active">Compare Diff</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const cancelBtn = modal.querySelector('#pjv-diff-cancel') as HTMLButtonElement;
  const compareBtn = modal.querySelector('#pjv-diff-compare') as HTMLButtonElement;
  const textarea = modal.querySelector('#pjv-diff-textarea') as HTMLTextAreaElement;

  cancelBtn.onclick = () => backdrop.remove();

  compareBtn.onclick = () => {
    try {
      const secondaryData = JSON.parse(textarea.value);
      const { diffNodes, stats } = computeStructuralDiff(options.primaryData, secondaryData);
      options.onDiffReady(diffNodes, stats);
      backdrop.remove();
    } catch (err) {
      alert(`Invalid Secondary JSON: ${(err as Error).message}`);
    }
  };
}
