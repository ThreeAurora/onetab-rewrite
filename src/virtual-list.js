// virtual-list.js — 虚拟滚动核心
// 约束：C2（DOM 常驻行数恒定 ≈ 可视区+2×BUFFER）、C7（固定行高）、
//       C8（滚动回调里只做 DOM 切片）、K7（spacer 撑高 + list transform）、K9（rAF 节流 + passive）。

const ROW_H = 26;
const BUFFER = 10;

export class VirtualList {
  constructor(viewport, renderRow) {
    this.viewport = viewport;
    this.renderRow = renderRow;
    this.rows = [];
    this._raf = 0;
    this._lastKey = '';
    this._start = 0;
    this._end = 0;

    this.spacer = document.createElement('div');
    this.spacer.style.cssText = 'height:0;width:1px;';

    // K7：list 绝对定位 + transform 平移，滚动条高度交给 spacer
    this.list = document.createElement('div');
    this.list.style.cssText =
      'position:absolute;top:0;left:0;right:0;will-change:transform;';

    viewport.style.position = 'relative';
    viewport.appendChild(this.spacer);
    viewport.appendChild(this.list);
    viewport.addEventListener('scroll', () => this._schedule(), { passive: true });
  }

  setData(rows, opts = {}) {
    this.rows = rows;
    this.spacer.style.height = (rows.length * ROW_H) + 'px';
    this._lastKey = '';
    if (!opts.keepScroll) {
      // 行数变化后钳制滚动位置，避免 scrollTop 越界导致空视区
      const max = Math.max(0, rows.length * ROW_H - this.viewport.clientHeight);
      if (this.viewport.scrollTop > max) this.viewport.scrollTop = max;
    }
    this.render(true);
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }

  render(force) {
    const sc = this.viewport.scrollTop;
    const vh = this.viewport.clientHeight;
    const start = Math.max(0, Math.floor(sc / ROW_H) - BUFFER);
    const end = Math.min(this.rows.length, Math.ceil((sc + vh) / ROW_H) + BUFFER);
    const key = start + ':' + end;
    if (!force && key === this._lastKey) return;
    this._lastKey = key;
    this._start = start;
    this._end = end;

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) frag.appendChild(this.renderRow(this.rows[i], i));

    this.list.textContent = '';
    this.list.appendChild(frag);
    this.list.style.transform = `translateY(${start * ROW_H}px)`;
  }

  // 渲染中某一行对应的 DOM 节点；未渲染返回 null
  rowAt(i) {
    if (i < this._start || i >= this._end) return null;
    return this.list.children[i - this._start] || null;
  }

  get start() { return this._start; }
  get end() { return this._end; }

  scrollToIndex(i, alignTop = true) {
    const vh = this.viewport.clientHeight;
    const top = i * ROW_H;
    if (alignTop) {
      this.viewport.scrollTop = top - vh / 2 + ROW_H / 2;
    } else {
      const y = this.viewport.scrollTop;
      if (top < y + ROW_H) this.viewport.scrollTop = top - vh + ROW_H;
      else if (top > y + vh - ROW_H) this.viewport.scrollTop = top - vh + ROW_H;
    }
  }
}

export { ROW_H };
