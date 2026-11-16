class ExhibitMap {
  constructor(store, onSelect, notify, onCity = null) {
    this.store = store;
    this.onSelect = onSelect;
    this.notify = notify;
    this.onCity = onCity;
    this.baseMode = 'satellite';
    this.dataVersion = 0;
    this.clusterRequest = 0;
    this.health = {satellite: false, terrain: false, vector: false};
    this.cityMarkers = [];
    this.pendingIntent = null;
    this.markers = new Map();
    this.clusterMarkers = new Map();
    this.terrain = false;
    this.buildings = false;
    this.ready = false;
    this.routeFrame = null;
    this.routePoints = [];
    this.pendingRecord = null;
    this.overview = true;
    const style = structuredClone(window.ZH_STYLE);
    this.prepareStyle(style);
    this.map = new maplibregl.Map({
      container: 'exMap', style, center: store.database.metadata.center, zoom: 4.5,
      pitch: 42, bearing: -8, maxPitch: 75, maxZoom: 19,
      attributionControl: {compact: true}, renderWorldCopies: false
    });
    this.map.addControl(new maplibregl.NavigationControl({showZoom: false}), 'top-right');
    this.map.addControl(new maplibregl.ScaleControl({maxWidth: 120, unit: 'metric'}), 'bottom-left');
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed) return;
      this.map.resize();
      this.map.triggerRepaint();
    });
    this.resizeObserver.observe(document.getElementById('exMap'));
    this.map.once('style.load', () => this.setup());
    this.map.on('sourcedata', event => {
      if (this.destroyed) return;
      const mode = {'nasa-imagery':'satellite', 'terrain-dem':'terrain', 'openmaptiles':'vector'}[event.sourceId];
      if (!mode || event.tile?.state !== 'loaded') return;
      this.health[mode] = true;
      if (mode === this.baseMode || (mode === 'vector' && this.baseMode === 'road')) clearTimeout(this.serviceTimer);
      this.updateMessage();
    });
    this.watchService();
    this.map.on('error', event => {
      if (this.destroyed) return;
      const message = event.error?.message || '';
      if (event.sourceId === 'terrain-dem' || /terrain-dem|terrarium/.test(message)) {
        this.health.terrain = false;
        if (this.ready) this.setTerrain(false);
      }
    });
  }

  watchService() {
    clearTimeout(this.serviceTimer);
    this.serviceTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (this.health[this.baseMode] || (this.baseMode === 'road' && this.health.vector)) return;
      if (this.baseMode === 'satellite') {
        this.notify('卫星影像响应超时，正在切换道路底图。');
        this.setBaseMode('road');
      } else window.dispatchEvent(new CustomEvent('exhibit-map-unavailable', {detail:this}));
    }, MAP_SERVICES.timeout);
  }

  applyBaseVisibility() {
    if (!this.ready) return;
    const satellite = this.baseMode === 'satellite';
    this.map.setLayoutProperty('satellite-imagery', 'visibility', satellite ? 'visible' : 'none');
    this.map.setPaintProperty('province-tint', 'fill-opacity', 0);
  }

  prepareStyle(style) {
    for (const layer of style.layers) {
      const paint = layer.paint || {};
      if (layer.id === 'natural_earth') paint['raster-opacity'] = .2;
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        paint['text-color'] = '#39322F';
        paint['text-halo-color'] = '#F2EDE3';
        paint['text-halo-width'] = 1.3;
        if (/^label_(city|town|village|other)/.test(layer.id)) layer.minzoom = Math.max(layer.minzoom || 0, 9);
        // Country labels outside the exhibit are omitted at the regional view.
        if (/country/.test(layer.id)) layer.layout.visibility = 'none';
      }
      if (layer.type === 'fill-extrusion') layer.layout = {...layer.layout, visibility: 'none'};
      layer.paint = paint;
    }
  }

  setup() {
    if (this.ready || this.destroyed) return;
    const map = this.map;
    const database = this.store.database;
    map.addSource('exhibit-province', {type: 'geojson', data: database.province});
    map.addSource('exhibit-cities', {type: 'geojson', data: database.cities, generateId: true});
    map.addSource('exhibit-counties', {type: 'geojson', data: database.counties});
    const firstLabel = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    map.addLayer({id: 'province-tint', type: 'fill', source: 'exhibit-province', paint: {'fill-color': '#24633A', 'fill-opacity': .42}}, firstLabel);
    map.addLayer({id: 'county-boundary', type: 'line', source: 'exhibit-counties', minzoom: 7, paint: {'line-color': '#c4ae7c', 'line-width': 0.65, 'line-opacity': 0.6}});
    map.addLayer({id: 'city-boundary', type: 'line', source: 'exhibit-cities', paint: {'line-color': '#E4D8C5', 'line-width': .8, 'line-opacity': .55, 'line-dasharray': [3, 2]}});
    map.addLayer({id: 'province-glow', type: 'line', source: 'exhibit-province', paint: {'line-color': '#B99A65', 'line-width': 4, 'line-blur': 2, 'line-opacity': .14}});
    map.addLayer({id: 'province-boundary', type: 'line', source: 'exhibit-province', paint: {'line-color': '#D4B16F', 'line-width': 1.6}});
    map.addLayer({id: 'city-hover', type: 'fill', source: 'exhibit-cities', paint: {'fill-color': '#f0c478', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.18, 0]}});
    map.addSource('exhibit-city-labels', {type: 'geojson', data: {
      type: 'FeatureCollection', features: database.cities.features.filter(feature => feature.properties.centroid).map(feature => ({
        type: 'Feature', properties: {name: feature.properties.name}, geometry: {type: 'Point', coordinates: feature.properties.centroid}
      }))
    }});
    map.addLayer({id: 'exhibit-city-names', type: 'symbol', source: 'exhibit-city-labels', maxzoom: 9, layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': false
    }, paint: {'text-color': '#FFFFFF', 'text-halo-color': '#0F1A30', 'text-halo-width': 1.5}});
    const service = MAP_SERVICES;
    map.addSource('terrain-dem', {type:'raster-dem', ...service.terrain, tileSize:256});
    map.addLayer({id:'terrain-shade', type:'hillshade', source:'terrain-dem', paint:{'hillshade-exaggeration':.35,'hillshade-shadow-color':'#10263b','hillshade-highlight-color':'#b7cce0'}}, firstLabel);
    map.addSource('nasa-imagery', {type:'raster', ...service.satellite, tileSize:256});
    map.addLayer({id:'satellite-imagery', type:'raster', source:'nasa-imagery', layout:{visibility:'none'}, paint:{'raster-fade-duration':500}}, firstLabel);
    map.addLayer({id: 'real-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      filter: ['has', 'render_height'], layout: {visibility: 'none'}, paint: {
        'fill-extrusion-color': '#c6ad7d', 'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.8
      }
    });
    if (window.HERITAGE_PILOT) {
      map.addSource('pilot-buildings', {type:'geojson',data:HERITAGE_PILOT.buildings,attribution:'建筑轮廓 © OpenStreetMap contributors · ODbL'});
      map.addSource('pilot-site', {type:'geojson',data:HERITAGE_PILOT.site});
      map.addLayer({id:'pilot-site-boundary',type:'line',source:'pilot-site',minzoom:12,paint:{'line-color':'#edd092','line-width':2,'line-opacity':.8}});
      map.addLayer({id:'pilot-buildings-fill',type:'fill',source:'pilot-buildings',minzoom:13,layout:{visibility:'none'},paint:{'fill-color':'#c7b17a','fill-opacity':.18}});
      map.addLayer({id:'pilot-buildings-line',type:'line',source:'pilot-buildings',minzoom:13,layout:{visibility:'none'},paint:{'line-color':'#e7ca8b','line-width':1,'line-opacity':.75}});
      map.addLayer({id:'pilot-measured-buildings',type:'fill-extrusion',source:'pilot-buildings',minzoom:14,filter:['has','height_m'],layout:{visibility:'none'},paint:{'fill-extrusion-color':'#c8af7c','fill-extrusion-height':['get','height_m'],'fill-extrusion-opacity':.8}});
    }
    map.addSource('heritage-points', {type: 'geojson', data: this.store.pointCollection(), cluster: true, clusterMaxZoom: 14, clusterRadius: 38});
    map.addSource('context-points', {type: 'geojson', data: this.emptyCollection()});
    map.addLayer({id: 'context-points', type: 'circle', source: 'context-points', paint: {'circle-color': ['get', 'color'], 'circle-radius': 3, 'circle-opacity': .2}});
    map.on('click', 'context-points', event => this.onSelect(event.features[0].properties.id, true));
    map.addLayer({id: 'heritage-clusters', type: 'circle', source: 'heritage-points', filter: ['has', 'point_count'], paint: {
      'circle-color': '#39322F', 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 23], 'circle-stroke-color': '#D4B16F', 'circle-stroke-width': 2
    }});
    map.addLayer({id: 'heritage-counts', type: 'symbol', source: 'heritage-points', filter: ['has', 'point_count'], layout: {
      'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12
    }, paint: {'text-color': '#E4D8C5'}});
    map.addSource('study-route', {type: 'geojson', data: this.emptyCollection()});
    map.addSource('selected-scope', {type: 'geojson', data: this.emptyCollection()});
    map.addLayer({id: 'selected-scope-fill', type: 'fill', source: 'selected-scope', paint: {'fill-color': '#d3a562', 'fill-opacity': 0.14}});
    map.addLayer({id: 'selected-scope-line', type: 'line', source: 'selected-scope', paint: {'line-color': '#f4d59c', 'line-width': 2, 'line-dasharray': [3, 2]}});
    map.addLayer({id: 'study-route-shadow', type: 'line', source: 'study-route', paint: {'line-color': '#463521', 'line-width': 7, 'line-opacity': 0.7}});
    map.addLayer({id: 'study-route-line', type: 'line', source: 'study-route', paint: {'line-color': '#D4B16F', 'line-width': 3}});
    map.on('click', 'study-route-line', () => this.animateRoute(this.routePoints));
    map.on('click', 'heritage-clusters', event => this.openCluster(event));
    map.on('mouseenter', 'heritage-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'heritage-clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mousemove', 'city-hover', event => {
      if (this.hoverId !== undefined) map.setFeatureState({source: 'exhibit-cities', id: this.hoverId}, {hover: false});
      this.hoverId = event.features[0]?.id;
      if (this.hoverId !== undefined) map.setFeatureState({source: 'exhibit-cities', id: this.hoverId}, {hover: true});
    });
    map.on('mouseleave', 'city-hover', () => {
      if (this.hoverId !== undefined) map.setFeatureState({source: 'exhibit-cities', id: this.hoverId}, {hover: false});
    });
    map.on('click', 'city-hover', event => {
      if (this.studyMode) return;
      if (map.queryRenderedFeatures(event.point, {layers: ['heritage-clusters', 'context-points']}).length) return;
      const feature = event.features[0];
      const original = database.cities.features.find(item => item.properties.adcode === feature.properties.adcode);
      if (this.onCity) this.onCity((original || feature).properties.name);
      else this.fitGeometry((original || feature).geometry, 1000);
    });
    map.on('moveend', () => { this.updateMarkers(); this.updateMessage(); });
    map.on('dragstart', () => { this.overview = false; });
    map.on('zoomstart', event => { if (event.originalEvent) this.overview = false; });
    map.on('resize', () => { if (this.overview && !this.studyMode) this.home(0); });
    map.on('sourcedata', event => { if (event.sourceId === 'heritage-points' && map.isSourceLoaded('heritage-points')) this.updateMarkers(); });
    this.ready = true;
    document.querySelector('[data-map="local"]').classList.remove('active');
    this.applyBaseVisibility();
    for (const feature of database.cities.features) {
      const label = document.createElement('button');
      label.className = 'gis-city-name';
      label.textContent = feature.properties.name;
      label.addEventListener('click', () => this.onCity?.(feature.properties.name));
      this.cityMarkers.push(new maplibregl.Marker({element:label}).setLngLat(feature.properties.centroid).addTo(map));
    }
    this.home(0);
    this.setTerrain(true);
    this.refresh();
    this.updateMessage();
    window.dispatchEvent(new Event('exhibit-map-ready'));
    this.setBaseMode(this.pendingMode || this.baseMode);
    const intent = this.pendingIntent;
    this.pendingIntent = null;
    if (intent) this[intent.action](intent.value);
  }

  emptyCollection() { return {type: 'FeatureCollection', features: []}; }

  fitGeometry(geometry, duration = 1000) {
    this.overview = false;
    const bounds = new maplibregl.LngLatBounds();
    const visit = coordinates => {
      if (typeof coordinates[0] === 'number') bounds.extend(coordinates);
      else coordinates.forEach(visit);
    };
    visit(geometry.coordinates);
    this.map.fitBounds(bounds, {padding: {top: 70, bottom: 70, left: 72, right: 55}, duration: this.reducedMotion() ? 0 : duration, pitch: this.map.getPitch()});
  }

  reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  home(duration = 1200) {
    document.getElementById('locationContext').hidden = true;
    if (this.ready) this.map.getSource('selected-scope')?.setData(this.emptyCollection());
    this.fitGeometry(this.store.database.province.features[0].geometry, 0);
    const zoom = this.map.getZoom() + (this.map.getContainer().clientWidth > 600 ? .1 : 0);
    this.map.easeTo({zoom, duration: this.reducedMotion() ? 0 : duration});
    this.overview = true;
  }

  updateMessage() {
    if (this.studyMode) return;
    const records = this.store.matching();
    const located = records.filter(record => record.longitude !== null).length;
    const service = this.baseMode === 'satellite' ? (this.health.satellite ? '卫星影像' : '卫星连接中') : (this.health.vector ? '中文矢量' : '中文底图连接中');
    document.getElementById('mapMessage').textContent = `${service} · ${this.terrain && this.health.terrain ? '真实DEM地形' : '地形待连接或已关闭'} · ${records.length} 条档案 / ${located} 条公开位置`;
    document.querySelectorAll('.gis-city-name').forEach(label => { label.hidden = this.map.getZoom() >= 10; });
  }

  clearRoute() {
    cancelAnimationFrame(this.routeFrame);
    this.routePoints = [];
    this.clusterRequest++;
    this.popup?.remove();
    if (!this.ready || this.destroyed) return;
    this.map.getSource('study-route')?.setData(this.emptyCollection());
    this.map.getSource('selected-scope')?.setData(this.emptyCollection());
  }

  refresh() {
    const records = this.store.matching();
    const signature = records.map(record => record.id).join('|');
    if (!this.ready || signature === this.pointSignature) return;
    this.pointSignature = signature;
    this.clearRoute();
    this.dataVersion++;
    this.clusterMarkers.forEach(marker => marker.remove());
    this.clusterMarkers.clear();
    this.coordinateGroups = new Map();
    records.filter(record => record.longitude !== null).forEach(record => {
      const key = [record.longitude, record.latitude].join(',');
      if (!this.coordinateGroups.has(key)) this.coordinateGroups.set(key, []);
      this.coordinateGroups.get(key).push(record);
    });
    for (const [key, marker] of this.markers) {
      if (!this.coordinateGroups.has(key)) { marker.remove(); this.markers.delete(key); }
    }
    this.map.getSource('heritage-points').setData(this.store.pointCollection(records));
    const dimmed = this.store.filters.category ? this.store.matching({ignoreCategory:true}).filter(record => record.displayCategory !== this.store.filters.category) : [];
    this.map.getSource('context-points').setData(this.store.pointCollection(dimmed));
    this.updateMessage();
  }

  updateMarkers() {
    if (!this.ready) return;
    if (this.studyMode) { for (const marker of [...this.markers.values(), ...this.clusterMarkers.values()]) marker.getElement().hidden = true; return; }
    const visible = new Set();
    const visibleClusters = new Set();
    const features = this.map.querySourceFeatures('heritage-points');
    for (const feature of features) {
      if (feature.properties.cluster) {
        const clusterId = feature.properties.cluster_id;
        visibleClusters.add(clusterId);
        if (!this.clusterMarkers.has(clusterId)) {
          const label = document.createElement('button');
          label.className = 'ex-cluster-label';
          label.textContent = feature.properties.point_count;
          label.setAttribute('aria-label', `查看聚合中的${feature.properties.point_count}条来源记录`);
          label.addEventListener('click', event => {
            event.stopPropagation();
            this.openCluster({features: [feature]});
          });
          const marker = new maplibregl.Marker({element: label}).setLngLat(feature.geometry.coordinates).addTo(this.map);
          this.clusterMarkers.set(clusterId, marker);
        }
        continue;
      }
      const record = this.store.byId.get(feature.properties.id);
      if (!record) continue;
      // Tile query coordinates can be quantized. Place models using the original POI coordinates.
      const coordinates = [record.longitude, record.latitude];
      const key = coordinates.join(',');
      visible.add(key);
      if (this.markers.has(key)) continue;
      const colocated = this.coordinateGroups?.get(key) || [record];
      const button = document.createElement('button');
      button.className = 'ex-pin';
      button.style.setProperty('--category-color', EXHIBIT_DESIGN.category(record.kind).color);
      button.title = record.name + (colocated.length > 1 ? ` · 同址 ${colocated.length} 条来源记录` : '');
      button.setAttribute('aria-label', record.name);
      button.addEventListener('mouseenter', () => { const current = this.coordinateGroups?.get(key)?.[0]; if (current) this.pointPopup(current, coordinates); });
      button.addEventListener('mouseleave', () => { this.hoverTimer = setTimeout(() => this.popup?.remove(), 350); });
      button.addEventListener('click', event => {
        event.stopPropagation();
        const current = this.coordinateGroups?.get(key);
        if (!current?.length) return;
        this.onSelect(current[0].id, true);
        if (current.length > 1) this.pointPopup(current[0], coordinates);
      });
      const marker = new maplibregl.Marker({element: button, anchor: 'center'}).setLngLat(coordinates).addTo(this.map);
      this.markers.set(key, marker);
    }
    for (const [key, marker] of this.markers) {
      if (!visible.has(key)) { marker.remove(); this.markers.delete(key); }
    }
    for (const [key, marker] of this.clusterMarkers) {
      if (!visibleClusters.has(key)) { marker.remove(); this.clusterMarkers.delete(key); }
    }
    this.highlight();
    this.map.triggerRepaint();
  }

  highlight() {
    const selected = this.store.byId.get(this.store.selected);
    const key = selected && selected.longitude !== null ? [selected.longitude, selected.latitude].join(',') : '';
    this.markers.forEach((marker, markerKey) => marker.getElement().classList.toggle('selected', markerKey === key));
  }

  pointPopup(record, coordinates) {
    clearTimeout(this.hoverTimer);
    this.popup?.remove();
    const content = document.createElement('div');
    content.className = 'ex-popover';
    const photo = HeritageImages.get(record);
    if (photo) {
      const image = document.createElement('img');
      image.dataset.imageAsset = photo.key;
      image.src = photo.src; image.alt = photo.caption; content.append(image);
      if (record.imageCaption) { const caption = document.createElement('p'); caption.textContent = record.imageCaption; content.append(caption); }
    }
    const title = document.createElement('h3'); title.textContent = record.name; content.append(title);
    const text = document.createElement('p'); text.textContent = `${record.city} · ${record.kind}\n${(record.searchBackground ?? record.background).slice(0, 100)}\nVR ${record.vrUrl ? '已关联' : '待收录'} · 研学路线 ${record.routeIds.length} 条`; content.append(text);
    const link = document.createElement('a'); link.href = 'heritage.html?id=' + encodeURIComponent(record.id); link.textContent = '进入遗址详情 →'; content.append(link);
    const colocated = this.store.matching().filter(item => item.longitude === coordinates[0] && item.latitude === coordinates[1]);
    if (colocated.length > 1) {
      const note = document.createElement('p'); note.textContent = `同址 ${colocated.length} 条来源记录`; content.append(note);
      for (const item of colocated) {
        const choice = document.createElement('button'); choice.className = 'cluster-item';
        choice.textContent = `${item.name} · ${item.sheet}`;
        choice.addEventListener('click', () => { this.onSelect(item.id, false); this.popup?.remove(); });
        content.append(choice);
      }
    }
    content.addEventListener('mouseenter', () => clearTimeout(this.hoverTimer));
    content.addEventListener('mouseleave', () => this.popup?.remove());
    this.popup = new maplibregl.Popup({offset: 32, closeButton: false, maxWidth: '320px'}).setLngLat(coordinates).setDOMContent(content).addTo(this.map);
  }

  async openCluster(event) {
    const cluster = event.features[0];
    const source = this.map.getSource('heritage-points');
    const request = ++this.clusterRequest;
    const version = this.dataVersion;
    let leaves;
    try { leaves = await source.getClusterLeaves(cluster.properties.cluster_id, cluster.properties.point_count, 0); }
    catch { return; }
    if (this.destroyed || request !== this.clusterRequest || version !== this.dataVersion) return;
    const container = document.createElement('div');
    container.style.maxHeight = '260px'; container.style.overflow = 'auto';
    const title = document.createElement('strong'); title.textContent = `${leaves.length} 条台账记录`; container.append(title);
    for (const feature of leaves) {
      const button = document.createElement('button'); button.className = 'cluster-item';
      button.textContent = this.store.byId.get(feature.properties.id)?.name || '来源记录';
      button.addEventListener('click', () => { this.onSelect(feature.properties.id, true); this.popup?.remove(); });
      container.append(button);
    }
    const expand = document.createElement('button'); expand.className = 'cluster-item'; expand.textContent = '放大此区域 →';
    expand.addEventListener('click', async () => {
      let zoom;
      try { zoom = await source.getClusterExpansionZoom(cluster.properties.cluster_id); } catch { return; }
      if (this.destroyed || request !== this.clusterRequest || version !== this.dataVersion) return;
      this.map.stop();
      this.map.easeTo({center: cluster.geometry.coordinates, zoom, duration: 900}); this.popup?.remove();
    });
    container.append(expand);
    this.popup?.remove();
    this.popup = new maplibregl.Popup({offset: 20, maxWidth: '320px'}).setLngLat(cluster.geometry.coordinates).setDOMContent(container).addTo(this.map);
  }

  focus(record) {
    this.highlight();
    if (!this.ready) {
      this.pendingIntent = {action:'focus', value:record};
      this.notify('地图连接中，加载完成后将自动显示所选记录。');
      return;
    }
    this.map.stop();
    if (record.longitude === null) {
      const scope = this.store.locationScope(record);
      this.map.getSource('selected-scope').setData({type: 'FeatureCollection', features: [scope]});
      this.fitGeometry(scope.geometry, 1100);
      const context = document.getElementById('locationContext');
      context.hidden = false;
      context.textContent = `当前展示${record.scopeBasis ? '公开资料核对后的' : '台账所列'} ${scope.properties.name} 行政范围。${record.name}的遗址级坐标仍需资料确认。`;
      this.notify('已在地图展示关联行政范围，遗址精确坐标待确认。');
      return;
    }
    this.map.getSource('selected-scope').setData(this.emptyCollection());
    const context = document.getElementById('locationContext');
    context.hidden = false;
    context.textContent = `${record.name} · ${record.coordinateStatus} · ${record.coordinatePrecision || '公开设施参考点'}`;
    this.overview = false;
    this.map.flyTo({center: [record.longitude, record.latitude], zoom: 14.8, pitch: 55, bearing: -15, duration: this.reducedMotion() ? 0 : 1600});
  }

  setTerrain(enabled) {
    this.terrain = enabled;
    this.map.setTerrain(enabled ? {source: 'terrain-dem', exaggeration: 1} : null);
    document.querySelector('[data-map="terrain"]').classList.toggle('active', enabled);
  }

  control(action) {
    if (action === 'fullscreen') {
      const surface = document.querySelector('.ex-map');
      if (document.fullscreenElement) document.exitFullscreen();
      else surface.requestFullscreen().catch(() => this.notify('当前浏览器未开启全屏，可使用浏览器全屏快捷键。'));
      return;
    }
    if (!this.ready) { this.notify('地图服务仍在连接，请稍后操作。'); return; }
    const map = this.map;
    if (action === 'satellite' || action === 'road') this.setBaseMode(action);
    if (action === 'northeast') map.fitBounds([[116, 38.5], [135.5, 54]], {padding: 45, duration: this.reducedMotion() ? 0 : 1100});
    if (action === 'three' || action === 'two') {
      this.setTerrain(action === 'three');
      map.easeTo({pitch: action === 'three' ? 55 : 0, bearing: action === 'three' ? -12 : 0, duration: 900});
      document.querySelector('[data-map="three"]').classList.toggle('active', action === 'three');
      document.querySelector('[data-map="two"]').classList.toggle('active', action === 'two');
    }
    if (action === 'terrain') this.setTerrain(!this.terrain);
    if (action === 'home') this.home();
    if (action === 'zoomIn') { this.overview = false; map.zoomIn(); }
    if (action === 'zoomOut') { this.overview = false; map.zoomOut(); }
    if (action === 'buildings') {
      this.buildings = !this.buildings;
      map.setLayoutProperty('real-buildings', 'visibility', this.buildings ? 'visible' : 'none');
      for (const layer of ['pilot-buildings-fill','pilot-buildings-line','pilot-measured-buildings']) {
        if (map.getLayer(layer)) map.setLayoutProperty(layer,'visibility',this.buildings?'visible':'none');
      }
      document.querySelector('[data-map="buildings"]').classList.toggle('active', this.buildings);
      if (this.buildings) this.notify('已开启OSM建筑图层。哈尔滨试点已收录86个真实轮廓，缺少可靠高度，按平面轮廓显示。其他区域覆盖随在线源变化。');
    }
  }

  animateRoute(points) {
    if (!this.ready || points.length < 2) return;
    cancelAnimationFrame(this.routeFrame);
    this.routePoints = points;
    const start = performance.now();
    let lastUpdate = 0;
    const frame = now => {
      if (this.destroyed) return;
      if (now - lastUpdate < 80) { this.routeFrame = requestAnimationFrame(frame); return; }
      lastUpdate = now;
      const progress = this.reducedMotion() ? 1 : Math.min(1, Math.max(0, (now - start) / 2400));
      const segment = progress * (points.length - 1);
      const index = Math.min(points.length - 2, Math.floor(segment));
      const part = segment - index;
      const tip = points[index].map((value, axis) => value + (points[index + 1][axis] - value) * part);
      const coordinates = [...points.slice(0, index + 1), tip];
      this.map.getSource('study-route').setData({type: 'FeatureCollection', features: [{type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates}}]});
      if (progress < 1) this.routeFrame = requestAnimationFrame(frame);
    };
    this.routeFrame = requestAnimationFrame(frame);
    this.fitGeometry({type: 'LineString', coordinates: points}, 1100);
  }

  toggleLayer(id, visible) {
    if (this.ready) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    if (id === 'exhibit-city-names') this.cityMarkers.forEach(marker => { marker.getElement().style.display = visible ? '' : 'none'; });
  }

  focusCity(name) {
    if (!this.ready) { this.pendingIntent = {action:'focusCity',value:name}; return; }
    this.map.stop();
    const feature = this.store.database.cities.features.find(feature => feature.properties.name === name);
    if (!feature) return;
    this.map.getSource('selected-scope').setData({type: 'FeatureCollection', features: [feature]});
    this.fitGeometry(feature.geometry);
    const context = document.getElementById('locationContext'); context.hidden = false;
    context.textContent = `当前显示${name}的真实行政范围与匹配档案。`;
  }

  fitRecords(records) {
    const located = records.filter(record => record.longitude !== null);
    if (!this.ready) { this.pendingIntent = {action:'fitRecords',value:records}; return; }
    if (!located.length) { if (records[0]) this.focus(records[0]); return; }
    this.map.stop();
    if (located.length === 1) this.focus(located[0]);
    else this.fitGeometry({type: 'MultiPoint', coordinates: located.map(record => [record.longitude, record.latitude])});
  }

  setBaseMode(mode) {
    if (!this.ready) { this.pendingMode = mode; return; }
    this.baseMode = mode;
    this.map.setMaxZoom(19);
    this.applyBaseVisibility();
    this.updateMessage();
    this.watchService();
    document.querySelector('[data-map="satellite"]').classList.toggle('active', mode === 'satellite');
    document.querySelector('[data-map="road"]').classList.toggle('active', mode === 'road');
  }

  destroy() {
    this.destroyed = true; this.clusterRequest++; clearTimeout(this.serviceTimer);
    this.cityMarkers.forEach(marker => marker.remove());
    this.markers.forEach(marker => marker.remove());
    this.clusterMarkers.forEach(marker => marker.remove());
    cancelAnimationFrame(this.routeFrame); clearTimeout(this.hoverTimer);
    this.resizeObserver.disconnect();
    this.popup?.remove(); this.map.remove();
  }
}

window.ExhibitMap = ExhibitMap;
