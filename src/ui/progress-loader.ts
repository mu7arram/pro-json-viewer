import { ParseProgressPayload } from '../shared/types';

export class ProgressLoader {
  private overlayEl: HTMLElement;
  private stageTextEl: HTMLElement;
  private percentTextEl: HTMLElement;
  private progressBarFillEl: HTMLElement;
  private detailsTextEl: HTMLElement;

  constructor(targetContainer: HTMLElement = document.body, initialBytes: number = 0) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'pjv-progress-loader-overlay';

    const formattedInitial = initialBytes > 0 ? this.formatBytes(initialBytes) : '';

    this.overlayEl.innerHTML = `
      <div class="pjv-progress-loader-card">
        <div class="pjv-progress-loader-header">
          <div class="pjv-progress-spinner"></div>
          <div class="pjv-progress-title-box">
            <h4 class="pjv-progress-title">Processing Large Payload</h4>
            <span class="pjv-progress-subtitle" id="pjv-progress-stage">Initializing background parser worker...</span>
          </div>
        </div>

        <div class="pjv-progress-track">
          <div class="pjv-progress-fill" id="pjv-progress-fill" style="width: 5%;"></div>
        </div>

        <div class="pjv-progress-footer">
          <span class="pjv-progress-details" id="pjv-progress-details">${formattedInitial ? `Payload: ${formattedInitial}` : 'Off-thread background processing'}</span>
          <span class="pjv-progress-percent" id="pjv-progress-percent">5%</span>
        </div>
      </div>
    `;

    this.stageTextEl = this.overlayEl.querySelector('#pjv-progress-stage') as HTMLElement;
    this.percentTextEl = this.overlayEl.querySelector('#pjv-progress-percent') as HTMLElement;
    this.progressBarFillEl = this.overlayEl.querySelector('#pjv-progress-fill') as HTMLElement;
    this.detailsTextEl = this.overlayEl.querySelector('#pjv-progress-details') as HTMLElement;

    targetContainer.appendChild(this.overlayEl);
  }

  public update(progress: ParseProgressPayload) {
    if (this.stageTextEl) {
      this.stageTextEl.textContent = progress.stage;
    }

    if (this.percentTextEl) {
      this.percentTextEl.textContent = `${Math.round(progress.percent)}%`;
    }

    if (this.progressBarFillEl) {
      this.progressBarFillEl.style.width = `${Math.max(5, Math.min(100, progress.percent))}%`;
    }

    if (this.detailsTextEl && progress.bytesProcessed !== undefined && progress.totalBytes !== undefined) {
      const processedStr = this.formatBytes(progress.bytesProcessed);
      const totalStr = this.formatBytes(progress.totalBytes);
      const elapsedStr = progress.elapsedMs !== undefined ? ` • ⏱️ ${progress.elapsedMs}ms` : '';
      this.detailsTextEl.textContent = `${processedStr} / ${totalStr}${elapsedStr}`;
    }
  }

  public remove() {
    this.overlayEl.classList.add('pjv-fade-out');
    setTimeout(() => {
      if (this.overlayEl && this.overlayEl.parentNode) {
        this.overlayEl.parentNode.removeChild(this.overlayEl);
      }
    }, 250);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
