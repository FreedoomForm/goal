/**
 * AegisOps — Node-based Workflow Canvas (vanilla JS, no React).
 * Provides n8n-style UX: draggable nodes, curved wires, zoom/pan, inspector.
 *
 * The canvas emits events and exposes `exportGraph()` / `importGraph()`
 * so the rest of the SPA can save/load/run graphs via /api/workflows.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  class Canvas {
    constructor(root, { onChange, onOpenInspector, onRunPreview } = {}) {
      this.root = root;
      this.onChange = onChange || (() => {});
      this.onOpenInspector = onOpenInspector || (() => {});
      this.onRunPreview = onRunPreview;
      this.nodes = new Map();   // id -> { id, type, label, icon, params, x, y, el }
      this.edges = [];          // [{ from, to, el }]
      this.scale = 1;
      this.offset = { x: 0, y: 0 };
      this.nextId = 1;
      this.dragState = null;
      this.connectState = null;
      this.selectedId = null;

      this._build();
      this._attach();
    }

    _build() {
      this.root.classList.add('wf-canvas-root');
      this.root.innerHTML = `
        <div class="wf-toolbar">
          <button class="wf-btn" data-action="fit">🎯 Центр</button>
          <button class="wf-btn" data-action="zoom-in">➕</button>
          <button class="wf-btn" data-action="zoom-out">➖</button>
          <button class="wf-btn" data-action="clear">🗑️ Очистить</button>
          <button class="wf-btn wf-btn-primary" data-action="run">▶️ Запустить</button>
          <span class="wf-zoom-label"></span>
        </div>
        <div class="wf-viewport">
          <svg class="wf-edges" xmlns="${SVG_NS}"></svg>
          <div class="wf-nodes"></div>
          <div class="wf-grid"></div>
        </div>
      `;
      this.viewport = this.root.querySelector('.wf-viewport');
      this.nodesLayer = this.root.querySelector('.wf-nodes');
      this.edgesLayer = this.root.querySelector('.wf-edges');
      this.zoomLabel = this.root.querySelector('.wf-zoom-label');
      this._applyTransform();
    }

    _attach() {
      this.root.querySelector('[data-action="fit"]').onclick = () => this.fit();
      this.root.querySelector('[data-action="zoom-in"]').onclick = () => this.setScale(this.scale * 1.2);
      this.root.querySelector('[data-action="zoom-out"]').onclick = () => this.setScale(this.scale / 1.2);
      this.root.querySelector('[data-action="clear"]').onclick = () => {
        if (confirm('Очистить весь workflow?')) { this.clear(); this.onChange(); }
      };
      this.root.querySelector('[data-action="run"]').onclick = () => this.onRunPreview && this.onRunPreview();

      // Pan with middle-mouse / space+drag / background drag
      let panning = null;
      this.viewport.addEventListener('mousedown', e => {
        if (e.target === this.viewport || e.target.classList.contains('wf-grid') || e.target.classList.contains('wf-edges')) {
          panning = { x: e.clientX, y: e.clientY, ox: this.offset.x, oy: this.offset.y };
          this.viewport.style.cursor = 'grabbing';
          this._deselect();
        }
      });
      window.addEventListener('mousemove', e => {
        if (panning) {
          this.offset.x = panning.ox + (e.clientX - panning.x);
          this.offset.y = panning.oy + (e.clientY - panning.y);
          this._applyTransform();
        }
        if (this.dragState) this._onNodeDrag(e);
        if (this.connectState) this._onConnectDrag(e);
      });
      window.addEventListener('mouseup', e => {
        panning = null; this.viewport.style.cursor = '';
        if (this.dragState) { this.dragState = null; this.onChange(); }
        if (this.connectState) this._onConnectEnd(e);
      });

      // Zoom on wheel
      this.viewport.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        this.setScale(Math.max(0.3, Math.min(2.5, this.scale + delta)));
      }, { passive: false });

      // Drop from palette
      this.viewport.addEventListener('dragover', e => e.preventDefault());
      this.viewport.addEventListener('drop', e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('application/aegisops-node');
        if (!raw) return;
        const tpl = JSON.parse(raw);
        const rect = this.viewport.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.offset.x) / this.scale;
        const y = (e.clientY - rect.top - this.offset.y) / this.scale;
        this.addNode({ ...tpl, x, y });
        this.onChange();
      });
    }

    _applyTransform() {
      this.nodesLayer.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.scale})`;
      this.edgesLayer.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.scale})`;
      this.zoomLabel.textContent = Math.round(this.scale * 100) + '%';
    }

    setScale(s) { this.scale = s; this._applyTransform(); }

    addNode({ id, type, label, icon, params = {}, x = 100, y = 100 }) {
      const nodeId = id || `n${this.nextId++}`;
      if (id) this.nextId = Math.max(this.nextId, Number(String(id).replace(/\D/g, '')) + 1);
      const el = document.createElement('div');
      el.className = 'wf-node';
      el.dataset.id = nodeId;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.innerHTML = `
        <div class="wf-node-header">
          <span class="wf-node-icon">${icon || '⚙️'}</span>
          <span class="wf-node-label">${escapeHtml(label || type)}</span>
          <button class="wf-node-del" title="Удалить">✕</button>
        </div>
        <div class="wf-node-type">${escapeHtml(type)}</div>
        <div class="wf-port wf-port-in" data-port="in" title="Вход"></div>
        <div class="wf-port wf-port-out" data-port="out" title="Выход"></div>
      `;
      this.nodesLayer.appendChild(el);
      const node = { id: nodeId, type, label: label || type, icon, params, x, y, el };
      this.nodes.set(nodeId, node);

      el.querySelector('.wf-node-del').onclick = ev => {
        ev.stopPropagation();
        this.removeNode(nodeId);
        this.onChange();
      };
      el.addEventListener('mousedown', ev => {
        if (ev.target.classList.contains('wf-port')) return;
        if (ev.target.classList.contains('wf-node-del')) return;
        this._select(nodeId);
        const rect = this.viewport.getBoundingClientRect();
        this.dragState = {
          id: nodeId,
          dx: (ev.clientX - rect.left - this.offset.x) / this.scale - node.x,
          dy: (ev.clientY - rect.top - this.offset.y) / this.scale - node.y,
        };
      });
      el.addEventListener('dblclick', () => this.onOpenInspector(this.nodes.get(nodeId)));

      // Port interactions for wiring
      el.querySelector('.wf-port-out').addEventListener('mousedown', ev => {
        ev.stopPropagation();
        this.connectState = { fromId: nodeId, tempEl: this._createTempEdge() };
      });
      el.querySelector('.wf-port-in').addEventListener('mouseup', ev => {
        ev.stopPropagation();
        if (this.connectState && this.connectState.fromId !== nodeId) {
          this.addEdge(this.connectState.fromId, nodeId);
          this.onChange();
        }
        this._cancelConnect();
      });

      this._renderEdges();
      return node;
    }

    removeNode(id) {
      const node = this.nodes.get(id);
      if (!node) return;
      node.el.remove();
      this.nodes.delete(id);
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      this._renderEdges();
      if (this.selectedId === id) this.selectedId = null;
    }

    addEdge(from, to) {
      if (this.edges.some(e => e.from === from && e.to === to)) return;
      // Prevent obvious cycles (simple check: no direct back-edge)
      if (this.edges.some(e => e.from === to && e.to === from)) return;
      this.edges.push({ from, to });
      this._renderEdges();
    }

    removeEdge(from, to) {
      this.edges = this.edges.filter(e => !(e.from === from && e.to === to));
      this._renderEdges();
    }

    _onNodeDrag(ev) {
      const { id, dx, dy } = this.dragState;
      const node = this.nodes.get(id);
      const rect = this.viewport.getBoundingClientRect();
      node.x = (ev.clientX - rect.left - this.offset.x) / this.scale - dx;
      node.y = (ev.clientY - rect.top - this.offset.y) / this.scale - dy;
      node.el.style.left = node.x + 'px';
      node.el.style.top = node.y + 'px';
      this._renderEdges();
    }

    _createTempEdge() {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('stroke', '#7c5cff');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-dasharray', '4 4');
      this.edgesLayer.appendChild(p);
      return p;
    }

    _onConnectDrag(ev) {
      const src = this.nodes.get(this.connectState.fromId);
      if (!src) return;
      const rect = this.viewport.getBoundingClientRect();
      const x1 = src.x + 220; const y1 = src.y + 34;
      const x2 = (ev.clientX - rect.left - this.offset.x) / this.scale;
      const y2 = (ev.clientY - rect.top - this.offset.y) / this.scale;
      this.connectState.tempEl.setAttribute('d', this._curve(x1, y1, x2, y2));
    }

    _onConnectEnd() { this._cancelConnect(); }
    _cancelConnect() {
      if (this.connectState?.tempEl) this.connectState.tempEl.remove();
      this.connectState = null;
    }

    _curve(x1, y1, x2, y2) {
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    }

    _renderEdges() {
      const defs = `<defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#59a8ff"/>
        </marker>
      </defs>`;
      const items = this.edges.map(e => {
        const a = this.nodes.get(e.from); const b = this.nodes.get(e.to);
        if (!a || !b) return '';
        const x1 = a.x + 220, y1 = a.y + 34;
        const x2 = b.x, y2 = b.y + 34;
        return `<path d="${this._curve(x1, y1, x2, y2)}" stroke="#59a8ff" stroke-width="2" fill="none"
                     marker-end="url(#wf-arrow)" class="wf-edge" data-from="${e.from}" data-to="${e.to}"/>`;
      }).join('');
      this.edgesLayer.innerHTML = defs + items;
      // Click edge to remove
      this.edgesLayer.querySelectorAll('.wf-edge').forEach(p => {
        p.addEventListener('dblclick', () => {
          if (confirm('Удалить связь?')) {
            this.removeEdge(p.dataset.from, p.dataset.to);
            this.onChange();
          }
        });
      });
    }

    _select(id) {
      this._deselect();
      this.selectedId = id;
      this.nodes.get(id)?.el.classList.add('selected');
    }
    _deselect() {
      if (this.selectedId) this.nodes.get(this.selectedId)?.el.classList.remove('selected');
      this.selectedId = null;
    }

    updateNodeParams(id, params) {
      const n = this.nodes.get(id);
      if (!n) return;
      n.params = params;
      this.onChange();
    }

    fit() {
      if (this.nodes.size === 0) { this.offset = { x: 0, y: 0 }; this.scale = 1; this._applyTransform(); return; }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of this.nodes.values()) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + 220); maxY = Math.max(maxY, n.y + 80);
      }
      const pad = 40;
      const rect = this.viewport.getBoundingClientRect();
      const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
      this.scale = Math.min(rect.width / w, rect.height / h, 1.2);
      this.offset.x = (rect.width - w * this.scale) / 2 - minX * this.scale + pad * this.scale;
      this.offset.y = (rect.height - h * this.scale) / 2 - minY * this.scale + pad * this.scale;
      this._applyTransform();
    }

    clear() {
      for (const id of [...this.nodes.keys()]) this.removeNode(id);
      this.edges = []; this._renderEdges();
    }

    exportGraph() {
      return {
        nodes: [...this.nodes.values()].map(n => ({
          id: n.id, type: n.type, label: n.label, icon: n.icon,
          params: n.params, position: { x: n.x, y: n.y },
        })),
        edges: this.edges.map(e => ({ from: e.from, to: e.to })),
      };
    }

    importGraph(graph) {
      this.clear();
      if (!graph || !Array.isArray(graph.nodes)) return;
      for (const n of graph.nodes) {
        this.addNode({
          id: n.id, type: n.type, label: n.label, icon: n.icon,
          params: n.params || {}, x: n.position?.x || 50, y: n.position?.y || 50,
        });
      }
      (graph.edges || []).forEach(e => this.addEdge(e.from, e.to));
      this.fit();
    }

    highlightTrace(trace = []) {
      for (const n of this.nodes.values()) n.el.classList.remove('trace-ok', 'trace-error', 'trace-skipped');
      for (const t of trace) {
        const n = this.nodes.get(t.id);
        if (!n) continue;
        if (t.status === 'ok') n.el.classList.add('trace-ok');
        else if (t.status === 'error') n.el.classList.add('trace-error');
        else n.el.classList.add('trace-skipped');
      }
    }
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

  window.WorkflowCanvas = Canvas;
})();
