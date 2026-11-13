class VirtualRecordList {
  constructor(container, renderRecord, onSelect, onScroll) {
    this.container = container;
    this.renderRecord = renderRecord;
    this.onSelect = onSelect;
    this.onScroll = onScroll;
    this.rowHeight = 78;
    this.records = [];
    this.frame = null;
    this.first = -1;
    this.end = -1;
    container.addEventListener('scroll', () => {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.render();
        onScroll(Math.floor(container.scrollTop / this.rowHeight));
      });
    });
    container.addEventListener('click', event => {
      const button = event.target.closest('[data-record]');
      if (button) onSelect(button.dataset.record, true);
    });
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(container);
  }

  setRecords(records, firstIndex = 0) {
    this.records = records;
    this.first = -1;
    this.container.innerHTML = `<div style="height:${records.length * this.rowHeight}px" aria-hidden="true"></div>`;
    this.container.scrollTop = firstIndex * this.rowHeight;
    this.render();
  }

  render() {
    const first = Math.max(0, Math.floor(this.container.scrollTop / this.rowHeight) - 3);
    const count = Math.ceil(this.container.clientHeight / this.rowHeight) + 6;
    const end = Math.min(this.records.length, first + count);
    if (first === this.first && end === this.end) return;
    this.first = first; this.end = end;
    this.container.innerHTML = this.records.length
      ? `<div style="height:${first * this.rowHeight}px" aria-hidden="true"></div>` + this.records.slice(first, end).map(this.renderRecord).join('') + `<div style="height:${(this.records.length - end) * this.rowHeight}px" aria-hidden="true"></div>`
      : '<p class="ex-empty">没有匹配的档案，可调整筛选条件。</p>';
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
  }
}
window.VirtualRecordList = VirtualRecordList;
