/* Local GeoJSON fallback for devices without a usable WebGL context. */
class ExhibitFlatMap {
  constructor(store, onSelect, notify) {
    this.store = store;
    this.onSelect = onSelect;
    this.notify = notify;
    this.ready = true;
    this.baseMode = 'local';
    this.layers = new Map();
    this.map = {getLayoutProperty: id => this.layers.get(id) === false ? 'none' : 'visible'};
    const container = document.getElementById('exMap');
    container.replaceChildren();
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('aria-label', store.database.metadata.fullName + '本地二维行政区划地图');
    this.svg.style.cssText = 'width:100%;height:100%;background:#E4D8C5;touch-action:none';
    this.svg.innerHTML = '<g id="flatCities"></g><g id="flatCounties"></g><g id="flatNames"></g><g id="flatScope"></g><g id="flatPoints"></g><g id="flatRoute"></g>';
    container.append(this.svg);
    this.drawBoundaries();
    this.home();
    this.refresh();
    this.svg.addEventListener('wheel', event => { event.preventDefault(); this.zoom(event.deltaY < 0 ? 0.8 : 1.25); }, {passive: false});
    let drag;
    this.svg.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-flat-point]')) return;
      drag = {x: event.clientX, y: event.clientY, box: [...this.box]};
      this.svg.setPointerCapture(event.pointerId);
    });
    this.svg.addEventListener('pointermove', event => {
      if (!drag) return;
      const width = this.svg.clientWidth;
      const height = this.svg.clientHeight;
      const scale = Math.max(drag.box[2] / width, drag.box[3] / height);
      this.box = [drag.box[0] - (event.clientX - drag.x) * scale, drag.box[1] - (event.clientY - drag.y) * scale, drag.box[2], drag.box[3]];
      this.applyView();
    });
    this.svg.addEventListener('pointerup', () => { drag = null; });
    this.svg.addEventListener('pointercancel', () => { drag = null; });
    for (const action of ['terrain', 'buildings', 'northeast']) {
      const button = document.querySelector(`[data-map="${action}"]`);
      button.disabled = true; button.classList.remove('active'); button.title = '当前使用本地二维兼容模式';
    }
    document.querySelector('[data-map="two"]').classList.add('active');
    for (const action of ['three', 'satellite', 'road']) document.querySelector(`[data-map="${action}"]`).classList.remove('active');
    document.querySelector('[data-map="local"]').classList.add('active');
    document.getElementById('mapMessage').textContent = '二维兼容模式 · 本地真实边界可拖动缩放 · 道路与高程需 WebGL 底图';
  }

  project(coordinates) {
    return [coordinates[0] * 100, -Math.log(Math.tan(Math.PI / 4 + coordinates[1] * Math.PI / 360)) * 180 / Math.PI * 100];
  }

  path(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map((point, index) => (index ? 'L' : 'M') + this.project(point).join(',')).join(' ') + 'Z').join(' ')).join(' ');
  }

  drawBoundaries() {
    const add = (layer, features, fill, stroke, width) => {
      const target = this.svg.querySelector(layer);
      for (const feature of features) {
        const path = document.createElementNS(this.svg.namespaceURI, 'path');
        path.setAttribute('d', this.path(feature.geometry));
        path.setAttribute('fill', fill); path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', width); path.setAttribute('vector-effect', 'non-scaling-stroke');
        target.append(path);
      }
    };
    add('#flatCities', this.store.database.cities.features, '#D3D7C8', '#B99A65', 1.3);
    add('#flatCounties', this.store.database.counties.features, 'none', '#A69E90', 0.4);
    for (const feature of this.store.database.cities.features) {
      const point = this.project(feature.properties.centroid);
      const label = document.createElementNS(this.svg.namespaceURI, 'text');
      label.textContent = feature.properties.name;
      label.setAttribute('x', point[0]); label.setAttribute('y', point[1]);
      label.setAttribute('fill', '#39322F'); label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '17'); this.svg.querySelector('#flatNames').append(label);
    }
  }

  applyView() { this.svg.setAttribute('viewBox', this.box.join(' ')); }

  home() {
    document.getElementById('locationContext').hidden = true;
    this.svg.querySelector('#flatScope').replaceChildren();
    const geometry = this.store.database.province.features[0].geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const points = polygons.flat(2).map(point => this.project(point));
    const x = Math.min(...points.map(point => point[0]));
    const y = Math.min(...points.map(point => point[1]));
    const width = Math.max(...points.map(point => point[0])) - x;
    const height = Math.max(...points.map(point => point[1])) - y;
    this.box = [x - width * 0.12, y - height * 0.12, width * 1.24, height * 1.24]; this.applyView();
  }

  zoom(factor) {
    if (this.box[2] * factor < 4 || this.box[2] * factor > 10000) return;
    this.box = [this.box[0] + this.box[2] * (1 - factor) / 2, this.box[1] + this.box[3] * (1 - factor) / 2, this.box[2] * factor, this.box[3] * factor];
    this.applyView();
  }

  refresh() {
    this.clearRoute();
    const target = this.svg.querySelector('#flatPoints'); target.replaceChildren();
    const groups = new Map();
    for (const record of this.store.matching().filter(record => record.longitude !== null)) {
      const key = [record.longitude, record.latitude].join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    for (const records of groups.values()) {
      const record = records[0]; const point = this.project([record.longitude, record.latitude]);
      const group = document.createElementNS(this.svg.namespaceURI, 'g');
      group.dataset.flatPoint = record.id; group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', record.name); group.style.cursor = 'pointer';
      const circle = document.createElementNS(this.svg.namespaceURI, 'circle');
      circle.setAttribute('cx', point[0]); circle.setAttribute('cy', point[1]); circle.setAttribute('r', '14'); circle.setAttribute('fill', '#f1ce8f');
      const title = document.createElementNS(this.svg.namespaceURI, 'title'); title.textContent = records.map(item => item.name).join('\n');
      group.append(circle, title);
      if (records.length > 1) {
        const count = document.createElementNS(this.svg.namespaceURI, 'text');
        count.textContent = records.length;
        count.setAttribute('x', point[0]); count.setAttribute('y', point[1] + 4);
        count.setAttribute('text-anchor', 'middle'); count.setAttribute('font-size', '10'); count.setAttribute('fill', '#532b1c');
        group.append(count);
      }
      target.append(group);
      const select = () => {
        this.onSelect(record.id, true);
        document.querySelector('.flat-choice-panel')?.remove();
        if (records.length < 2) return;
        const panel = document.createElement('div'); panel.className = 'flat-choice-panel';
        panel.style.cssText = 'position:absolute;right:12px;top:60px;z-index:5;background:#5c2028;border:1px solid #c99b65;border-radius:5px;padding:12px;max-width:220px';
        const close = document.createElement('button'); close.textContent = '同址来源记录 ×'; close.addEventListener('click', () => panel.remove()); panel.append(close);
        for (const item of records) {
          const button = document.createElement('button'); button.className = 'cluster-item'; button.textContent = `${item.name} · ${item.sheet}`;
          button.addEventListener('click', () => { this.onSelect(item.id, false); panel.remove(); }); panel.append(button);
        }
        document.querySelector('.ex-map').append(panel);
      };
      group.addEventListener('click', select); group.addEventListener('keydown', event => { if (event.key === 'Enter') select(); });
    }
  }

  highlight() {
    const selected = this.store.byId.get(this.store.selected);
    const groups = this.svg.querySelectorAll('#flatPoints [data-flat-point]');
    groups.forEach(group => {
      const record = this.store.byId.get(group.dataset.flatPoint);
      const active = !!selected && record.longitude === selected.longitude && record.latitude === selected.latitude;
      group.classList.toggle('selected', active);
      group.setAttribute('aria-pressed', active);
      group.querySelector('circle').setAttribute('stroke', active ? '#fff2bf' : '#a67936');
      group.querySelector('circle').setAttribute('stroke-width', active ? '4' : '1');
      group.querySelector('circle').setAttribute('vector-effect', 'non-scaling-stroke');
    });
  }

  clearRoute() {
    this.svg.querySelector('#flatRoute').replaceChildren();
    this.svg.querySelector('#flatScope').replaceChildren();
    document.querySelector('.flat-choice-panel')?.remove();
  }

  focus(record) {
    const context = document.getElementById('locationContext');
    context.hidden = false;
    this.svg.querySelector('#flatScope').replaceChildren();
    if (record.longitude === null) {
      const scope = this.store.locationScope(record);
      const path = document.createElementNS(this.svg.namespaceURI, 'path');
      path.setAttribute('d', this.path(scope.geometry));
      path.setAttribute('fill', '#d2a66444'); path.setAttribute('stroke', '#f2ca8c');
      path.setAttribute('stroke-width', '2'); path.setAttribute('vector-effect', 'non-scaling-stroke');
      this.svg.querySelector('#flatScope').append(path);
      const polygons = scope.geometry.type === 'Polygon' ? [scope.geometry.coordinates] : scope.geometry.coordinates;
      const points = polygons.flat(2).map(point => this.project(point));
      const x = Math.min(...points.map(point => point[0]));
      const y = Math.min(...points.map(point => point[1]));
      const width = Math.max(...points.map(point => point[0])) - x;
      const height = Math.max(...points.map(point => point[1])) - y;
      this.box = [x - width * .2, y - height * .2, width * 1.4, height * 1.4];
      this.applyView();
      context.textContent = `当前展示${record.scopeBasis ? '公开资料核对后的' : '台账所列'} ${scope.properties.name} 行政范围，遗址级坐标待确认。`;
      return;
    }
    context.textContent = `${record.name} · ${record.coordinateStatus}`;
    const point = this.project([record.longitude, record.latitude]);
    this.box = [point[0] - 35, point[1] - 35, 70, 70]; this.applyView();
  }

  control(action) {
    if (action === 'home') this.home();
    if (action === 'zoomIn') this.zoom(0.7);
    if (action === 'zoomOut') this.zoom(1.4);
    if (action === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.querySelector('.ex-map').requestFullscreen().catch(() => this.notify('当前浏览器无法进入全屏。'));
    }
  }

  animateRoute(points) {
    if (points.length < 2) return;
    const line = document.createElementNS(this.svg.namespaceURI, 'polyline');
    line.setAttribute('points', points.map(point => this.project(point).join(',')).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#f4d396'); line.setAttribute('stroke-width', '2');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    this.svg.querySelector('#flatRoute').replaceChildren(line);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const length = line.getTotalLength(); line.style.strokeDasharray = length;
      line.animate([{strokeDashoffset: length}, {strokeDashoffset: 0}], {duration: 2400, fill: 'forwards'});
    }
  }

  toggleLayer(id, visible) {
    this.layers.set(id, visible);
    const names = {'city-boundary': '#flatCities', 'county-boundary': '#flatCounties', 'exhibit-city-names': '#flatNames'};
    if (names[id]) this.svg.querySelector(names[id]).style.display = visible ? '' : 'none';
  }

  focusCity(name) {
    const feature = this.store.database.cities.features.find(feature => feature.properties.name === name);
    if (!feature) return;
    this.focus({longitude: null, scopeAdcode: feature.properties.adcode, name});
    document.getElementById('locationContext').textContent = `当前显示${name}行政范围与匹配档案。`;
  }

  fitRecords(records) {
    const located = records.filter(record => record.longitude !== null);
    if (located.length === 1) { this.focus(located[0]); return; }
    if (!located.length) { if (records[0]) this.focus(records[0]); return; }
    const points = located.map(record => this.project([record.longitude, record.latitude]));
    const x = Math.min(...points.map(point => point[0]));
    const y = Math.min(...points.map(point => point[1]));
    const width = Math.max(10, Math.max(...points.map(point => point[0])) - x);
    const height = Math.max(10, Math.max(...points.map(point => point[1])) - y);
    this.box = [x - width * .15, y - height * .15, width * 1.3, height * 1.3];
    this.applyView();
    this.highlight();
  }

  destroy() { this.destroyed = true; document.querySelector('.flat-choice-panel')?.remove(); this.svg.remove(); }
}

window.ExhibitFlatMap = ExhibitFlatMap;
