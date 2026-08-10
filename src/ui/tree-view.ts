import { FlatNode, UserSettings } from '../shared/types';
import { Virtualizer } from '../engine/virtualizer';

export interface TreeViewOptions {
  container: HTMLElement;
  settings: UserSettings;
  onToggleExpand: (nodeId: string) => void;
  onCopyToast: (message: string) => void;
}

export class TreeView {
  private container: HTMLElement;
  private settings: UserSettings;
  private virtualizer: Virtualizer;
  private nodes: FlatNode[] = [];
  private selectedNodeId: string | null = null;
  private matchedIds: Set<string> = new Set();
  private onToggleExpand: (nodeId: string) => void;
  private onCopyToast: (message: string) => void;

  constructor(options: TreeViewOptions) {
    this.container = options.container;
    this.settings = options.settings;
    this.onToggleExpand = options.onToggleExpand;
    this.onCopyToast = options.onCopyToast;

    this.virtualizer = new Virtualizer({
      container: this.container,
      rowHeight: this.settings.virtualRowHeight,
      onRender: (visibleNodes, startIndex) => this.renderRows(visibleNodes, startIndex)
    });

    this.bindKeyboardNav();
  }

  public setNodes(nodes: FlatNode[], matchedIds: Set<string> = new Set()) {
    this.nodes = nodes;
    this.matchedIds = matchedIds;
    this.virtualizer.setNodes(nodes);
  }

  public updateSettings(settings: UserSettings) {
    this.settings = settings;
    this.virtualizer.updateView();
  }

