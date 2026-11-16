(() => {
  const store = new ExhibitStore(EXHIBIT_DB);
  const region = EXHIBIT_DB.metadata;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const photo = record => HeritageImages.get(record)?.src;
  const isLocated = record => record.longitude !== null && record.latitude !== null;
  let activeTab = 'intro';
  let renderedArchiveId;
  const noteDrafts = new Map();
  let experience;
  const virtualList = new VirtualRecordList($('exResults'), renderRecord, selectRecord, firstIndex => {
    store.page = Math.floor(firstIndex / store.pageSize) + 1;
    updatePagination();
  });
  let toastTimer;
  let saved;
  try { saved = new Set(JSON.parse(localStorage.getItem('kanglian-saved') || '[]')); }
  catch { saved = new Set(); }

  function notify(message) {
    $('exToast').textContent = message;
    $('exToast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('exToast').hidden = true; }, 3600);
  }
  $('exToast').hidden = true;

  function openDialog(html) {
    $('exDialogContent').innerHTML = html;
    if (!$('exDialog').open) $('exDialog').showModal();
  }
  $('closeExDialog').addEventListener('click', () => $('exDialog').close());
  $('exDialog').addEventListener('click', event => { if (event.target === $('exDialog')) $('exDialog').close(); });

  function selectRecord(id, focus = false) {
    if (window.exhibitApp?.study?.active) { window.exhibitApp.study.showArchive(id, focus); return; }
    if (!store.byId.has(id)) return;
    window.speechSynthesis?.cancel();
    if (!store.matching().some(record => record.id === id)) {
      store.reset();
      syncFilters();
      exhibitMap.refresh();
    }
    store.selected = id;
    const url = new URL(location.href);
    url.searchParams.set('site', id);
    history.replaceState(null, '', url);
    exhibitMap.clearRoute?.();
    store.page = Math.floor(store.matching().findIndex(record => record.id === id) / store.pageSize) + 1;
    activeTab = 'intro';
    renderList();
    renderDetail();
    document.querySelector('.province-stats').scrollTop = 0;
    experience?.render();
    if (focus) exhibitMap.focus(store.byId.get(id));
    else exhibitMap.highlight();
    if (focus) experience?.openDetail();
    if (focus && matchMedia('(max-width:700px)').matches) {
      document.querySelector('.ex-map').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    }
  }

  function updatePagination() {
    const pages = Math.max(1, Math.ceil(store.matching().length / store.pageSize));
    store.page = Math.max(1, Math.min(store.page, pages));
    $('exPage').textContent = `${store.page} / ${pages} 页`;
    $('exPrev').disabled = store.page === 1;
    $('exNext').disabled = store.page === pages;
  }

  function renderList() {
    const records = store.matching();
    const pages = Math.max(1, Math.ceil(records.length / store.pageSize));
    store.page = Math.min(store.page, pages);
    $('exCount').textContent = `${records.length} / ${store.records.length} 条`;
    $('exPage').textContent = `${store.page} / ${pages} 页`;
    $('exPrev').disabled = store.page === 1;
    $('exNext').disabled = store.page === pages;
    virtualList.setRecords(records, (store.page - 1) * store.pageSize);
    $('catalogNote').textContent = '保留完整来源记录。点位按已有坐标定位，坐标待核验记录可查看关联行政范围。';
  }

  function renderRecord(record) {
    return `
      <button class="ex-record ${photo(record) ? '' : 'text-only'} ${record.id === store.selected ? 'active' : ''}" data-record="${escape(record.id)}" aria-pressed="${record.id === store.selected}">
        ${photo(record) ? `<img data-image-asset="${escape(record.image)}" src="${photo(record)}" alt="${escape(record.imageCaption)}" loading="lazy">` : ''}
        <span><strong>${escape(record.name)}</strong><small>${escape(record.kind)} · ${escape(record.city)}</small><em>${isLocated(record) ? 'B级 · 公开参考位置' : '范围参考 / 待核验'}${record.dataConflicts?.length ? ' · 资料差异' : ''}${record.vrUrl ? ' · VR' : ''}</em></span><span>›</span>
      </button>`;
  }

  const tabs = [['intro', '遗址简介'], ['history', '历史背景'], ['people', '相关人物'], ['vr', 'VR导览'], ['coords', '坐标信息']];

  function detailContent(record) {
    if (activeTab === 'history') {
      return `<h3>历史背景与原始记录</h3><p>${escape(record.background || '原台账尚未提供历史简介。')}</p><div class="detail-facts"><div><b>原表标注等级</b>${escape(record.level || '未提供')}</div><div><b>原表数据状态</b>${escape(record.status || '未提供')}</div></div><p class="data-source">历史叙述保留原台账内容，进一步研究可结合馆方档案核验。</p>`;
    }
    if (activeTab === 'people') {
      return `<h3>相关人物</h3>${record.people.length ? record.people.map(name => `<button class="detail-vr" data-person="${escape(name)}">${escape(name)} · 检索关联档案 →</button>`).join(' ') : '<p>该条台账尚未提供可明确关联的人物信息。</p>'}<p class="data-source">关联依据为台账名称及简介中出现的人名，专题传记与人物档案持续补充。</p>`;
    }
    if (activeTab === 'vr') {
      return `<h3>VR数字导览</h3>${record.vrUrl ? `<p>馆方公开全景资源，可在新窗口中拖动视角浏览。</p><a class="gold-action" href="${escape(record.vrUrl)}" target="_blank" rel="noopener">进入公开全景 →</a><p class="data-source">资源入口 <a href="https://www.jn1948.cn/list/32.html" target="_blank" rel="noopener">东北烈士纪念馆官网 · 全景展馆</a></p>` : '<p>该遗址的经核验全景资源尚未收录。</p><button class="detail-vr" id="showAvailableVr">查看已收录VR资源 →</button>'}`;
    }
    if (activeTab === 'coords') {
      return `<h3>坐标与核对依据</h3><p>${isLocated(record) ? `${record.longitude.toFixed(6)}° E · ${record.latitude.toFixed(6)}° N\n统一展示参考 WGS84\n${escape(record.coordinateStatus)}\n精度 ${escape(record.coordinatePrecision || '公开设施参考点')}\n来源参考 ${escape(record.sourceCoordinateSystem)}\n${escape(record.coordinateMethod)}` : `缺少可确认的遗址级坐标。点击定位时展示台账所列${escape(record.scopeName)}行政范围。`}</p>${record.coordinateSource ? `<p class="data-source">坐标来源 <a href="${escape(record.coordinateSource)}" target="_blank" rel="noopener">查看公开地图资料</a><br>${escape(record.verificationEvidence || '')}<br>核对日期 ${escape(record.verifiedAt || '')}</p>` : ''}<p class="data-source">原始地址 ${escape(record.originalAddress || '未提供')}<br>来源工作表 ${escape(record.sheet)} · 第 ${record.row} 行<br>底图 MapLibre / Esri / OpenStreetMap，DEM Mapzen<br>行政边界 DataV GeoAtlas，GCJ-02 已转换为 WGS84，独立精度校核与授权核验待完成。</p><button id="locateSelected" class="detail-vr">${isLocated(record) ? '聚焦此遗址' : '查看台账所列行政范围'} →</button>`;
    }
    const backgroundConflict = record.dataConflicts?.some(conflict => conflict.conflictingFields?.includes('background'));
    return `<h3>${backgroundConflict ? '原始简介存在差异' : '遗址简介'}</h3><p>${backgroundConflict ? '该条原表简介与遗址名称存在错配，原文保留在“历史背景”页。请结合上方核对依据阅读。' : escape(record.background || '原台账尚未提供历史简介。')}</p>
      <div class="detail-facts"><div><b>所属城市</b>${escape(record.city)}</div><div><b>遗址类型</b>${escape(record.kind)}</div><div><b>定位状态</b>${isLocated(record) ? 'B级 · 公开参考位置' : '精确位置待核验'}</div><div><b>坐标精度</b>${escape(record.coordinatePrecision || '台账所列行政范围')}</div></div>
      ${record.vrUrl ? '<div class="detail-vr">已关联馆方公开全景</div>' : ''}${record.routeIds.length ? `<div class="detail-vr">关联研学路线 ${record.routeIds.length} 条</div>` : ''}
      <p class="data-source">${record.address === record.originalAddress ? '原台账地址' : '公开资料核对地址'} ${escape(record.address || '待补充')}<br>${escape(record.sheet)} · 第 ${record.row} 行</p>`;
  }

  function renderDetail() {
    const record = store.byId.get(store.selected);
    if (!record) {
      $('exDetail').innerHTML = '<div class="archive-empty"><span>⌕</span><h2>没有匹配的档案</h2><p>调整搜索词、城市或分类后继续探索。</p></div>';
      $('compareToggle').hidden = true;
      return;
    }
    $('exDetail').innerHTML = `<div class="archive-record-meta">${escape(record.coordinateGrade)}级位置 · ${record.sourceRecordIds.length} 条来源记录</div><div class="detail-title"><h2>${escape(record.name)}</h2><button id="saveSelected" aria-label="收藏遗址" aria-pressed="${saved.has(record.id)}">${saved.has(record.id) ? '★' : '☆'}</button></div>
      ${photo(record) ? `<img data-image-asset="${escape(record.image)}" class="detail-photo" loading="lazy" decoding="async" id="zoomPhoto" tabindex="0" role="button" src="${photo(record)}" alt="${escape(record.imageCaption)}"><div class="detail-photo-controls"><span>${escape(record.imageCaption)} · 1 / 1 · 点击放大</span></div><p class="photo-caption"><a href="${escape(record.imageSource)}" target="_blank" rel="noopener">查看图片出处 ↗</a></p>` : ''}
      <div class="detail-tabs">${tabs.filter(([key]) => key !== 'vr' || record.vrUrl).map(([key, name]) => `<button data-detail-tab="${key}" class="${key === activeTab ? 'active' : ''}" aria-pressed="${key === activeTab}">${name}</button>`).join('')}</div>
      ${record.dataConflicts?.length ? `<div class="source-warning">资料核对发现差异${record.dataConflicts.map(conflict => `<p>${escape(conflict.finding || conflict.description || conflict.issue || conflict.conclusion || '原台账资料需要进一步核对')}${conflict.source ? `<br><a href="${escape(conflict.source)}" target="_blank" rel="noopener">核对依据 ↗</a>` : ''}</p>`).join('')}</div>` : ''}
      <section class="detail-section">${detailContent(record)}</section>
      <div class="detail-actions"><button class="gold-action" id="readArchive">阅读原始档案 →</button><button class="detail-vr" id="speakSelected">语音讲解</button>${record.vrUrl ? `<a class="detail-vr" href="${escape(record.vrUrl)}" target="_blank" rel="noopener">VR导览 ↗</a>` : ''}</div>
      <section class="detail-section related-archives"><h3>关联探索</h3><div id="relatedArchives"></div><p class="data-source">实体 ${escape(record.siteId)}<br>原始来源记录保留独立ID。</p></section>
      <section class="map-study-note"><h3>研学手记</h3><textarea id="selectedNote" aria-label="当前遗址研学手记" placeholder="记录观察、依据与问题"></textarea><button id="saveSelectedNote" class="detail-vr">保存手记</button></section>`;
    const related = store.records.filter(item => item.id !== record.id && (item.siteId === record.siteId || item.people.some(person => record.people.includes(person)))).sort((a,b) => Number(b.siteId === record.siteId) - Number(a.siteId === record.siteId)).slice(0, 6);
    $('relatedArchives').innerHTML = related.length ? related.map(item => `<button class="cluster-item" data-related-id="${escape(item.id)}">${escape(item.name)}<small>${item.siteId === record.siteId ? '同一实体的来源记录' : '共同人物 · ' + escape(item.people.filter(person => record.people.includes(person)).join('、'))}</small></button>`).join('') : '<p>当前台账尚无已确认的跨遗址关联。</p>';
    $('relatedArchives').querySelectorAll('[data-related-id]').forEach(button => button.addEventListener('click', () => selectRecord(button.dataset.relatedId, true)));
    if (record.geographyCandidate) {
      const candidate = record.geographyCandidate;
      $('exDetail').insertAdjacentHTML('beforeend', `<details class="candidate-evidence"><summary>地理信息补全进度 · ${escape(candidate.grade)}级</summary><p>${candidate.position ? '已找到同名公开GIS候选，精度与对象仍需复核。' : '当前证据支持行政范围参考。'}</p><p>${escape(candidate.scope_name || '行政归属待确认')}</p>${candidate.poi_candidates.map(item => `<a class="map-search-link" href="${escape(item.source)}" target="_blank" rel="noopener">${escape(item.name)} · WGS84公开候选 ↗</a>`).join('')}<p class="data-source">候选位置与正式点位分开保存。官方网页逐项检索尚待接入检索服务。</p></details>`);
    }
    if (record.name === '哈尔滨烈士陵园') {
      const observe = document.createElement('button'); observe.className = 'gold-action'; observe.id = 'observePilot'; observe.textContent = '哈尔滨烈士陵园 · 三维观察';
      observe.addEventListener('click', () => { if (exhibitMap instanceof ExhibitFlatMap) switchMap('satellite'); else exhibitMap.setBaseMode('satellite'); exhibitMap.focus(record); notify('真实影像与DEM地形，建筑仅在源数据有覆盖时显示。当前尚无已接入的陵园实景三维模型。'); });
      $('exDetail').querySelector('.detail-title').after(observe);
    }
    $('exDetail').insertAdjacentHTML('beforeend', `<button id="locateSelectedAlways" class="map-search-link">${isLocated(record) ? '在当前地图查看此遗址' : '在当前地图查看台账所列范围'} →</button><a class="map-search-link" href="https://www.amap.com/search?query=${encodeURIComponent(region.name + ' ' + record.name)}" target="_blank" rel="noopener">高德地图检索同名地点 ↗</a>`);
    $('exDetail').querySelectorAll('[data-detail-tab]').forEach(button => button.addEventListener('click', () => { activeTab = button.dataset.detailTab; renderDetail(); }));
    $('compareToggle').hidden = !photo(record);
    $('readArchive').addEventListener('click', () => { activeTab = 'history'; renderDetail(); });
    try { $('selectedNote').value = noteDrafts.get(record.id) ?? localStorage.getItem('kanglian-draft-' + record.id) ?? localStorage.getItem('kanglian-note-' + record.id) ?? ''; } catch { $('selectedNote').value = noteDrafts.get(record.id) || ''; }
    $('selectedNote').addEventListener('input', event => {
      noteDrafts.set(record.id, event.target.value);
      try { localStorage.setItem('kanglian-draft-' + record.id, event.target.value); } catch {}
    });
    $('saveSelectedNote').addEventListener('click', () => {
      try { localStorage.setItem('kanglian-note-' + record.id, $('selectedNote').value); notify('研学手记已保存。'); }
      catch { notify('当前浏览器无法保存手记，可复制文本留存。'); }
    });
    $('speakSelected').addEventListener('click', () => {
      if (!window.speechSynthesis) { notify('当前浏览器暂不支持语音朗读。'); return; }
      if (speechSynthesis.speaking) { speechSynthesis.cancel(); $('speakSelected').textContent = '语音讲解'; return; }
      const speech = new SpeechSynthesisUtterance(record.name + '。' + ((record.searchBackground ?? record.background) || '原台账简介存在资料差异，请结合核验依据阅读。'));
      speech.lang = 'zh-CN'; speech.rate = .9;
      speech.onend = () => { if ($('speakSelected')) $('speakSelected').textContent = '语音讲解'; };
      speechSynthesis.speak(speech); $('speakSelected').textContent = '停止讲解';
    });
    $('saveSelected').addEventListener('click', () => {
      if (saved.has(record.id)) saved.delete(record.id); else saved.add(record.id);
      try { localStorage.setItem('kanglian-saved', JSON.stringify([...saved])); notify(saved.has(record.id) ? '已收藏此遗址。' : '已取消收藏。'); }
      catch { notify('当前浏览器无法持久保存收藏，本次会话仍可使用。'); }
      renderDetail();
    });
    const enlarge = () => openDialog(`<h2>${escape(record.name)}</h2><img data-image-asset="${escape(record.image)}" src="${photo(record)}" alt="${escape(record.imageCaption)}"><p>${escape(record.imageCaption)} · <a href="${escape(record.imageSource)}" target="_blank" rel="noopener">图片来源 ↗</a></p>`);
    $('zoomPhoto')?.addEventListener('click', enlarge);
    $('zoomPhoto')?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); enlarge(); } });
    $('locateSelected')?.addEventListener('click', () => exhibitMap.focus(record));
    $('locateSelectedAlways').addEventListener('click', () => {
      exhibitMap.focus(record);
      document.querySelector('.ex-map').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    });
    $('showAvailableVr')?.addEventListener('click', showVr);
    $('exDetail').querySelectorAll('[data-person]').forEach(button => button.addEventListener('click', () => search(button.dataset.person)));
    if (renderedArchiveId !== record.id && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('exDetail').animate([{opacity: 0.6, transform: 'translateX(10px)'}, {opacity: 1, transform: 'translateX(0)'}], {duration: 320, easing: 'ease-out'});
    }
    renderedArchiveId = record.id;
  }

  function syncFilters() {
    $('exSearch').value = store.filters.query;
    $('exKind').value = store.filters.kind;
    $('exCity').value = store.filters.city;
    $('exStatus').value = store.filters.status;
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === store.filters.mode));
  }

  function refresh() {
    store.reconcileSelection();
    syncFilters(); renderList(); renderDetail(); exhibitMap.refresh(); exhibitMap.highlight(); experience?.render();
  }

  function search(query) {
    store.reset(); store.setFilter('query', query); refresh();
    const matches = store.matching();
    if (matches.length === 1) selectRecord(matches[0].id, true);
    else exhibitMap.fitRecords?.(matches);
  }

  function focusCity(name) {
    store.setFilter('city', store.filters.city === name ? '' : name);
    refresh();
    if (store.filters.city) exhibitMap.focusCity(name); else exhibitMap.home();
  }

  function chooseCategory(id) {
    store.setFilter('category', store.filters.category === id ? '' : id);
    refresh();
  }

  for (const [element, key] of [['exKind', 'kind'], ['exCity', 'city']]) {
    const values = (key === 'city' ? EXHIBIT_DB.cities.features.map(feature => feature.properties.name) : [...new Set(store.records.map(record => record[key]))]).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    $(element).insertAdjacentHTML('beforeend', values.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join(''));
  }
  let searchTimer;
  $('exSearch').addEventListener('input', event => {
    const query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      store.setFilter('query', query); refresh();
      const matches = store.matching();
      if (matches.length === 1) selectRecord(matches[0].id, true);
      else if (query.trim()) exhibitMap.fitRecords?.(matches);
    }, 140);
  });
  $('exSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(searchTimer); store.setFilter('query', event.target.value); refresh(); if (store.selected) selectRecord(store.selected, true); } });
  for (const [element, key] of [['exKind', 'kind'], ['exCity', 'city'], ['exStatus', 'status']]) {
    $(element).addEventListener('change', event => {
      store.setFilter(key, event.target.value); refresh();
      if (key === 'city' && event.target.value) exhibitMap.focusCity(event.target.value);
    });
  }
  document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => search(button.dataset.query)));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { store.setFilter('mode', button.dataset.mode); refresh(); }));
  $('exReset').addEventListener('click', () => { store.reset(); refresh(); exhibitMap.home(); });
  $('exPrev').addEventListener('click', () => { store.page--; renderList(); });
  $('exNext').addEventListener('click', () => { store.page++; renderList(); });

  function showVr() {
    const records = [...new Map(store.records.filter(record => record.vrUrl).map(record => [record.vrUrl, record])).values()];
    openDialog(`<h2>${escape(region.name)}VR资源</h2><p>${records.length ? '以下为本省区已关联的馆方公开全景。' : '本省区台账的经核验全景资源尚待收录，可浏览东北烈士纪念馆公开展厅。'}</p>${records.map(record => `<p><a href="${escape(record.vrUrl)}" target="_blank" rel="noopener">${escape(record.name)} · 进入全景 ↗</a></p>`).join('')}<p><a href="https://www.jn1948.cn/list/32.html" target="_blank" rel="noopener">东北烈士纪念馆全景资源目录 ↗</a></p>`);
  }
  $('vrToggle').addEventListener('click', showVr);
  $('eventToggle').addEventListener('click', () => {
    openDialog('<h2>历史事件关联档案</h2><p>选择事件主题，检索原台账中的相关叙述。有公开坐标的关联记录同步显示在地图上。</p><div id="eventChoices"></div>');
    for (const term of ['八女投江', '赵一曼', '赵尚志', '杨靖宇', '密营', '战斗']) {
      const button = document.createElement('button'); button.className = 'detail-vr'; button.textContent = term;
      button.addEventListener('click', () => { search(term); $('exDialog').close(); }); $('eventChoices').append(button);
    }
  });
  $('layerToggle').addEventListener('click', () => {
    openDialog(`<h2>地图数据图层</h2><p>${escape(region.fullName)}包含 ${region.cityCount} 个地市与 ${EXHIBIT_DB.counties.features.length} 个县级源要素。县界在缩放级别 7 以上显示。</p><div>${[['city-boundary', '地市边界'], ['county-boundary', '县级边界'], ['exhibit-city-names', '地市中文名称'], ['terrain-shade', '真实高程晕渲']].map(([id, title]) => `<label style="display:block;padding:8px"><input type="checkbox" data-layer="${id}" style="width:auto" ${!exhibitMap.ready || exhibitMap.map.getLayoutProperty(id, 'visibility') !== 'none' ? 'checked' : ''}> ${title}</label>`).join('')}</div><p class="data-source">行政边界已转换至 WGS84 展示参考，独立精度校核与授权核验待完成。</p>`);
    document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => exhibitMap.toggleLayer(input.dataset.layer, input.checked)));
  });
  $('routeToggle').addEventListener('click', () => {
    if (window.exhibitApp?.study) { window.exhibitApp.study.open(); return; }
    const routes = MUSEUM.routes.filter(route => store.records.some(record => record.routeIds.includes(route.id)));
    const located = [...new Map(store.records.filter(isLocated).map(record => [[record.longitude, record.latitude].join(','), record])).values()];
    openDialog(`<h2>${escape(region.name)}研学路线</h2><p>地图连线表示参访顺序，交通通行路线需结合道路导航规划。</p>${located.length >= 2 ? '<section class="detail-section"><h3>公开点位自选连线</h3><p>按下方勾选顺序连接真实公开点位，可作为参访规划的起点。</p><div id="routeStops"></div><button class="detail-vr" id="playSelectedRoute">绘制勾选点位 →</button></section>' : ''}${routes.map(route => `<section class="detail-section"><h3>${escape(route.name)}</h3><p>${escape(route.description)}</p><p class="data-source">${escape(route.question)}</p><button class="detail-vr" data-route="${route.id}">${route.id === 'harbin' && region.name === '黑龙江' ? '播放哈尔滨三处遗址连线 →' : '检索本省区关联档案 →'}</button></section>`).join('')}<p><a href="index.html#digital-features">查看全域研学路线 ↗</a></p>`);
    if ($('routeStops')) {
      const selectedStops = new Set();
      $('routeStops').innerHTML = located.map(record => `<label style="display:block;padding:4px"><input type="checkbox" data-route-stop="${escape(record.id)}" style="width:auto"> ${escape(record.name)}</label>`).join('');
      document.querySelectorAll('[data-route-stop]').forEach(input => input.addEventListener('change', () => {
        if (input.checked) selectedStops.add(input.dataset.routeStop); else selectedStops.delete(input.dataset.routeStop);
      }));
      $('playSelectedRoute').addEventListener('click', () => {
        if (selectedStops.size < 2) { notify('请选择至少两处有公开坐标的遗址。'); return; }
        const points = [...selectedStops].map(id => store.byId.get(id)).map(record => [record.longitude, record.latitude]);
        exhibitMap.animateRoute(points);
        $('exDialog').close();
        notify('已按勾选顺序绘制公开点位连线。');
      });
    }
    document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => {
      const route = MUSEUM.routes.find(item => item.id === button.dataset.route);
      if (route.id === 'harbin' && region.name === '黑龙江') {
        const points = route.stops.map(key => {
          const featured = MUSEUM.featured.find(place => place.key === key);
          return store.records.find(record => record.name === featured.name && isLocated(record));
        }).filter(Boolean).map(record => [record.longitude, record.latitude]);
        exhibitMap.animateRoute(points);
        notify('研学顺序连线已绘制，点击线路可重播。');
      } else {
        store.reset(); store.setFilter('query', route.name); refresh();
      }
      $('exDialog').close();
    }));
  });
  $('compareToggle').addEventListener('click', () => {
    const record = store.byId.get(store.selected);
    openDialog(`<h2>时空对读 · ${escape(record.name)}</h2><div class="compare-banner">当前档案已收录 ${photo(record) ? '1 张资料影像' : '文字资料'}，历史影像配对待补充。</div>${photo(record) ? `<img data-image-asset="${escape(record.image)}" src="${photo(record)}" alt="${escape(record.imageCaption)}"><p>${escape(record.imageCaption)}</p>` : ''}<h3>台账中的历史记忆</h3><p>${escape(record.background || '历史简介待补充')}</p>`);
  });
  $('archiveOpen').addEventListener('click', () => {
    openDialog(`<h2>全部遗址档案</h2><div class="archive-library-filters"><input id="archiveLibraryQuery" type="search" aria-label="全部档案检索" placeholder="检索遗址、城市、人物与事件"><select id="archiveLibraryProvince" aria-label="全部档案省区"><option value="">全部省区</option>${['黑龙江', '吉林', '辽宁', '内蒙古'].map(name => `<option value="${name}">${name === '内蒙古' ? '内蒙古东部' : name}</option>`).join('')}</select></div><div id="archiveLibraryList" class="archive-library-list"></div><div class="archive-library-pages"><button id="archiveLibraryPrev">上一页</button><span id="archiveLibraryCount" role="status"></span><button id="archiveLibraryNext">下一页</button></div>`);
    let page = 0;
    const render = () => {
      const query = $('archiveLibraryQuery').value.trim().toLocaleLowerCase();
      const province = $('archiveLibraryProvince').value;
      const records = STUDY_ROUTE_CATALOG.records.filter(record => {
        const text = [record.name, record.city, record.address, record.background_warning ? '' : record.background, ...record.people].join(' ').toLocaleLowerCase();
        return (!province || record.province === province) && (!query || text.includes(query));
      });
      const pages = Math.max(1, Math.ceil(records.length / 20));
      page = Math.min(page, pages - 1);
      $('archiveLibraryList').innerHTML = records.length ? records.slice(page * 20, (page + 1) * 20).map(record => `<a class="cluster-item" data-archive-record="${escape(record.id)}" href="${escape(record.province_slug)}.html?site=${encodeURIComponent(record.id)}">${escape(record.name)}<small>${escape(record.province === '内蒙古' ? '内蒙古东部' : record.province)} · ${escape(record.city)} · ${escape(record.kind)}</small></a>`).join('') : '<p class="archive-empty">没有匹配的档案，请调整检索条件。</p>';
      $('archiveLibraryCount').textContent = `${records.length} 条档案 · ${page + 1} / ${pages} 页`;
      $('archiveLibraryPrev').disabled = page === 0;
      $('archiveLibraryNext').disabled = page >= pages - 1;
      $('archiveLibraryList').scrollTop = 0;
    };
    for (const id of ['archiveLibraryQuery', 'archiveLibraryProvince']) {
      $(id).addEventListener(id === 'archiveLibraryQuery' ? 'input' : 'change', () => { page = 0; render(); });
    }
    $('archiveLibraryPrev').addEventListener('click', () => { page--; render(); });
    $('archiveLibraryNext').addEventListener('click', () => { page++; render(); });
    $('archiveLibraryList').addEventListener('click', event => {
      const link = event.target.closest('[data-archive-record]');
      if (!link || !store.byId.has(link.dataset.archiveRecord)) return;
      event.preventDefault();
      selectRecord(link.dataset.archiveRecord, true);
      $('exDialog').close();
    });
    render();
    $('archiveLibraryQuery').focus();
  });

  $('guideOpen').addEventListener('click', () => {
    openDialog(`<h2>智能导览 · 本地档案检索</h2><p>输入遗址、人物、城市或事件关键词，在完整${escape(region.name)}台账中检索。可查询“烈士”“纪念馆”“密营”。</p><input id="guideQuery" aria-label="导览检索词" placeholder="输入关键词"><div id="guideResults"></div><p class="data-source">当前采用本地关键词检索，结果来自原台账。</p>`);
    const input = $('guideQuery');
    const results = $('guideResults');
    input.addEventListener('input', () => {
      const query = input.value.trim();
      const words = query.split(/\s+/);
      const matches = query ? store.records.filter(record => words.every(word => [record.name, record.city, record.searchBackground ?? record.background, record.address].join(' ').includes(word))) : [];
      results.innerHTML = `<p>匹配 ${matches.length} 条档案${matches.length > 12 ? '，显示前 12 条' : ''}</p>` + matches.slice(0, 12).map(record => `<button class="cluster-item" data-guide-id="${escape(record.id)}">${escape(record.name)} · ${escape(record.city)}</button>`).join('');
      results.querySelectorAll('[data-guide-id]').forEach(button => button.addEventListener('click', () => { selectRecord(button.dataset.guideId, true); $('exDialog').close(); }));
    });
    input.focus();
  });

  const events = [
    ['1931.9', '九一八事变', '抗日'], ['1936', '抗联建制', '抗联'],
    ['1938', '八女投江', '八女'], ['1940', '杨靖宇殉国', '杨靖宇'], ['1945.8', '抗战胜利', '抗日']
  ];
  $('timelineEvents').innerHTML = events.map(([year, title, term]) => `<button data-event-query="${term}" aria-label="检索${title}关联档案"><b>${year}</b><span>${title}</span></button>`).join('');
  document.querySelectorAll('[data-event-query]').forEach(button => button.addEventListener('click', () => search(button.dataset.eventQuery)));
  $('headingData').textContent = `${store.records.length} 条来源记录 · ${region.cityCount} 个地市 · ${store.records.filter(isLocated).length} 条可显示公开参考位置`;
  const locatedCount = store.records.filter(isLocated).length;
  const vrCount = new Set(store.records.filter(record => record.vrUrl).map(record => record.vrUrl)).size;
  const statistics = [[store.records.length, '台账记录', '含两份表格重复收录'], [locatedCount, '已关联公开坐标', `对应 ${region.uniqueLocatedCount} 处设施`], [region.pendingCount, '遗址坐标待补', '点击可看所列行政范围'], [region.conflictCount, '已标资料差异', `${vrCount} 个关联VR入口`]];
  $('exStatistics').innerHTML = statistics.map(([value, name, note]) => `<div><span>${name}</span><strong data-final="${value}">${value}</strong><small>${note}</small></div>`).join('');

  // Derive the decorative province silhouette directly from the geographic boundary.
  const shape = EXHIBIT_DB.province.features[0].geometry;
  const polygons = shape.type === 'MultiPolygon' ? shape.coordinates : [shape.coordinates];
  const points = polygons.flat(2);
  const minX = Math.min(...points.map(point => point[0]));
  const maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1]));
  const maxY = Math.max(...points.map(point => point[1]));
  const path = polygons.map(polygon => polygon.map(ring => ring.map((point, index) => `${index ? 'L' : 'M'}${((point[0] - minX) / (maxX - minX) * 50 + 2).toFixed(2)},${(53 - (point[1] - minY) / (maxY - minY) * 50).toFixed(2)}`).join(' ') + 'Z').join(' ')).join(' ');
  $('provinceShape').innerHTML = `<svg viewBox="0 0 55 55" aria-hidden="true"><path d="${path}"></path></svg>`;

  let exhibitMap;
  function switchMap(mode) {
    experience?.unbindMap();
    exhibitMap?.destroy?.();
    document.querySelectorAll('[data-map]').forEach(button => { button.disabled = false; });
    try {
      exhibitMap = mode === 'local' ? new ExhibitFlatMap(store, selectRecord, notify) : new ExhibitMap(store, selectRecord, notify, focusCity);
    } catch (error) {
      exhibitMap = new ExhibitFlatMap(store, selectRecord, notify);
    }
    window.exhibitApp.map = exhibitMap;
    experience?.bindMap(exhibitMap);
    window.dispatchEvent(new Event('exhibit-engine-changed'));
    if (mode === 'satellite') exhibitMap.pendingMode = 'satellite';
    if (exhibitMap.ready && store.selected) exhibitMap.highlight();
  }
  window.exhibitApp = {store, selectRecord, search, notify, switchMap, dialog: openDialog};
  switchMap(new URLSearchParams(location.search).get('flat') === '1' ? 'local' : 'road');
  experience = new ExhibitExperience(store, exhibitMap, {
    city: focusCity, category: chooseCategory, select: selectRecord, dialog: openDialog,
    reset: () => { store.reset(); refresh(); exhibitMap.home(); }
  });
  window.addEventListener('exhibit-map-unavailable', event => {
    if (event.detail === exhibitMap && !exhibitMap.destroyed) { switchMap('local'); notify('底图服务暂不可用，已启用本地行政区划。可点击道路或卫星重试连接。'); }
  });
  document.querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.map;
    if (action === 'local') { switchMap('local'); return; }
    if (exhibitMap instanceof ExhibitFlatMap && ['road', 'satellite', 'three'].includes(action)) {
      switchMap(action); return;
    }
    exhibitMap.control(action);
  }));
  renderList(); renderDetail();
  experience.render();
  window.exhibitApp.experience = experience;
  window.exhibitApp.explore = new ExhibitExplore(store, {select:selectRecord, search, dialog:openDialog});
  window.exhibitApp.study = new StudyRouteWorkspace(window.exhibitApp);
  window.addEventListener('pagehide', event => {
    clearTimeout(searchTimer);
    window.speechSynthesis?.cancel();
    if (!event.persisted) { virtualList.destroy(); experience.destroy(); exhibitMap.destroy?.(); }
  });
  if (new URLSearchParams(location.search).has('site')) {
    const focusRequested = () => selectRecord(store.selected, true);
    if (exhibitMap.ready) focusRequested();
    else window.addEventListener('exhibit-map-ready', focusRequested, {once: true});
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && window.gsap) {
    const timeline = gsap.timeline();
    timeline.from('.ex-heading', {opacity: 0, y: 12, duration: 0.45})
      .from('.ex-map', {opacity: 0, y: 25, duration: 0.65}, 0.1)
      .from('.ex-catalog,.province-stats', {opacity: 0, x: index => index ? 20 : -20, duration: 0.5, stagger: 0.08}, 0.25)
      .from('.digital-footer', {opacity: 0, y: 12, duration: 0.4}, 0.55);
    document.querySelectorAll('[data-final]').forEach(element => {
      const value = Number(element.dataset.final);
      if (!Number.isFinite(value)) return;
      const counter = {value: 0};
      gsap.to(counter, {value, duration: 1.8, delay: 0.55, ease: 'power2.out', onUpdate: () => { element.textContent = Math.round(counter.value); }});
    });
  }
})();
