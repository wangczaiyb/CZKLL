/* Real administrative geometry remains interactive when WebGL is unavailable. */
window.MuseumFlatMap = class MuseumFlatMap {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.namespace = 'http://www.w3.org/2000/svg';
    this.width = 1000;
    this.height = 660;
    this.view = {x: 0, y: 0, scale: 1};
    this.svg = document.createElementNS(this.namespace, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('class', 'china-vector-fallback');
    this.svg.setAttribute('aria-label', '中国行政区划交互地图，可拖动缩放，点击重点省区进入详细地图');
    this.group = document.createElementNS(this.namespace, 'g');
    this.svg.append(this.group);
    container.replaceChildren(this.svg);
    const provinces = MUSEUM_GEOMETRY.china.features;
    this.projection = d3.geoMercator().fitExtent([[35, 20], [965, 635]], MUSEUM_GEOMETRY.china);
    const path = d3.geoPath(this.projection);
    const keys = {'黑龙江省': '黑龙江', '吉林省': '吉林', '辽宁省': '辽宁'};
    for (const feature of [...provinces, ...MUSEUM_GEOMETRY.east.features]) {
      const region = feature.properties.level === 'province' ? keys[feature.properties.name] : '内蒙古';
      const shape = document.createElementNS(this.namespace, 'path');
      shape.setAttribute('d', path(feature));
      shape.setAttribute('fill', region ? '#9b4f3b' : '#60393d');
      shape.setAttribute('stroke', region ? '#f6ce8b' : '#b38a68');
      shape.setAttribute('stroke-width', region ? '1.5' : '.6');
      shape.setAttribute('vector-effect', 'non-scaling-stroke');
      const title = document.createElementNS(this.namespace, 'title');
      title.textContent = feature.properties.name;
      shape.append(title);
      if (region) {
        shape.dataset.region = region;
        shape.setAttribute('tabindex', '0');
        shape.setAttribute('role', 'link');
        shape.setAttribute('aria-label', `进入${region}遗址地图`);
        shape.addEventListener('click', () => { if (!this.dragged) callbacks.openRegion(region); });
        shape.addEventListener('keydown', event => { if (event.key === 'Enter') callbacks.openRegion(region); });
      }
      this.group.append(shape);
    }
    for (const place of MUSEUM.featured.filter(place => place.primary)) {
      const coordinates = MuseumMap.prototype.coordinate.call({}, place);
      const [x, y] = this.projection(coordinates);
      const marker = document.createElementNS(this.namespace, 'circle');
      marker.setAttribute('cx', x); marker.setAttribute('cy', y); marker.setAttribute('r', '5');
      marker.setAttribute('fill', '#f6ce8b'); marker.setAttribute('stroke', '#602426');
      marker.setAttribute('tabindex', '0'); marker.setAttribute('role', 'link');
      marker.setAttribute('aria-label', place.name);
      marker.addEventListener('click', event => { event.stopPropagation(); if (!this.dragged) callbacks.select(place); });
      marker.addEventListener('keydown', event => { if (event.key === 'Enter') callbacks.select(place); });
      this.group.append(marker);
    }
    this.bindControls();
    document.getElementById('mapLabels').replaceChildren();
    document.getElementById('mapLoading').hidden = true;
    const note = document.getElementById('focusCaption');
    note.textContent = '二维交互地图 · 拖动、缩放或进入省区';
    callbacks.ready();
  }

  bindControls() {
    this.svg.addEventListener('wheel', event => {
      event.preventDefault();
      this.zoom(Math.exp(event.deltaY * .001));
    }, {passive: false});
    this.svg.addEventListener('pointerdown', event => {
      this.dragged = false;
      this.drag = {x: event.clientX, y: event.clientY, viewX: this.view.x, viewY: this.view.y};
    });
    this.svg.addEventListener('pointermove', event => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      if (Math.hypot(dx, dy) < 5) return;
      this.dragged = true;
      const ratio = this.width / this.svg.getBoundingClientRect().width;
      this.view.x = this.drag.viewX + dx * ratio;
      this.view.y = this.drag.viewY + dy * ratio;
      this.draw();
    });
    this.svg.addEventListener('pointerup', () => { this.drag = null; });
    this.svg.addEventListener('pointercancel', () => { this.drag = null; });
    this.svg.addEventListener('pointerleave', () => { this.drag = null; });
  }

  draw() { this.group.setAttribute('transform', `translate(${this.view.x} ${this.view.y}) scale(${this.view.scale})`); }
  zoom(factor) {
    const previous = this.view.scale;
    this.view.scale = Math.min(5, Math.max(.7, previous / factor));
    const ratio = this.view.scale / previous;
    this.view.x = this.width / 2 - (this.width / 2 - this.view.x) * ratio;
    this.view.y = this.height / 2 - (this.height / 2 - this.view.y) * ratio;
    this.draw();
  }
  focusNortheast() {
    const [x, y] = this.projection([125, 46]);
    this.view = {x: this.width / 2 - x * 2.5, y: this.height / 2 - y * 2.5, scale: 2.5};
    this.draw();
  }
  focusRegion(region) { this.callbacks.openRegion(region); }
  reset() { this.view = {x: 0, y: 0, scale: 1}; this.draw(); }
  intro() { this.reset(); this.callbacks.ready(); }
  render() {}
  destroy() { this.svg.remove(); }
};
