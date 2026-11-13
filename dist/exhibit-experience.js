class ExhibitExperience {
  constructor(store, map, actions) {
    this.store = store;
    this.map = map;
    this.actions = actions;
    this.photosVisible = true;
    this.photoMarkers = new Map();
    this.statistics = new ProvinceStatistics(store, actions.city, actions.category);
    this.canvas = document.getElementById('regionConnections');
    this.context = this.canvas.getContext('2d');
    this.onMapMove = () => {
      if (!this.connectionFrame) this.connectionFrame = requestAnimationFrame(() => { this.connectionFrame = null; this.drawConnections(); });
    };
    this.onMapSettled = () => { this.updatePhotoMarkers(); this.drawConnections(); };
    this.bindMap(map);
    document.getElementById('photoToggle').addEventListener('click', event => {
      this.photosVisible = !this.photosVisible;
      event.currentTarget.classList.toggle('active', this.photosVisible);
      this.renderFeatured(); this.updatePhotoMarkers(); this.drawConnections();
    });
    document.getElementById('mappingInfo').addEventListener('click', () => {
      actions.dialog('<h2>展示类别映射</h2><p>原始类别保持原值。图例和统计采用以下映射，复合或含混类型保留为其他。</p>' + EXHIBIT_DESIGN.categories.map(category => `<section class="detail-section"><h3>${category.name}</h3><p>${Object.entries(EXHIBIT_DESIGN.kindMap).filter(([, id]) => id === category.id).map(([kind]) => kind).join('、')}</p></section>`).join(''));
    });
    document.getElementById('statsReset').addEventListener('click', () => actions.reset());
    document.getElementById('digitalToggle').addEventListener('click', () => {
      const rows = this.store.matching();
      const vr = new Set(rows.filter(record => record.vrUrl).map(record => record.vrUrl)).size;
      actions.dialog(`<h2>红色资源数字化</h2><p>当前筛选 ${rows.length} 条来源记录，已关联 ${vr} 个独立公开VR入口。数字化完成数量尚缺台账核验字段。</p><p>已关联公开坐标 ${rows.filter(record => record.longitude !== null).length} 条，原始资料、核对证据和坐标参考保存在每条遗址档案中。</p>`);
    });
    document.getElementById('timelineToggle').addEventListener('click', event => {
      const panel = document.getElementById('timelinePanel'); panel.hidden = !panel.hidden;
      event.currentTarget.classList.toggle('active', !panel.hidden);
      if (!panel.hidden) panel.scrollIntoView({behavior: this.reducedMotion() ? 'auto' : 'smooth', block: 'nearest'});
    });
    document.getElementById('closeHeritageDialog').addEventListener('click', () => document.getElementById('heritageDialog').close());
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById('heritageDialog').matches(':modal')) document.getElementById('heritageDialog').close(); });
  }

  reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

  render() {
    const records = this.store.matching();
    const signature = records.map(record => record.id).join('|') + JSON.stringify(this.store.filters);
    if (signature === this.lastSignature) { this.updatePhotoMarkers(); return; }
    this.lastSignature = signature;
    this.statistics.render(records);
    const legend = document.getElementById('categoryLegend'); legend.replaceChildren();
    const allCategories = records;
    for (const category of EXHIBIT_DESIGN.categories) {
      const button = document.createElement('button'); button.style.setProperty('--category', category.color);
      button.dataset.category = category.id; button.classList.toggle('active', this.store.filters.category === category.id);
      button.setAttribute('aria-pressed', this.store.filters.category === category.id);
      const icon = document.createElement('i'); icon.textContent = category.symbol;
      const title = document.createElement('span'); title.textContent = category.name;
      const count = document.createElement('b'); count.textContent = allCategories.filter(record => record.displayCategory === category.id).length;
      button.append(icon, title, count); button.addEventListener('click', () => this.actions.category(category.id)); legend.append(button);
    }
    const cities = document.getElementById('cityIndex'); cities.replaceChildren();
    const cityRows = records;
    document.getElementById('cityIndexCount').textContent = `${this.store.database.cities.features.length} 个地市`;
    for (const feature of this.store.database.cities.features) {
      const name = feature.properties.name;
      const button = document.createElement('button'); button.dataset.city = name;
      button.classList.toggle('active', this.store.filters.city === name);
      const label = document.createElement('span'); label.textContent = name.replace('朝鲜族自治州', '州').replace('大兴安岭地区', '大兴安岭');
      const count = document.createElement('small'); count.textContent = cityRows.filter(record => record.city === name).length;
      button.title = name; button.append(label, count); button.addEventListener('click', () => this.actions.city(name)); cities.append(button);
    }
    const metrics = [[records.length, '当前来源记录'], [records.filter(record => record.longitude !== null).length, '已关联公开坐标'], [records.filter(record => record.longitude === null).length, '精确坐标待核验'], [records.filter(record => record.dataConflicts?.length).length, '资料差异'], [new Set(records.filter(record=>record.vrUrl).map(record=>record.vrUrl)).size, '馆方VR入口'], [new Set(records.flatMap(record=>record.routeIds)).size, '关联研学路线']];
    document.getElementById('exStatistics').innerHTML = metrics.map(([value, label]) => `<div><span>${label}</span><strong data-final="${value}">${value}</strong></div>`).join('');
    this.renderFeatured();
    this.updatePhotoMarkers();
  }

  openDetail() {
    const dialog = document.getElementById('heritageDialog');
    if (document.fullscreenElement) document.exitFullscreen().then(() => { if (!dialog.open) dialog.show(); });
    else if (!dialog.open) dialog.show();
  }

  renderFeatured() {
    document.getElementById('featuredRegions').hidden = true;
  }

  drawConnections() {}

  updatePhotoMarkers() {
    if (!this.map.ready || !this.map.map?.project) return;
    const current = new Set();
    const occupied = [];
    const candidates = [...new Map(this.store.matching().filter(record => record.longitude !== null && HeritageImages.get(record)).map(record => [[record.longitude, record.latitude].join(','), record])).values()];
    if (this.photosVisible) for (const record of candidates) {
      const coordinates = [record.longitude, record.latitude];
      if (!this.map.map.getBounds().contains(coordinates)) continue;
      const point = this.map.map.project(coordinates);
      if (occupied.some(previous => Math.hypot(point.x - previous.x, point.y - previous.y) < 74)) continue;
      occupied.push(point); current.add(record.id);
      if (!this.photoMarkers.has(record.id)) {
        const button = document.createElement('button'); button.className = 'photo-marker'; button.title = record.name;
        button.setAttribute('aria-label', '查看' + record.name); button.style.setProperty('--category-color', EXHIBIT_DESIGN.category(record.kind).color);
        const photo = HeritageImages.get(record);
        const image = document.createElement('img'); image.dataset.imageAsset = photo.key; image.src = photo.src; image.alt = photo.caption; button.append(image);
        button.addEventListener('mouseenter', () => this.map.pointPopup(record, coordinates));
        button.addEventListener('mouseleave', () => { this.map.hoverTimer = setTimeout(() => this.map.popup?.remove(), 400); });
        button.addEventListener('click', event => { event.stopPropagation(); this.actions.select(record.id, true); });
        const marker = new maplibregl.Marker({element: button, anchor: 'bottom', offset: [0, -38]}).setLngLat(coordinates).addTo(this.map.map);
        this.photoMarkers.set(record.id, marker);
        image.addEventListener('error', () => { marker.remove(); this.photoMarkers.delete(record.id); }, {once: true});
      }
    }
    for (const [id, marker] of this.photoMarkers) if (!current.has(id)) { marker.remove(); this.photoMarkers.delete(id); }
  }

  bindMap(map) {
    this.map = map;
    if (map.map?.on) {
      map.map.on('moveend', this.onMapSettled);
      map.map.on('resize', this.onMapSettled);
      window.addEventListener('exhibit-map-ready', this.onMapSettled);
    }
  }

  unbindMap() {
    cancelAnimationFrame(this.connectionFrame);
    this.connectionFrame = null;
    this.photoMarkers.forEach(marker => marker.remove());
    this.photoMarkers.clear();
    window.removeEventListener('exhibit-map-ready', this.onMapSettled);
    if (this.map.map?.off) {
      this.map.map.off('moveend', this.onMapSettled);
      this.map.map.off('resize', this.onMapSettled);
    }
  }

  destroy() {
    this.unbindMap();
    cancelAnimationFrame(this.connectionFrame);
    this.photoMarkers.forEach(marker => marker.remove());
    if (this.map.map?.off) {
      this.map.map.off('move', this.onMapMove); this.map.map.off('moveend', this.onMapSettled); this.map.map.off('resize', this.onMapSettled);
    }
  }
}
window.ExhibitExperience = ExhibitExperience;
