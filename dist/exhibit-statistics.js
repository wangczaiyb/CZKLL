class ProvinceStatistics {
  constructor(store, onCity, onCategory) {
    this.store = store;
    this.onCity = onCity;
    this.onCategory = onCategory;
    this.showAll = false;
    this.counter = {value: 0};
    this.firstRender = true;
    document.getElementById('moreCities').addEventListener('click', () => { this.showAll = !this.showAll; this.render(this.store.matching()); });
    document.getElementById('cityBars').addEventListener('click', event => {
      const button = event.target.closest('[data-stat-city]');
      if (button) onCity(button.dataset.statCity);
    });
    document.getElementById('categoryStats').addEventListener('click', event => {
      const button = event.target.closest('[data-stat-category]');
      if (button) onCategory(button.dataset.statCategory);
    });
    document.getElementById('categoryDonut').addEventListener('click', event => {
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - box.x - box.width / 2;
      const y = event.clientY - box.y - box.height / 2;
      if (Math.hypot(x, y) < box.width * .25) return;
      const angle = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
      const slice = this.slices.find(slice => angle < slice.end * (this.donutProgress?.value ?? 1));
      if (slice) onCategory(slice.id);
    });
  }

  render(records) {
    const located = records.filter(record => record.longitude !== null).length;
    document.getElementById('statsScope').textContent = this.store.filters.city || this.store.database.metadata.fullName;
    const total = document.getElementById('statTotal');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.killTweensOf(this.counter);
    gsap.to(this.counter, {value: records.length, duration: reduced ? 0 : .5, delay: this.firstRender && !reduced ? .25 : 0, onUpdate: () => { total.textContent = Math.round(this.counter.value); }});
    this.firstRender = false;
    document.getElementById('statsLocationCount').textContent = `已关联坐标 ${located} 条 · 精确坐标待补 ${records.length - located} 条`;
    document.getElementById('statsSourceNote').textContent = `来源记录口径 · 本省区完整台账 ${this.store.records.length} 条`;
    const cities = this.store.database.cities.features.map(feature => ({name: feature.properties.name, count: records.filter(record => record.city === feature.properties.name).length})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    const max = Math.max(1, ...cities.map(city => city.count));
    const shown = this.showAll ? cities : cities.slice(0, 6);
    const bars = document.getElementById('cityBars'); bars.replaceChildren();
    for (const city of shown) {
      const button = document.createElement('button'); button.dataset.statCity = city.name;
      button.className = 'city-stat-row';
      const label = document.createElement('span'); label.textContent = city.name;
      const track = document.createElement('span'); track.className = 'city-stat-track';
      const fill = document.createElement('i'); fill.style.width = `${city.count / max * 100}%`;
      const count = document.createElement('b'); count.textContent = city.count;
      track.append(fill, count); button.append(label, track); bars.append(button);
    }
    document.getElementById('moreCities').textContent = this.showAll ? '收起城市' : `全部 ${cities.length} 个城市`;
    const categories = EXHIBIT_DESIGN.categories.map(category => ({...category, count: records.filter(record => record.displayCategory === category.id).length}));
    let angle = 0;
    this.slices = categories.filter(category => category.count).map(category => {
      const start = angle; angle += category.count / records.length * 360;
      return {...category, start, end: angle};
    });
    const donut = document.getElementById('categoryDonut');
    const signature = categories.map(category => category.count).join(',');
    if (signature !== this.signature) {
      if (this.donutProgress) gsap.killTweensOf(this.donutProgress);
      this.donutProgress = {value: 0};
      this.signature = signature;
      gsap.to(this.donutProgress, {value: 1, duration: reduced ? 0 : .7, onUpdate: () => {
        const progress = this.donutProgress.value;
        donut.style.background = records.length ? `conic-gradient(${this.slices.map(slice => `${slice.chart} ${slice.start * progress}deg ${slice.end * progress}deg`).join(',')},#24344B ${360 * progress}deg 360deg)` : '#24344B';
      }});
    }
    document.getElementById('donutTotal').textContent = records.length;
    const legend = document.getElementById('categoryStats'); legend.replaceChildren();
    for (const category of categories) {
      const button = document.createElement('button'); button.dataset.statCategory = category.id;
      button.classList.toggle('active', this.store.filters.category === category.id);
      button.style.setProperty('--category', category.chart);
      const swatch = document.createElement('i');
      const name = document.createElement('span'); name.textContent = category.name;
      const count = document.createElement('b'); count.textContent = category.count;
      button.append(swatch, name, count); legend.append(button);
    }
    const topCity = cities.find(city => city.count);
    const topCategory = [...categories].sort((a, b) => b.count - a.count)[0];
    const insights = document.getElementById('dataInsights'); insights.replaceChildren();
    const notes = records.length ? [
      `当前筛选共 ${records.length} 条来源记录，其中 ${located} 条已关联公开坐标。`,
      `${topCity.name}收录 ${topCity.count} 条，占当前记录 ${(topCity.count / records.length * 100).toFixed(1)}%。`,
      `${topCategory.name}为数量最多的展示类别，共 ${topCategory.count} 条。`,
      `已关联 ${new Set(records.filter(record => record.vrUrl).map(record => record.vrUrl)).size} 个独立VR入口，数字化总量尚缺核验字段。`
    ] : ['当前筛选没有匹配记录，可重置筛选查看完整台账。'];
    for (const note of notes) { const paragraph = document.createElement('p'); paragraph.textContent = note; insights.append(paragraph); }
  }
}
window.ProvinceStatistics = ProvinceStatistics;
