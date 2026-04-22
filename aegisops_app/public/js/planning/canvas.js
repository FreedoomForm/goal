/**
 * AegisOps WorkflowCanvas v3 — Ground-up rewrite.
 *
 * Anti-blur measures for Windows Electron:
 *   - All coordinates are Math.round()'d before applying as CSS left/top/transform
 *   - SVG paths use rounded coordinates
 *   - No CSS filter, no backdrop-filter, no alpha compositing tricks
 *   - transform: translate() values are always integers
 *   - Canvas host size is set via JS with explicit pixel values
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 200;
  const PORT_OFF_OUT = NODE_W;
  const PORT_Y_OFF = 20;

  class WorkflowCanvas {
    constructor(hostEl, opts) {
      this.host = hostEl;
      this.onChange = opts.onChange || (() => {});
      this.onOpenInspector = opts.onOpenInspector || (() => {});
      this.onRunPreview = opts.onRunPreview || null;

      this.nodes = new Map();
      this.edges = [];
      this._nid = 1;
      this._scale = 1;
      this._ox = 0;
      this._oy = 0;
      this._drag = null;
      this._wire = null;
      this._pan = null;
      this._selId = null;

      this._buildDOM();
      this._bindEvents();
    }

    /* ── DOM construction ── */

    _buildDOM() {
      this.host.innerHTML = '';

      // Toolbar
      this._toolbar = this._el('div', 'wf-canvas-toolbar');
      this._toolbar.innerHTML =
        btn('🎯 Центр', 'fit') + btn('➕', 'zoom-in') + btn('➖', 'zoom-out') +
        btn('🗑️', 'clear') +
        (this.onRunPreview ? '<button class="wf-tb-btn wf-tb-primary" data-act="run">▶ Запустить</button>' : '') +
        '<span class="wf-tb-zoom"></span>';
      this.host.appendChild(this._toolbar);

      // Viewport
      this._vp = this._el('div', 'wf-viewport');
      this.host.appendChild(this._vp);

      // SVG edges layer
      this._edgesLayer = this._el('div', 'wf-edges-layer');
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      this._svg = svg;
      // Arrow marker
      const defs = document.createElementNS(SVG_NS, 'defs');
      const marker = document.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', 'wf-arr');
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      const arrowPath = document.createElementNS(SVG_NS, 'path');
      arrowPath.setAttribute('d', 'M0 0 L10 5 L0 10 z');
      arrowPath.setAttribute('fill', '#3366cc');
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
      svg.appendChild(defs);
      this._edgesGroup = document.createElementNS(SVG_NS, 'g');
      svg.appendChild(this._edgesGroup);
      this._edgesLayer.appendChild(svg);
      this._vp.appendChild(this._edgesLayer);

      // Nodes layer
      this._nodesLayer = this._el('div', 'wf-nodes-layer');
      this._vp.appendChild(this._nodesLayer);

      // Dot grid
      const grid = this._el('div', 'wf-dot-grid');
      this._vp.appendChild(grid);

      this._applyTransform();
    }

    /* ── Event binding ── */

    _bindEvents() {
      // Toolbar
      this._toolbar.addEventListener('click', (e) => {
        const act = e.target.dataset.act || e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'fit') this.fit();
        else if (act === 'zoom-in') this.setScale(this._scale * 1.25);
        else if (act === 'zoom-out') this.setScale(this._scale / 1.25);
        else if (act === 'clear') { if (confirm('Очистить весь workflow?')) { this.clear(); this.onChange(); } }
        else if (act === 'run' && this.onRunPreview) this.onRunPreview();
      });

      // Pan + drag + wire
      this._vp.addEventListener('mousedown', (e) => {
        const portEl = e.target.closest('.wf-port');
        const nodeEl = e.target.closest('.wf-node');
        const isBg = !portEl && !nodeEl;

        if (portEl && portEl.classList.contains('wf-port-out')) {
          const nd = this._nodeFromEl(nodeEl);
          if (!nd) return;
          e.stopPropagation();
          this._wire = { fromId: nd.id, tmp: this._makeTempPath() };
          return;
        }

        if (isBg) {
          this._pan = { sx: e.clientX, sy: e.clientY, ox: this._ox, oy: this._oy };
          this._deselect();
          return;
        }

        if (nodeEl) {
          const nd = this._nodeFromEl(nodeEl);
          if (!nd) return;
          this._select(nd.id);
          const r = this._vp.getBoundingClientRect();
          this._drag = {
            id: nd.id,
            dx: (e.clientX - r.left - this._ox) / this._scale - nd.x,
            dy: (e.clientY - r.top  - this._oy) / this._scale - nd.y,
          };
        }
      });

      window.addEventListener('mousemove', (e) => this._onMove(e));
      window.addEventListener('mouseup', (e) => this._onUp(e));

      // Zoom
      this._vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        const d = -e.deltaY * 0.001;
        this.setScale(Math.max(0.2, Math.min(2.5, this._scale + d)));
      }, { passive: false });

      // Drop from palette
      this._vp.addEventListener('dragover', (e) => e.preventDefault());
      this._vp.addEventListener('drop', (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('application/aegisops-node');
        if (!raw) return;
        try {
          const tpl = JSON.parse(raw);
          const r = this._vp.getBoundingClientRect();
          const x = Math.round((e.clientX - r.left - this._ox) / this._scale);
          const y = Math.round((e.clientY - r.top  - this._oy) / this._scale);
          this.addNode({ ...tpl, x, y });
          this.onChange();
        } catch (err) { console.error('[Canvas] Drop error:', err); }
      });
    }

    _onMove(e) {
      if (this._pan) {
        this._ox = this._pan.ox + (e.clientX - this._pan.sx);
        this._oy = this._pan.oy + (e.clientY - this._pan.sy);
        this._applyTransform();
      }
      if (this._drag) {
        const r = this._vp.getBoundingClientRect();
        const nd = this.nodes.get(this._drag.id);
        if (!nd) return;
        nd.x = Math.round((e.clientX - r.left - this._ox) / this._scale - this._drag.dx);
        nd.y = Math.round((e.clientY - r.top  - this._oy) / this._scale - this._drag.dy);
        nd.el.style.left = nd.x + 'px';
        nd.el.style.top  = nd.y + 'px';
        this._drawEdges();
      }
      if (this._wire) {
        const src = this.nodes.get(this._wire.fromId);
        if (!src) return;
        const r = this._vp.getBoundingClientRect();
        const x2 = Math.round((e.clientX - r.left - this._ox) / this._scale);
        const y2 = Math.round((e.clientY - r.top  - this._oy) / this._scale);
        this._wire.tmp.setAttribute('d', this._curve(src.x + PORT_OFF_OUT, src.y + PORT_Y_OFF, x2, y2));
      }
    }

    _onUp(e) {
      if (this._drag) { this._drag = null; this.onChange(); }
      if (this._pan) { this._pan = null; }
      if (this._wire) {
        const portEl = e.target.closest('.wf-port');
        const nodeEl = e.target.closest('.wf-node');
        if (portEl && portEl.classList.contains('wf-port-in') && nodeEl) {
          const tgt = this._nodeFromEl(nodeEl);
          if (tgt && tgt.id !== this._wire.fromId) {
            this.addEdge(this._wire.fromId, tgt.id);
            this.onChange();
          }
        }
        this._wire.tmp.remove();
        this._wire = null;
      }
    }

    /* ── Public API ── */

    addNode({ id, type, label, icon, params = {}, x = 100, y = 100 }) {
      const nid = id || ('n' + this._nid++);
      if (id) this._nid = Math.max(this._nid, parseInt(String(id).replace(/\D/g, '')) + 1);

      const el = document.createElement('div');
      el.className = 'wf-node';
      el.dataset.id = nid;
      el.style.left = Math.round(x) + 'px';
      el.style.top  = Math.round(y) + 'px';
      el.innerHTML =
        `<div class="wf-node-head">` +
          `<span class="wf-node-ico">${icon || '⚙️'}</span>` +
          `<span class="wf-node-lbl">${esc(label || type)}</span>` +
          `<button class="wf-node-del" title="Удалить">✕</button>` +
        `</div>` +
        `<div class="wf-node-type">${esc(type)}</div>` +
        `<div class="wf-port wf-port-in" data-port="in"></div>` +
        `<div class="wf-port wf-port-out" data-port="out"></div>`;

      this._nodesLayer.appendChild(el);
      const node = { id: nid, type, label: label || type, icon, params, x: Math.round(x), y: Math.round(y), el };
      this.nodes.set(nid, node);

      el.querySelector('.wf-node-del').onclick = (ev) => { ev.stopPropagation(); this.removeNode(nid); this.onChange(); };
      el.addEventListener('dblclick', () => this.onOpenInspector(this.nodes.get(nid)));

      this._drawEdges();
      return node;
    }

    removeNode(id) {
      const nd = this.nodes.get(id);
      if (!nd) return;
      nd.el.remove();
      this.nodes.delete(id);
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      if (this._selId === id) this._selId = null;
      this._drawEdges();
    }

    addEdge(from, to) {
      if (from === to) return;
      if (this.edges.some(e => e.from === from && e.to === to)) return;
      if (this.edges.some(e => e.from === to && e.to === from)) return;
      this.edges.push({ from, to });
      this._drawEdges();
    }

    removeEdge(from, to) {
      this.edges = this.edges.filter(e => !(e.from === from && e.to === to));
      this._drawEdges();
    }

    updateNodeParams(id, params) {
      const nd = this.nodes.get(id);
      if (nd) { nd.params = params; this.onChange(); }
    }

    clear() {
      for (const id of [...this.nodes.keys()]) this.removeNode(id);
      this.edges = [];
      this._drawEdges();
    }

    fit() {
      if (this.nodes.size === 0) { this._ox = 0; this._oy = 0; this._scale = 1; this._applyTransform(); return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of this.nodes.values()) {
        x0 = Math.min(x0, n.x);
        y0 = Math.min(y0, n.y);
        x1 = Math.max(x1, n.x + NODE_W);
        y1 = Math.max(y1, n.y + 60);
      }
      const pad = 40;
      const r = this._vp.getBoundingClientRect();
      const w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
      this._scale = Math.min(r.width / w, r.height / h, 1.2);
      this._scale = Math.max(0.2, this._scale);
      this._ox = Math.round((r.width  - w * this._scale) / 2 - x0 * this._scale + pad * this._scale);
      this._oy = Math.round((r.height - h * this._scale) / 2 - y0 * this._scale + pad * this._scale);
      this._applyTransform();
    }

    setScale(s) {
      this._scale = Math.max(0.2, Math.min(2.5, s));
      this._applyTransform();
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
        this.addNode({ id: n.id, type: n.type, label: n.label, icon: n.icon,
          params: n.params || {}, x: n.position?.x || 50, y: n.position?.y || 50 });
      }
      (graph.edges || []).forEach(e => this.addEdge(e.from, e.to));
      this.fit();
    }

    highlightTrace(trace) {
      for (const n of this.nodes.values()) {
        n.el.classList.remove('wf-trace-ok', 'wf-trace-error', 'wf-trace-skip');
      }
      for (const t of trace) {
        const n = this.nodes.get(t.id);
        if (!n) continue;
        if (t.status === 'ok') n.el.classList.add('wf-trace-ok');
        else if (t.status === 'error') n.el.classList.add('wf-trace-error');
        else n.el.classList.add('wf-trace-skip');
      }
    }

    /* ── Internals ── */

    _applyTransform() {
      const tx = Math.round(this._ox) + 'px';
      const ty = Math.round(this._oy) + 'px';
      this._nodesLayer.style.transform  = `translate(${tx},${ty}) scale(${this._scale})`;
      this._edgesLayer.style.transform  = `translate(${tx},${ty}) scale(${this._scale})`;
      const lbl = this._toolbar.querySelector('.wf-tb-zoom');
      if (lbl) lbl.textContent = Math.round(this._scale * 100) + '%';
    }

    _drawEdges() {
      this._edgesGroup.innerHTML = '';
      for (const e of this.edges) {
        const a = this.nodes.get(e.from), b = this.nodes.get(e.to);
        if (!a || !b) continue;
        const x1 = Math.round(a.x + PORT_OFF_OUT), y1 = Math.round(a.y + PORT_Y_OFF);
        const x2 = Math.round(b.x), y2 = Math.round(b.y + PORT_Y_OFF);
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', this._curve(x1, y1, x2, y2));
        path.setAttribute('stroke', '#3366cc');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#wf-arr)');
        path.classList.add('wf-edge');
        path.dataset.from = e.from;
        path.dataset.to = e.to;
        path.addEventListener('dblclick', () => {
          if (confirm('Удалить связь?')) { this.removeEdge(e.from, e.to); this.onChange(); }
        });
        this._edgesGroup.appendChild(path);
      }
    }

    _curve(x1, y1, x2, y2) {
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
      return `M${x1} ${y1} C${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
    }

    _makeTempPath() {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('stroke', '#59a8ff');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-dasharray', '4 4');
      this._edgesGroup.appendChild(p);
      return p;
    }

    _select(id) {
      this._deselect();
      this._selId = id;
      const nd = this.nodes.get(id);
      if (nd) nd.el.classList.add('wf-selected');
    }

    _deselect() {
      if (this._selId) {
        const nd = this.nodes.get(this._selId);
        if (nd) nd.el.classList.remove('wf-selected');
      }
      this._selId = null;
    }

    _nodeFromEl(nodeEl) {
      if (!nodeEl) return null;
      return this.nodes.get(nodeEl.dataset.id) || null;
    }

    _el(tag, cls) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    }
  }

  function btn(label, act) {
    return `<button class="wf-tb-btn" data-act="${act}">${label}</button>`;
  }

  function esc(s) {
    const d = document.createElement('span');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  window.WorkflowCanvas = WorkflowCanvas;
})();