  private bindKeyboardNav() {
    this.container.tabIndex = 0;
    this.container.addEventListener('keydown', (e) => {
      if (this.nodes.length === 0) return;

      const currentIndex = this.selectedNodeId
        ? this.nodes.findIndex((n) => n.id === this.selectedNodeId)
        : 0;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(this.nodes.length - 1, currentIndex + 1);
        this.selectedNodeId = this.nodes[nextIndex].id;
        this.scrollToSelected(nextIndex);
        this.virtualizer.updateView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(0, currentIndex - 1);
        this.selectedNodeId = this.nodes[prevIndex].id;
        this.scrollToSelected(prevIndex);
        this.virtualizer.updateView();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter') {
        const currentNode = this.nodes[currentIndex];
        if (currentNode && currentNode.hasChildren) {
          e.preventDefault();
          if (
            (e.key === 'ArrowRight' && !currentNode.isExpanded) ||
            (e.key === 'ArrowLeft' && currentNode.isExpanded) ||
            e.key === 'Enter'
          ) {
            this.onToggleExpand(currentNode.id);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.selectedNodeId) {
        const selectedNode = this.nodes.find((n) => n.id === this.selectedNodeId);
        if (selectedNode) {
          e.preventDefault();
          const copyText = selectedNode.hasChildren
            ? selectedNode.path
            : String(selectedNode.value);
          navigator.clipboard.writeText(copyText);
          this.onCopyToast(`Copied value for ${selectedNode.path}`);
        }
      }
    });
  }

  private scrollToSelected(index: number) {
    const targetY = index * this.settings.virtualRowHeight;
    const viewportHeight = this.container.clientHeight;
    const currentScrollTop = this.container.scrollTop;

    if (targetY < currentScrollTop) {
      this.container.scrollTop = targetY;
    } else if (targetY + this.settings.virtualRowHeight > currentScrollTop + viewportHeight) {
      this.container.scrollTop = targetY + this.settings.virtualRowHeight - viewportHeight;
    }
  }

  private renderRows(visibleNodes: FlatNode[], startIndex: number) {
    const wrapper = this.virtualizer.getContentWrapper();
    wrapper.innerHTML = '';

    visibleNodes.forEach((node, i) => {
      const globalIndex = startIndex + i;
      const rowEl = document.createElement('div');
      rowEl.className = 'pjv-row';
      if (node.id === this.selectedNodeId) rowEl.classList.add('selected');
      if (node.diffStatus) rowEl.classList.add(`diff-${node.diffStatus}`);

      rowEl.style.height = `${this.settings.virtualRowHeight}px`;

      // Line number
      if (this.settings.showLineNumbers) {
        const lineNoEl = document.createElement('span');
        lineNoEl.className = 'pjv-line-no';
        lineNoEl.textContent = String(globalIndex + 1);
        rowEl.appendChild(lineNoEl);
      }

      // Indent guides
      const indentContainer = document.createElement('span');
      indentContainer.style.display = 'inline-flex';
      indentContainer.style.height = '100%';

      for (let d = 1; d < node.depth; d++) {
        const guide = document.createElement('span');
        guide.className = 'pjv-indent-guide';
        guide.style.width = `${this.settings.indentSize}px`;
        indentContainer.appendChild(guide);
      }
      rowEl.appendChild(indentContainer);

      // Arrow toggle icon
      const arrowEl = document.createElement('span');
      arrowEl.className = 'pjv-arrow';
      if (node.hasChildren) {
        arrowEl.textContent = '▶';
        if (node.isExpanded) arrowEl.classList.add('expanded');
      } else {
        arrowEl.style.visibility = 'hidden';
      }
      rowEl.appendChild(arrowEl);

      // Key name
      if (node.key !== null) {
        const keyEl = document.createElement('span');
        keyEl.className = 'pjv-key';
        keyEl.textContent = typeof node.key === 'number' ? `[${node.key}]` : `"${node.key}"`;
        if (this.matchedIds.has(node.id)) keyEl.classList.add('pjv-search-highlight');
        rowEl.appendChild(keyEl);

        const colonEl = document.createElement('span');
        colonEl.className = 'pjv-colon';
        colonEl.textContent = ':';
        rowEl.appendChild(colonEl);
      }

      // Value rendering
      const valEl = document.createElement('span');
      if (node.hasChildren) {
        valEl.className = 'pjv-val-summary';
        valEl.textContent = String(node.value);
      } else {
        valEl.className = `pjv-val-${node.type}`;
        valEl.textContent = node.type === 'string' ? `"${node.value}"` : String(node.value);
      }
      if (this.matchedIds.has(node.id)) valEl.classList.add('pjv-search-highlight');
      rowEl.appendChild(valEl);

      // Smart badge rendering (JWT, TIMESTAMP, LINK, BASE64, ANOMALY)
      if (node.smart) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'pjv-smart-badge';
        badgeEl.textContent = node.smart.badge || node.smart.type.toUpperCase();
        badgeEl.title = node.smart.formatted || node.smart.raw;

        if (node.smart.type === 'url') {
          badgeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(node.smart!.raw, '_blank');
          });
        } else {
          badgeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            alert(`${node.smart!.badge}:\n\n${node.smart!.formatted}`);
          });
        }

        rowEl.appendChild(badgeEl);
      }

      // Click event for selection and expand toggle
      rowEl.addEventListener('click', () => {
        this.selectedNodeId = node.id;
        this.virtualizer.updateView();

        if (node.hasChildren) {
          this.onToggleExpand(node.id);
        }
      });

      // Context menu for copying key, value, JSONPath
      rowEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const copyChoice = prompt(
          `Action for ${node.path}:\n1. Copy Value\n2. Copy Key\n3. Copy JSONPath`,
          '1'
        );
        if (copyChoice === '1') {
          const text = node.hasChildren ? JSON.stringify(node.value) : String(node.value);
          navigator.clipboard.writeText(text);
          this.onCopyToast('Copied node value');
        } else if (copyChoice === '2' && node.key !== null) {
          navigator.clipboard.writeText(String(node.key));
          this.onCopyToast('Copied node key');
        } else if (copyChoice === '3') {
          navigator.clipboard.writeText(node.path);
          this.onCopyToast('Copied JSONPath');
        }
      });

      wrapper.appendChild(rowEl);
    });
  }
}
