import { FlatNode } from '../shared/types';

export interface VirtualizerOptions {
  container: HTMLElement;
  rowHeight: number;
  buffer?: number;
  onRender: (visibleNodes: FlatNode[], startIndex: number) => void;
}

export class Virtualizer {
  private container: HTMLElement;
  private rowHeight: number;
  private buffer: number;
  private onRender: (visibleNodes: FlatNode[], startIndex: number) => void;
  private nodes: FlatNode[] = [];
  private scrollListener: () => void;
  private resizeListener: () => void;
  private animationFrameId: number | null = null;
  private totalHeightSpacer: HTMLElement;
  private contentWrapper: HTMLElement;

  constructor(options: VirtualizerOptions) {
    this.container = options.container;
    this.rowHeight = options.rowHeight;
    this.buffer = options.buffer ?? 5;
    this.onRender = options.onRender;

    // Configure container style
    this.container.style.position = 'relative';
    this.container.style.overflowY = 'auto';

    // Total height spacer
    this.totalHeightSpacer = document.createElement('div');
    this.totalHeightSpacer.className = 'virtual-spacer';
    this.totalHeightSpacer.style.width = '100%';
    this.totalHeightSpacer.style.position = 'absolute';
    this.totalHeightSpacer.style.top = '0';
    this.totalHeightSpacer.style.left = '0';
    this.totalHeightSpacer.style.pointerEvents = 'none';

    // Visible content wrapper
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.className = 'virtual-content-wrapper';
    this.contentWrapper.style.width = '100%';
    this.contentWrapper.style.position = 'absolute';
    this.contentWrapper.style.top = '0';
    this.contentWrapper.style.left = '0';

    this.container.appendChild(this.totalHeightSpacer);
    this.container.appendChild(this.contentWrapper);

    this.scrollListener = () => {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = requestAnimationFrame(() => this.updateView());
    };

    this.resizeListener = () => this.updateView();

    this.container.addEventListener('scroll', this.scrollListener, { passive: true });
    window.addEventListener('resize', this.resizeListener);
  }

  public setNodes(nodes: FlatNode[]) {
    this.nodes = nodes;
    const totalHeight = this.nodes.length * this.rowHeight;
    this.totalHeightSpacer.style.height = `${totalHeight}px`;
    this.updateView();
  }

  public getContentWrapper(): HTMLElement {
    return this.contentWrapper;
  }

  public updateView() {
    if (this.nodes.length === 0) {
      this.totalHeightSpacer.style.height = '0px';
      this.contentWrapper.style.transform = 'translate3d(0, 0, 0)';
      this.onRender([], 0);
      return;
    }

    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight || 600;

    const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.buffer);
    const endIndex = Math.min(
      this.nodes.length,
      Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.buffer
    );

    const offsetY = startIndex * this.rowHeight;
    this.contentWrapper.style.transform = `translate3d(0, ${offsetY}px, 0)`;

    const visibleNodes = this.nodes.slice(startIndex, endIndex);
    this.onRender(visibleNodes, startIndex);
  }

  public destroy() {
    this.container.removeEventListener('scroll', this.scrollListener);
    window.removeEventListener('resize', this.resizeListener);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
