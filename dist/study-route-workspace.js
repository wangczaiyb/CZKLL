/* Complete study-route editing on the shared province GIS surface. */
window.StudyRouteWorkspace = class StudyRouteWorkspace {
  constructor(app) {
    this.app=app;this.catalog=STUDY_ROUTE_CATALOG;
    this.records=this.catalog.records.map(record=>({...record,search:[record.name,record.province,record.city,record.county,record.township,record.village,record.address,record.background_warning?'':record.background,...record.people].join(' ').normalize('NFKC').toLocaleLowerCase()}));
    this.byId=new Map(this.records.map(record=>[record.id,record]));
    this.filters={query:'',province:'',city:'',county:'',kind:'',grade:'',image:'',vr:'',person:''};
    this.checked=new Set();this.routes=new Map();this.repository=new StudyRoutes.Repository();
    this.escape=StudyRouteExport.escape;this.active=false;this.route=null;this.planningToken=0;this.playIndex=0;
    this.persistChain=Promise.resolve();
    document.getElementById('studyEditorOpen').addEventListener('click',()=>this.open());
    window.addEventListener('exhibit-engine-changed',()=>{if(this.active)this.bindMap();});
    window.addEventListener('pagehide',event=>{if(this.route){this.repository.draft(this.route);this.saveNow();}this.pause();this.cancelRoads();if(!event.persisted)this.adapter?.destroy();});
    window.addEventListener('pageshow',event=>{if(event.persisted&&this.active){this.app.map.map?.resize?.();this.adapter?.setRoute(this.route,this.showAll?[...this.routes.values()]:[]);this.updatePlayer();this.scheduleRoads();}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    if(new URLSearchParams(location.search).get('study')==='1')this.open();
  }

  async open() {
    if(this.active||this.opening)return;
    this.opening=true;
    try {
      if(!this.storageReady){await this.repository.open();this.storageReady=true;}
      const saved=await this.repository.all();
      this.routes=new Map(saved.map(route=>[route.route_id,StudyRoutes.reconcile(StudyRoutes.normalize(route,this.byId),this.byId)]));
      // A compact synchronous draft protects the latest order during navigation.
      for(let index=0;index<localStorage.length;index++){
        const key=localStorage.key(index);if(!key.startsWith('kanglian-study-draft:'))continue;
        try{const draft=JSON.parse(localStorage.getItem(key)),stored=this.routes.get(draft.route_id);if(!stored||draft.updated_at>stored.updated_at)this.routes.set(draft.route_id,StudyRoutes.normalize(draft,this.byId));}catch{}
      }
      const requested=new URLSearchParams(location.search).get('route')||localStorage.getItem('kanglian-study-active');
      this.route=this.routes.get(requested)||[...this.routes.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0]||StudyRoutes.createRoute();
      StudyRoutes.reconcile(this.route,this.byId);this.routes.set(this.route.route_id,this.route);
      this.active=true;this.mount();this.bindMap();this.render();this.persistSoon();
      this.linkNavigation();this.updateURL();this.scheduleRoads();
    } catch(error) {this.app.notify('路线工作台暂时无法打开，浏览器存储可能被禁用。'+error.message);}
    finally {this.opening=false;}
  }

  mount() {
    document.body.classList.add('study-editing');
    this.toolbar=document.createElement('section');this.toolbar.className='study-toolbar';
    this.toolbar.innerHTML='<div><h1>研学路线工作台</h1><span>全台账自由选点 · 跨省区串联</span></div><div class="study-toolbar-actions"><button data-study-action="new">＋ 新建</button><button data-study-action="manage">我的路线</button><button data-study-action="copy">复制</button><button data-study-action="save" class="study-primary">保存路线</button><button data-study-action="export">导出</button><button data-study-action="exit">退出编辑</button></div>';
    document.querySelector('.ex-header').after(this.toolbar);
    this.left=document.createElement('aside');this.left.className='study-library study-panel';
    this.left.innerHTML=`<div class="study-panel-heading"><h2>地点资源库</h2><span id="studyLibraryCount"></span></div><label class="study-search"><span>⌕</span><input id="studySearch" type="search" placeholder="搜索遗址、地址、村屯、人物" aria-label="全部991条地点检索"></label><div class="study-filter-grid"><select id="studyProvince" aria-label="路线地点省份"></select><select id="studyCity" aria-label="路线地点城市"></select><select id="studyCounty" aria-label="路线地点区县"></select><select id="studyKind" aria-label="路线地点类别"></select><select id="studyGrade" aria-label="路线定位等级"><option value="">全部定位等级</option>${['村屯级','乡镇级','区县级','待定位'].map(value=>`<option>${value}</option>`).join('')}</select><select id="studyImage" aria-label="图片筛选"><option value="">全部影像状态</option><option value="yes">有核验图片</option><option value="no">无核验图片</option></select><select id="studyVr" aria-label="VR筛选"><option value="">全部VR状态</option><option value="yes">有VR资源</option><option value="no">无VR资源</option></select><select id="studyPerson" aria-label="相关历史人物"></select><button data-study-action="reset-filters">重置筛选</button></div><div class="study-batch"><button data-study-action="add-filtered" class="study-primary">加入筛选结果</button><button data-study-action="add-available">全部可用地点加入</button><button data-study-action="check-filtered">筛选结果全选</button><button data-study-action="add-checked">加入勾选 <span id="studyCheckedCount">0</span></button></div><div class="study-scope-actions"><button data-study-action="add-province">当前省区全部</button><button data-study-action="add-city">当前城市全部</button><button data-study-action="add-county">当前区县全部</button></div><p class="study-insertion" id="studyInsertion" hidden></p><div id="studyLibraryList" class="study-virtual" aria-label="路线地点虚拟列表"></div><p class="study-source-note">991条来源记录完整保留。同名地点按来源ID区分。参考位置精度以每条记录的标注为准。</p>`;
    this.right=document.createElement('aside');this.right.className='study-nodes study-panel';
    this.right.innerHTML='<div class="study-panel-heading"><h2>当前研学路线</h2><span id="studySaveStatus" role="status">正在保存</span></div><label class="study-name-label">路线名称<input id="studyRouteName" maxlength="120" aria-label="路线名称"></label><details class="study-route-description"><summary>路线简介与主题</summary><textarea id="studyRouteDescription" maxlength="5000" aria-label="路线简介" placeholder="记录研学目标、资料依据与参访安排"></textarea><input id="studyRouteTheme" maxlength="120" aria-label="路线主题" placeholder="研学主题"></details><div class="study-route-options"><select id="studyRouteType" aria-label="路线绘制方式"><option value="road">道路优先，失败保留示意线</option><option value="schematic">研学示意连接线</option></select><button data-study-action="roads" id="studyRoadButton">暂停道路规划</button></div><div id="studyRouteStats" class="study-route-stats"></div><div class="study-order-tools"><strong id="studyStopCount"></strong><button data-study-action="suggest">智能排序建议</button><button data-study-action="clear">清空节点</button></div><select id="studyChapter" aria-label="路线章节"></select><div id="studyNodeList" class="study-virtual study-stop-list" aria-label="可排序的路线节点列表"></div><div id="studyRoadStatus" class="study-road-status" role="status"></div>';
    const layout=document.querySelector('.ex-layout');layout.prepend(this.left);layout.append(this.right);
    this.mapTools=document.createElement('div');this.mapTools.className='study-map-controls';this.mapTools.innerHTML='<button data-study-action="fit">⌖ 适配当前路线</button><button data-study-action="show-all" id="studyShowAll">显示全部路线</button><button data-study-action="archive-close" id="studyCloseArchive" hidden>关闭档案</button>';
    this.archive=document.createElement('article');this.archive.className='study-archive glass';this.archive.hidden=true;this.archive.setAttribute('aria-live','polite');
    this.player=document.createElement('div');this.player.className='study-player';this.player.innerHTML='<button data-study-action="previous" aria-label="上一站">◀</button><button data-study-action="play" id="studyPlay">▶ 播放路线</button><button data-study-action="next" aria-label="下一站">▶</button><span id="studyPlayPosition">尚未添加节点</span><select id="studyPlayInterval" aria-label="每站停留时间"><option value="5000">每站5秒</option><option value="8000">每站8秒</option><option value="2000">每站2秒</option></select>';
    this.legend=document.createElement('div');this.legend.className='study-map-legend';this.legend.innerHTML='<span class="village">● 村屯级</span><span class="town">● 乡镇级</span><span class="county">● 区县参考</span><span>实线 道路 · 虚线 示意</span>';
    document.querySelector('.ex-map').append(this.mapTools,this.archive,this.player,this.legend);
    this.abort=new AbortController();const options={signal:this.abort.signal};
    for(const host of [this.toolbar,this.left,this.right,this.mapTools,this.player,this.archive])host.addEventListener('click',event=>this.handleClick(event),options);
    document.querySelector('.map-tools').addEventListener('click',()=>this.pause(),{...options,capture:true});
    for(const [id,key] of [['studySearch','query'],['studyProvince','province'],['studyCity','city'],['studyCounty','county'],['studyKind','kind'],['studyGrade','grade'],['studyImage','image'],['studyVr','vr'],['studyPerson','person']]){
      document.getElementById(id).addEventListener(key==='query'?'input':'change',event=>{
        this.filters[key]=event.target.value;
        if(key==='province'){this.filters.city='';this.filters.county='';}if(key==='city')this.filters.county='';
        clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.renderLibrary(true),key==='query'?100:0);
      },options);
    }
    for(const [id,key] of [['studyRouteName','route_name'],['studyRouteDescription','route_description'],['studyRouteTheme','route_theme']])document.getElementById(id).addEventListener('input',event=>{this.route[key]=event.target.value;this.commit(false);},options);
    document.getElementById('studyRouteType').addEventListener('change',event=>{this.route.route_type=event.target.value;this.roadPaused=false;this.commit();},options);
    document.getElementById('studyChapter').addEventListener('change',()=>this.renderNodes(true),options);
    this.bindVirtual(document.getElementById('studyLibraryList'),()=>this.drawLibrary());this.bindVirtual(document.getElementById('studyNodeList'),()=>this.drawNodes());
    this.bindSorting();
  }

  bindVirtual(container,render) {
    container.addEventListener('scroll',()=>{if(container.studyFrame)return;container.studyFrame=requestAnimationFrame(()=>{container.studyFrame=null;render();});},{signal:this.abort.signal});
    const observer=new ResizeObserver(render);observer.observe(container);(this.resizeObservers||=[]).push(observer);
  }

  bindMap() {
    this.adapter?.destroy();
    this.adapter=new StudyRouteMap(this.app.map,this.catalog,{archive:id=>this.showArchive(id),choose:(items,title)=>this.choose(items,title),pause:()=>this.pause(),notify:message=>this.app.notify(message)});
    this.adapter.setRecords(this.matching());this.adapter.setRoute(this.route,this.showAll?[...this.routes.values()]:[]);
    requestAnimationFrame(()=>this.app.map.map?.resize?.());
  }

  matching() {
    const f=this.filters,words=f.query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return this.records.filter(record=>(!f.province||record.province===f.province)&&(!f.city||record.city===f.city)&&(!f.county||record.county===f.county)&&(!f.kind||record.kind===f.kind)&&(!f.grade||record.routeLocation.grade===f.grade)&&(!f.image||Boolean(record.image)===(f.image==='yes'))&&(!f.vr||Boolean(record.vrUrl)===(f.vr==='yes'))&&(!f.person||record.people.includes(f.person))&&words.every(word=>record.search.includes(word)));
  }

  selectOptions(id,values,label,current) {
    const select=document.getElementById(id);const signature=JSON.stringify(values);
    if(select.dataset.signature!==signature){select.innerHTML=`<option value="">${label}</option>`+values.map(value=>`<option value="${this.escape(value)}">${this.escape(value==='内蒙古'?'内蒙古东部':value)}</option>`).join('');select.dataset.signature=signature;}
    select.value=current||'';
  }

  renderLibrary(reset=false) {
    const sorted=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const provinceRows=this.records.filter(record=>!this.filters.province||record.province===this.filters.province),cityRows=provinceRows.filter(record=>!this.filters.city||record.city===this.filters.city);
    this.selectOptions('studyProvince',sorted(this.records.map(record=>record.province)),'全部省区',this.filters.province);
    this.selectOptions('studyCity',sorted(provinceRows.map(record=>record.city)),'全部城市',this.filters.city);
    this.selectOptions('studyCounty',sorted(cityRows.map(record=>record.county)),'全部区县',this.filters.county);
    this.selectOptions('studyKind',sorted(this.records.map(record=>record.kind)),'全部遗址类型',this.filters.kind);
    this.selectOptions('studyPerson',sorted(this.records.flatMap(record=>record.people)),'全部人物',this.filters.person);
    document.getElementById('studySearch').value=this.filters.query;document.getElementById('studyGrade').value=this.filters.grade;document.getElementById('studyImage').value=this.filters.image;document.getElementById('studyVr').value=this.filters.vr;
    this.libraryRows=this.matching();document.getElementById('studyLibraryCount').textContent=`${this.libraryRows.length} / 991 条`;
    document.getElementById('studyCheckedCount').textContent=this.checked.size;
    for(const key of ['province','city','county'])this.left.querySelector(`[data-study-action="add-${key}"]`).disabled=key!=='province'&&!this.filters[key];
    const province=this.filters.province||this.app.store.database.metadata.name;
    this.left.querySelector('[data-study-action="add-province"]').textContent=(province==='内蒙古'?'蒙东':province)+'全部';
    if(reset)document.getElementById('studyLibraryList').scrollTop=0;
    this.drawLibrary();this.adapter?.setRecords(this.libraryRows);
    const insertion=document.getElementById('studyInsertion');insertion.hidden=!this.insertion;
    insertion.innerHTML=this.insertion?`选择一个地点${this.insertion.type==='replace'?'替换':'插入'}第 ${this.insertion.index+1} 站 <button data-study-action="cancel-insertion">取消</button>`:'';
  }

  virtualHTML(container,rows,height,render) {
    container.scrollTop=Math.min(container.scrollTop,Math.max(0,rows.length*height-container.clientHeight));
    const first=Math.max(0,Math.floor(container.scrollTop/height)-2),end=Math.min(rows.length,first+Math.ceil((container.clientHeight||450)/height)+5);
    container.innerHTML=rows.length?`<div style="height:${first*height}px" aria-hidden="true"></div>`+rows.slice(first,end).map(render).join('')+`<div style="height:${(rows.length-end)*height}px" aria-hidden="true"></div>`:'<p class="study-empty">当前没有匹配的地点。</p>';
  }

  drawLibrary() {
    if(!this.active||!this.left)return;
    const selected=new Set(this.route.stop_ids),escape=this.escape;
    this.virtualHTML(document.getElementById('studyLibraryList'),this.libraryRows||[],100,record=>`<article class="study-place ${selected.has(record.id)?'added':''}" data-library-id="${escape(record.id)}"><input type="checkbox" data-study-check="${escape(record.id)}" aria-label="勾选${escape(record.name)}" ${this.checked.has(record.id)?'checked':''}><button class="study-place-info" data-study-archive="${escape(record.id)}"><strong>${escape(record.name)}</strong><small>${escape([record.province==='内蒙古'?'内蒙古东部':record.province,record.city,record.county].filter(Boolean).join(' · '))}</small><span>${escape(record.kind)} <em data-precision="${record.routeLocation.grade}">${record.routeLocation.grade}</em></span><small>${record.source===0?'总台账':'市县台账'} · 第${record.row}行</small></button><button class="study-add" data-study-add="${escape(record.id)}" aria-label="添加${escape(record.name)}" ${selected.has(record.id)&&!this.insertion?'disabled':''}>${this.insertion?'选用':selected.has(record.id)?'✓':'＋'}</button></article>`);
  }

  nodeRows() {
    const chapter=document.getElementById('studyChapter').value;
    return this.route.stop_ids.map((id,index)=>({id,index,record:this.byId.get(id)})).filter(item=>!chapter||(chapter.startsWith('province:')?item.record?.province===chapter.slice(9):(item.record?.province+'|'+item.record?.city)===chapter));
  }

  renderNodes(reset=false) {
    const select=document.getElementById('studyChapter'),previous=select.value,chapters=new Map();
    this.route.stop_ids.forEach(id=>{const record=this.byId.get(id);if(record){const key=record.province+'|'+record.city;chapters.set(key,(chapters.get(key)||0)+1);}});
    const provinces=new Map();for(const [key,count] of chapters){const name=key.split('|')[0];provinces.set(name,(provinces.get(name)||0)+count);}
    select.innerHTML='<option value="">全部路线章节</option><optgroup label="按省区">'+[...provinces].map(([name,count])=>`<option value="province:${this.escape(name)}">${this.escape(name==='内蒙古'?'内蒙古东部':name)} · ${count}站</option>`).join('')+'</optgroup><optgroup label="按城市章节">'+[...chapters].map(([key,count])=>`<option value="${this.escape(key)}">${this.escape(key.replace('|',' · '))} · ${count}站</option>`).join('')+'</optgroup>';
    select.value=chapters.has(previous)||(previous.startsWith('province:')&&provinces.has(previous.slice(9)))?previous:'';
    if(reset)document.getElementById('studyNodeList').scrollTop=0;
    document.getElementById('studyStopCount').textContent=`${this.route.stop_ids.length} 个节点`;
    this.drawNodes();this.renderStats();
  }

  drawNodes() {
    if(!this.active||!this.right)return;
    const escape=this.escape;
    this.virtualHTML(document.getElementById('studyNodeList'),this.nodeRows(),156,({id,index,record})=>`<article class="study-stop ${id===this.selectedId?'active':''}" draggable="true" data-stop-index="${index}" data-stop-id="${escape(id)}"><div class="study-stop-heading"><span class="study-drag-handle" aria-label="拖动调整顺序" tabindex="0">⠿</span><b>${index+1}</b><strong>${escape(record?.name||'来源记录暂不可用')}</strong><button data-study-remove="${escape(id)}" aria-label="删除第${index+1}站">×</button></div><small>${escape([record?.province,record?.city,record?.county].filter(Boolean).join(' · '))}</small><p>${escape(record?.background_warning?'原台账简介存在资料差异，查看档案核验依据。':record?.background?.slice(0,75)||'历史简介待补充')}</p><div class="study-stop-badges"><span data-precision="${record?.routeLocation.grade||'待定位'}">${record?.routeLocation.grade||'待定位'}</span>${record?.image?'<span>图片</span>':''}${record?.vrUrl?'<span>VR</span>':''}</div><div class="study-stop-actions"><button data-study-focus="${escape(id)}">定位</button><button data-study-archive="${escape(id)}">档案</button><button data-study-move="${index}" data-direction="-1" aria-label="第${index+1}站上移">↑</button><button data-study-move="${index}" data-direction="1" aria-label="第${index+1}站下移">↓</button><button data-study-insert="${index}">插入</button><button data-study-replace="${index}">替换</button><button data-study-position="${index}" aria-label="指定第${index+1}站顺序">序号</button></div></article>`);
  }

  render() {
    document.getElementById('studyRouteName').value=this.route.route_name;
    document.getElementById('studyRouteDescription').value=this.route.route_description;
    document.getElementById('studyRouteTheme').value=this.route.route_theme;
    document.getElementById('studyRouteType').value=this.route.route_type;
    this.renderLibrary();this.renderNodes();this.updatePlayer();
  }

  renderStats() {
    const stats=StudyRoutes.statistics(this.route,this.byId);
    const minutes=Math.round(stats.roadDuration/60);
    const duration=minutes>=60?Math.floor(minutes/60)+'小时'+(minutes%60?minutes%60+'分钟':''):minutes+'分钟';
    document.getElementById('studyRouteStats').innerHTML=`<div><b>${stats.provinces}</b><span>省区</span></div><div><b>${stats.cities}</b><span>城市</span></div><div><b>${stats.pictures}</b><span>图片记录</span></div><div><b>${stats.vr}</b><span>VR记录</span></div><p>村屯 ${stats.grades.村屯级} · 乡镇 ${stats.grades.乡镇级} · 区县 ${stats.grades.区县级} · 待定位 ${stats.grades.待定位}</p><p>道路 ${stats.roadSegments} 段${stats.roadSegments?' / '+(stats.roadDistance/1000).toFixed(1)+' km':''} · 示意 ${stats.schematicSegments} 段${stats.schematicSegments?' / '+(stats.schematicDistance/1000).toFixed(1)+' km':''}</p>${stats.geometryDistance!==null?`<p>已绘制总长 ${(stats.geometryDistance/1000).toFixed(1)} km${stats.schematicSegments?'（含示意直线）':''}${stats.unavailable?'，位置缺失段未计入':''}</p>`:''}${stats.roadSegments?`<p>已规划道路段预计 ${duration}${stats.schematicSegments||stats.unavailable?'，其余路段时间待确认':''}</p>`:''}${stats.unavailable?`<p>位置缺失 ${stats.unavailable} 段，地图保留断点。</p>`:''}`;
    document.getElementById('studyRoadButton').textContent=this.roadPaused?'重试道路规划':'暂停道路规划';
    document.getElementById('studyRoadButton').disabled=this.route.route_type!=='road';
  }

  add(ids) {
    if(this.insertion){
      if(ids.length>1){this.app.notify('当前正在选择插入或替换节点，请选择一个地点，或先取消插入模式。');return;}
      const id=ids[0];if(!id)return;
      if(this.route.stop_ids.includes(id)&&!(this.insertion.type==='replace'&&this.route.stop_ids[this.insertion.index]===id)){this.app.notify('该来源记录已在路线中，可直接调整它的顺序。');return;}
      this.route.stop_ids.splice(this.insertion.index,this.insertion.type==='replace'?1:0,id);this.insertion=null;
    }else{
      const existing=new Set(this.route.stop_ids);this.route.stop_ids.push(...ids.filter(id=>this.byId.has(id)&&!existing.has(id)&&existing.add(id)));
    }
    this.commit();this.adapter.fit();this.app.notify(`当前路线共 ${this.route.stop_ids.length} 个节点，顺序已更新。`);
  }

  move(from,to) {
    if(from===to||from<0||to<0||from>=this.route.stop_ids.length||to>=this.route.stop_ids.length)return;
    const [id]=this.route.stop_ids.splice(from,1);this.route.stop_ids.splice(to,0,id);this.commit();
  }

  commit(nodesChanged=true) {
    if(nodesChanged){this.pause();this.cancelRoads();StudyRoutes.reconcile(this.route,this.byId);this.renderLibrary();this.renderNodes();this.adapter?.setRoute(this.route,this.showAll?[...this.routes.values()]:[]);if(!this.archive.hidden&&this.selectedId)this.showArchive(this.selectedId,false,true);this.scheduleRoads();}
    StudyRoutes.touch(this.route);this.routes.set(this.route.route_id,this.route);this.persistSoon();this.updatePlayer();this.updateURL();this.linkNavigation();
  }

  persistSoon() {
    this.repository.draft(this.route);document.getElementById('studySaveStatus').textContent='保存中';
    clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.saveNow(),220);
  }

  async saveNow() {
    clearTimeout(this.saveTimer);if(!this.route)return;
    const snapshot=StudyRoutes.clone(this.route);
    const task=async()=>{
      try{
        const saved=await this.repository.save(snapshot);
        if(this.route?.route_id===saved.route_id){this.route.revision=saved.revision;if(this.active&&this.route.updated_at===saved.updated_at)document.getElementById('studySaveStatus').textContent='已自动保存';}
        if(this.routes.get(saved.route_id)?.updated_at===saved.updated_at)this.routes.set(saved.route_id,{...saved});
        this.lastSaveError=null;
      }catch(error){
        if(error.message==='ROUTE_CONFLICT'||error.message==='ROUTE_DELETED'){
          const originalId=snapshot.route_id;
          snapshot.route_id=StudyRoutes.uuid();snapshot.route_name+='（并行编辑保留副本）';snapshot.revision=0;
          const copy=await this.repository.save(snapshot);this.routes.set(copy.route_id,copy);
          if(this.route?.route_id===originalId){this.route=copy;this.updateURL();this.linkNavigation();}
          this.app.notify('另一页面更新或删除了原路线，本次内容已保留为独立副本。');
        }else{this.lastSaveError=error;this.app.notify('路线保存失败，草稿已尽可能保留，请导出GeoJSON留存。');if(this.active)document.getElementById('studySaveStatus').textContent='保存失败';}
      }
    };
    this.persistChain=this.persistChain.then(task,task);await this.persistChain;
  }

  async chooseRoute(id) {
    await this.saveNow();this.pause();this.cancelRoads();this.roadPaused=false;this.insertion=null;
    this.route=StudyRoutes.reconcile(StudyRoutes.normalize(this.routes.get(id),this.byId),this.byId);
    this.routes.set(id,this.route);this.playIndex=0;this.archive.hidden=true;this.selectedId=null;this.adapter.selectedId=null;this.showAll=false;
    document.getElementById('studyShowAll').classList.remove('active');document.getElementById('studyCloseArchive').hidden=true;document.getElementById('locationContext').hidden=true;
    this.render();this.adapter.setRoute(this.route,[]);if(this.route.stop_ids.some(id=>StudyRoutes.point(this.byId.get(id))))this.adapter.fit();this.updateURL();this.linkNavigation();this.scheduleRoads();this.repository.draft(this.route);
  }

  updateURL() {
    const url=new URL(location.href);url.searchParams.set('study','1');url.searchParams.set('route',this.route.route_id);history.replaceState(null,'',url);
  }

  linkNavigation() {
    this.navigation ||=new Map([...document.querySelectorAll('.ex-header nav a')].map(link=>[link,link.getAttribute('href')]));
    for(const [link,original] of this.navigation){if(original==='index.html')continue;const url=new URL(original,location.href);url.searchParams.set('study','1');url.searchParams.set('route',this.route.route_id);if(this.app.map.baseMode==='local')url.searchParams.set('flat','1');link.href=url.href;}
  }

  showArchive(id,focus=false,fromPlayer=false) {
    const record=this.byId.get(id);if(!record){this.app.notify('当前台账暂未收录该来源ID，路线节点已保留，可替换或删除。');return;}
    const index=this.route.stop_ids.indexOf(id);
    if(!fromPlayer){this.pause();if(index>=0){this.playIndex=index;this.updatePlayer();}}
    this.selectedId=id;this.adapter.selectedId=id;this.adapter.updatePins();this.drawNodes();
    const photo=HeritageImages.get(record);
    this.archive.hidden=false;document.getElementById('studyCloseArchive').hidden=false;
    this.archive.innerHTML=`<button class="study-archive-close" data-study-action="archive-close" aria-label="关闭路线节点档案">×</button><small>${index>=0?'路线第 '+(index+1)+' 站 · ':''}${this.escape(record.province+' · '+record.city)}</small><h2>${this.escape(record.name)}</h2>${photo?`<img data-image-asset="${this.escape(photo.key)}" src="${this.escape(photo.src)}" alt="${this.escape(photo.caption)}"><small>${this.escape(photo.caption)}</small>`:''}<div class="study-archive-location"><b>${record.routeLocation.grade}</b><p>${this.escape(record.routeLocation.basis)}</p><p>${this.escape(record.address)}</p></div><p>${this.escape(record.background_warning?'原台账简介与遗址对象存在差异，请打开数字档案阅读原文及核验依据。':record.background||'历史简介待补充')}</p><small>${this.escape(record.sheet)} · 第${record.row}行 · ${this.escape(record.id)}</small><div class="study-archive-actions"><button data-study-add="${this.escape(id)}" class="study-primary" ${index>=0&&!this.insertion?'disabled':''}>${this.insertion?'选用此地点':index>=0?'已加入当前路线':'加入当前路线'}</button><button data-study-focus="${this.escape(id)}">定位参考位置</button><a href="heritage.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">完整数字档案 ↗</a>${record.vrUrl?`<a href="${this.escape(record.vrUrl)}" target="_blank" rel="noopener">VR导览 ↗</a>`:''}</div>`;
    if(focus)this.adapter.focus(id);
  }

  choose(items,title) {
    this.pause();
    this.app.dialog(`<h2>${this.escape(title)}</h2><p>按来源身份选择地点。列表采用分页展示。</p><input id="studyChoiceSearch" aria-label="聚合地点搜索" placeholder="筛选当前聚合记录"><div id="studyChoiceList"></div><div class="study-choice-pages"><button id="studyChoicePrev">上一页</button><span id="studyChoicePage"></span><button id="studyChoiceNext">下一页</button></div>`);
    let page=0;const render=()=>{
      const query=document.getElementById('studyChoiceSearch').value;const rows=items.filter(item=>item.label.includes(query)),pages=Math.max(1,Math.ceil(rows.length/15));page=Math.max(0,Math.min(page,pages-1));
      document.getElementById('studyChoiceList').innerHTML=rows.slice(page*15,page*15+15).map(item=>`<button class="cluster-item" data-study-choice="${this.escape(item.id)}">${this.escape(item.label)}</button>`).join('');
      document.getElementById('studyChoicePage').textContent=`${page+1} / ${pages}`;document.getElementById('studyChoicePrev').disabled=page===0;document.getElementById('studyChoiceNext').disabled=page===pages-1;
      document.querySelectorAll('[data-study-choice]').forEach(button=>button.onclick=()=>{document.getElementById('exDialog').close();this.showArchive(button.dataset.studyChoice);});
    };
    document.getElementById('studyChoiceSearch').oninput=()=>{page=0;render();};document.getElementById('studyChoicePrev').onclick=()=>{page--;render();};document.getElementById('studyChoiceNext').onclick=()=>{page++;render();};render();
  }

  async manage() {
    await this.saveNow();
    this.app.dialog(`<h2>我的研学路线</h2><p>路线保存在当前浏览器，可在四省区地图间恢复编辑。</p><div id="studyManagerList"></div><button id="studyManagerNew" class="gold-action">＋ 新建路线</button><h3>已有研学建议</h3><p>将现有研学建议载入工作台，继续自由增删和排序。</p><div class="study-template-list">${MUSEUM.routes.map(route=>`<button class="detail-vr" data-study-template="${this.escape(route.id)}">${this.escape(route.name)}</button>`).join('')}</div>`);
    const render=()=>{
      document.getElementById('studyManagerList').innerHTML=[...this.routes.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(route=>`<section class="study-manager-row"><div><h3>${this.escape(route.route_name)}</h3><small>${route.stop_ids.length}站 · ${this.escape(route.province_scope.join(' / '))} · ${this.escape(new Date(route.updated_at).toLocaleString())}</small></div><button data-open-route="${route.route_id}">恢复编辑</button><button data-preview-route="${route.route_id}">预览</button><button data-copy-route="${route.route_id}">复制</button><button data-delete-route="${route.route_id}">删除</button></section>`).join('');
      document.querySelectorAll('[data-open-route]').forEach(button=>button.onclick=async()=>{await this.chooseRoute(button.dataset.openRoute);document.getElementById('exDialog').close();});
      document.querySelectorAll('[data-preview-route]').forEach(button=>button.onclick=async()=>{await this.chooseRoute(button.dataset.previewRoute);document.getElementById('exDialog').close();this.adapter.fit();});
      document.querySelectorAll('[data-copy-route]').forEach(button=>button.onclick=async()=>{await this.copyRoute(button.dataset.copyRoute);document.getElementById('exDialog').close();});
      document.querySelectorAll('[data-delete-route]').forEach(button=>button.onclick=()=>{
        const route=this.routes.get(button.dataset.deleteRoute);
        this.confirm(`删除“${route.route_name}”？`,'删除后可通过先前导出的GeoJSON重新导入。',async()=>{
          this.pause();this.cancelRoads();clearTimeout(this.saveTimer);await this.persistChain;await this.repository.remove(route.route_id);this.routes.delete(route.route_id);
          if(this.route.route_id===route.route_id){this.route=[...this.routes.values()][0]||StudyRoutes.createRoute();this.routes.set(this.route.route_id,this.route);await this.chooseRoute(this.route.route_id);this.persistSoon();}
          this.manage();
        });
      });
    };
    document.getElementById('studyManagerNew').onclick=async()=>{await this.newRoute();document.getElementById('exDialog').close();};
    document.querySelectorAll('[data-study-template]').forEach(button=>button.onclick=async()=>{
      const preset=MUSEUM.routes.find(route=>route.id===button.dataset.studyTemplate),route=StudyRoutes.createRoute(preset.name);
      route.route_description=preset.description;route.route_theme=preset.question||'';
      route.stop_ids=preset.stops.map(key=>MUSEUM.featured.find(record=>record.key===key)?.id).filter(id=>this.byId.has(id));
      this.routes.set(route.route_id,route);await this.chooseRoute(route.route_id);this.commit();document.getElementById('exDialog').close();
    });render();
  }

  confirm(title,description,action) {
    this.app.dialog(`<h2>${this.escape(title)}</h2><p>${this.escape(description)}</p><button id="studyConfirmAction" class="gold-action">确认</button><button id="studyCancelAction" class="detail-vr">取消</button>`);
    document.getElementById('studyConfirmAction').onclick=async()=>{document.getElementById('exDialog').close();await action();};document.getElementById('studyCancelAction').onclick=()=>document.getElementById('exDialog').close();
  }

  async newRoute() {
    await this.saveNow();const route=StudyRoutes.createRoute('我的研学路线 '+(this.routes.size+1));this.routes.set(route.route_id,route);await this.chooseRoute(route.route_id);this.persistSoon();
  }

  async copyRoute(id=this.route.route_id) {
    await this.saveNow();const route=StudyRoutes.clone(this.routes.get(id));route.route_id=StudyRoutes.uuid();route.route_name+='（副本）';route.created_at=new Date().toISOString();route.updated_at=route.created_at;route.revision=0;delete route.writer_id;this.routes.set(route.route_id,route);await this.chooseRoute(route.route_id);this.persistSoon();
  }

  suggest() {
    if(this.route.stop_ids.length<2){this.app.notify('至少添加两个节点后再生成排序建议。');return;}
    this.pause();this.app.dialog('<h2>智能排序建议</h2><p>先查看建议，再决定是否应用。距离排序依据参考坐标，年份排序取原简介中明确出现的最早抗战年份。未提供年份的节点保留相对顺序置后。</p><select id="studySuggestType"><option value="province">按省区分组</option><option value="city">按城市分组</option><option value="distance">参考位置就近串联</option><option value="year">按台账明确年份</option></select><div id="studySuggestPreview"></div><button id="studyApplySuggestion" class="gold-action">应用当前建议</button>');
    let suggestion;const baseOrder=this.route.stop_ids.join('|');
    const update=()=>{suggestion=StudyRoutes.suggest(this.route,this.byId,document.getElementById('studySuggestType').value);document.getElementById('studySuggestPreview').innerHTML='<ol>'+suggestion.slice(0,20).map(id=>`<li>${this.escape(this.byId.get(id)?.name||id)}</li>`).join('')+'</ol>'+`<p>共 ${suggestion.length} 站，预览前 ${Math.min(20,suggestion.length)} 站。</p>`;};
    document.getElementById('studySuggestType').onchange=update;document.getElementById('studyApplySuggestion').onclick=()=>{if(this.route.stop_ids.join('|')!==baseOrder){this.app.notify('路线顺序已经变化，请重新生成建议。');return;}this.route.stop_ids=suggestion;this.commit();document.getElementById('exDialog').close();this.adapter.fit();};update();
  }

  bindSorting() {
    const list=document.getElementById('studyNodeList'),options={signal:this.abort.signal};
    list.addEventListener('dragstart',event=>{const row=event.target.closest('[data-stop-index]');if(!row)return;this.dragIndex=Number(row.dataset.stopIndex);event.dataTransfer.setData('text/plain',String(this.dragIndex));event.dataTransfer.effectAllowed='move';row.classList.add('dragging');this.pause();},options);
    list.addEventListener('dragover',event=>{event.preventDefault();const row=event.target.closest('[data-stop-index]');list.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));row?.classList.add('drop-target');const bounds=list.getBoundingClientRect();if(event.clientY<bounds.top+35)list.scrollTop-=18;else if(event.clientY>bounds.bottom-35)list.scrollTop+=18;},options);
    list.addEventListener('drop',event=>{event.preventDefault();const row=event.target.closest('[data-stop-index]');if(row&&this.dragIndex!==undefined)this.move(this.dragIndex,Number(row.dataset.stopIndex));this.dragIndex=undefined;},options);
    list.addEventListener('dragend',()=>{this.dragIndex=undefined;list.querySelectorAll('.dragging,.drop-target').forEach(item=>item.classList.remove('dragging','drop-target'));},options);
    list.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'||!event.target.closest('.study-drag-handle'))return;event.preventDefault();this.touchDrag={from:Number(event.target.closest('[data-stop-index]').dataset.stopIndex),to:null};event.target.setPointerCapture(event.pointerId);this.pause();},options);
    list.addEventListener('pointermove',event=>{if(!this.touchDrag)return;const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-stop-index]');if(row)this.touchDrag.to=Number(row.dataset.stopIndex);const box=list.getBoundingClientRect();if(event.clientY<box.top+35)list.scrollTop-=14;if(event.clientY>box.bottom-35)list.scrollTop+=14;},options);
    list.addEventListener('pointerup',()=>{if(this.touchDrag&&this.touchDrag.to!==null)this.move(this.touchDrag.from,this.touchDrag.to);this.touchDrag=null;},options);
    list.addEventListener('pointercancel',()=>{this.touchDrag=null;},options);
  }

  cancelRoads() {clearTimeout(this.roadTimer);this.planningToken++;this.roadAbort?.abort();this.planning=false;}

  scheduleRoads() {
    clearTimeout(this.roadTimer);
    if(this.route.route_type!=='road'||this.roadPaused||!this.active){document.getElementById('studyRoadStatus').textContent=this.route.route_type==='schematic'?'当前采用研学示意连线，距离按参考位置直线几何计算。':'道路规划已暂停，示意连线与节点顺序完整保留。';return;}
    this.roadTimer=setTimeout(()=>this.planRoads(),650);
  }

  async planRoads() {
    const token=++this.planningToken,routeId=this.route.route_id;this.planning=true;
    const candidates=this.route.route_segments.filter(segment=>segment.geometry&&segment.status!=='road');let completed=0;
    for(const original of candidates){
      if(!this.active||token!==this.planningToken||this.route.route_id!==routeId)break;
      const target=this.route.route_segments.find(item=>item.key===original.key&&item.fingerprint===original.fingerprint);if(!target)continue;
      const [start,end]=[StudyRoutes.point(this.byId.get(target.from_id)),StudyRoutes.point(this.byId.get(target.to_id))];
      completed++;
      if(StudyRoutes.coordinateKey(start)===StudyRoutes.coordinateKey(end)){target.note='两个节点共用区域参考位置，保留来源顺序';continue;}
      document.getElementById('studyRoadStatus').textContent=`正在逐段规划 ${completed} / ${candidates.length}，地图已同步显示可用连线。`;
      try{
        const cacheKey='osrm-v1|'+target.fingerprint;
        let result=await this.repository.cached(cacheKey);
        if(token!==this.planningToken)break;
        if(!result||Date.now()-result.cached_at>(result.status==='road'?604800000:86400000)){
          this.roadAbort=new AbortController();const timer=setTimeout(()=>this.roadAbort?.abort(),18000);
          try{const response=await fetch('/api/study-route?'+new URLSearchParams({from:start.join(','),to:end.join(',')}),{signal:this.roadAbort.signal});if(!response.ok)throw new Error('道路服务暂不可用');result=await response.json();}
          finally{clearTimeout(timer);}
          if(token!==this.planningToken)break;
          if(result.status==='road'||result.status==='no_road')await this.repository.cache(cacheKey,result);
        }
        if(token!==this.planningToken||this.route.route_id!==routeId)break;
        if(result.status==='service_unavailable')throw new Error(result.reason);
        if(result.status==='road'&&StudyRoutes.validLine(result.geometry)&&Number.isFinite(result.distance_m)&&result.distance_m>=0&&Number.isFinite(result.duration_s)&&result.duration_s>=0)Object.assign(target,{status:'road',geometry:result.geometry,distance_m:result.distance_m,duration_s:result.duration_s,provider:result.provider,source:result.source,note:'道路服务连接参考位置，实地入口需结合参访资料确认'});
        else target.note='暂无可用道路数据，保留研学示意连线';
        StudyRoutes.reconcile(this.route,this.byId);StudyRoutes.touch(this.route);this.routes.set(routeId,this.route);this.persistSoon();this.renderStats();this.adapter.setRoute(this.route,this.showAll?[...this.routes.values()]:[]);
      }catch(error){
        if(token!==this.planningToken)break;
        this.roadPaused=true;document.getElementById('studyRoadStatus').textContent='道路服务暂不可用，已保留全部示意连线。可稍后重试，或配置可用OSRM服务。';this.renderStats();this.planning=false;return;
      }
    }
    if(token===this.planningToken){this.planning=false;document.getElementById('studyRoadStatus').textContent='逐段规划已完成。实线为道路，虚线为示意，缺少位置的节点保留断点。';}
  }

  pause() {clearTimeout(this.playTimer);this.playing=false;if(this.active&&this.player)this.updatePlayer();}
  updatePlayer() {
    if(!this.player)return;document.getElementById('studyPlay').textContent=this.playing?'Ⅱ 暂停':'▶ '+(this.playIndex?'继续播放':'播放路线');
    document.getElementById('studyPlayPosition').textContent=this.route.stop_ids.length?`${Math.min(this.playIndex+1,this.route.stop_ids.length)} / ${this.route.stop_ids.length} 站`:'尚未添加节点';
  }
  play() {
    if(this.playing){this.pause();return;}if(!this.route.stop_ids.length){this.app.notify('添加地点后即可播放路线。');return;}
    this.playing=true;if(this.playIndex>=this.route.stop_ids.length)this.playIndex=0;
    const step=()=>{
      if(!this.playing)return;const id=this.route.stop_ids[this.playIndex];this.showArchive(id,true,true);this.updatePlayer();
      this.playTimer=setTimeout(()=>{if(this.playIndex>=this.route.stop_ids.length-1){this.playIndex=0;this.pause();return;}this.playIndex++;step();},Number(document.getElementById('studyPlayInterval').value));
    };step();
  }
  jump(direction) {this.pause();this.playIndex=Math.max(0,Math.min(this.route.stop_ids.length-1,this.playIndex+direction));const id=this.route.stop_ids[this.playIndex];if(id)this.showArchive(id,true);this.updatePlayer();}

  exportMenu() {
    this.pause();this.app.dialog('<h2>导出研学路线</h2><p>导出保留来源ID、顺序和定位精度。村镇、区县参考位置用于研学规划。</p><div class="study-export-options"><button data-study-export="png">PNG路线地图</button><button data-study-export="geojson">GeoJSON</button><button data-study-export="gpx">GPX</button><button data-study-export="csv">CSV节点清单</button><button data-study-export="print">可打印路线介绍</button><button data-study-export="html">下载打印版HTML</button></div><p id="studyExportStatus" role="status"></p><label class="study-import">导入此前导出的GeoJSON<input id="studyImportFile" type="file" accept=".geojson,.json,application/geo+json,application/json"></label>');
    document.querySelectorAll('[data-study-export]').forEach(button=>button.onclick=async()=>{
      const kind=button.dataset.studyExport,name=StudyRouteExport.fileName(this.route),status=document.getElementById('studyExportStatus');status.textContent='正在生成文件…';
      const printWindow=kind==='print'?window.open('','_blank'):null;
      try{
        if(kind==='geojson')StudyRouteExport.download(JSON.stringify(StudyRouteExport.geojson(this.route,this.byId),null,2),name+'.geojson','application/geo+json');
        if(kind==='gpx')StudyRouteExport.download(StudyRouteExport.gpx(this.route,this.byId),name+'.gpx','application/gpx+xml');
        if(kind==='csv')StudyRouteExport.download(StudyRouteExport.csv(this.route,this.byId),name+'.csv','text/csv;charset=utf-8');
        if(['png','print','html'].includes(kind)){
          this.adapter.fit();await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion:reduce)').matches?120:1200));
          const image=await StudyRouteExport.png(this.route,this.byId,this.catalog,this.adapter);
          if(kind==='png'){const response=await fetch(image);StudyRouteExport.download(await response.blob(),name+'.png','image/png');}
          else{const html=StudyRouteExport.printable(this.route,this.byId,image);if(kind==='html'||!printWindow)StudyRouteExport.download(html,name+'-路线介绍.html','text/html;charset=utf-8');else{printWindow.document.write(html);printWindow.document.close();printWindow.focus();}}
        }
        status.textContent='导出已生成。';
      }catch(error){printWindow?.close();status.textContent='导出失败，请重试。'+error.message;}
    });
    document.getElementById('studyImportFile').onchange=async event=>{
      try{const file=event.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.type!=='FeatureCollection'||!Array.isArray(data.properties?.stop_ids))throw new Error('请选择本工作台导出的GeoJSON');const route=StudyRoutes.createRoute(data.name||'导入路线');route.route_description=String(data.properties.description||'');route.route_theme=String(data.properties.theme||'');route.stop_ids=[...new Set(data.properties.stop_ids.filter(id=>typeof id==='string'))];if(route.stop_ids.some(id=>!this.byId.has(id)))this.app.notify('部分来源ID未在当前台账找到，已作为待定位节点保留。');this.routes.set(route.route_id,route);await this.chooseRoute(route.route_id);this.commit();document.getElementById('exDialog').close();}catch(error){document.getElementById('studyExportStatus').textContent=error.message;}
    };
  }

  handleClick(event) {
    const target=event.target.closest('button,input');if(!target)return;
    if(target.dataset.studyCheck){if(target.checked)this.checked.add(target.dataset.studyCheck);else this.checked.delete(target.dataset.studyCheck);document.getElementById('studyCheckedCount').textContent=this.checked.size;return;}
    if(target.dataset.studyAdd){this.add([target.dataset.studyAdd]);if(!this.archive.hidden)this.showArchive(target.dataset.studyAdd);return;}
    if(target.dataset.studyArchive){this.showArchive(target.dataset.studyArchive);return;}
    if(target.dataset.studyFocus){this.showArchive(target.dataset.studyFocus,true);return;}
    if(target.dataset.studyRemove){this.route.stop_ids=this.route.stop_ids.filter(id=>id!==target.dataset.studyRemove);this.commit();return;}
    if(target.dataset.studyMove!==undefined){this.move(Number(target.dataset.studyMove),Number(target.dataset.studyMove)+Number(target.dataset.direction));return;}
    if(target.dataset.studyInsert!==undefined||target.dataset.studyReplace!==undefined){this.insertion={type:target.dataset.studyReplace!==undefined?'replace':'insert',index:Number(target.dataset.studyReplace??target.dataset.studyInsert)};this.renderLibrary();document.getElementById('studySearch').focus();return;}
    if(target.dataset.studyPosition!==undefined){const index=Number(target.dataset.studyPosition);this.app.dialog(`<h2>调整第${index+1}站的顺序</h2><label>移动到第 <input id="studyMovePosition" type="number" min="1" max="${this.route.stop_ids.length}" value="${index+1}"> 站</label><button id="studyMoveApply" class="gold-action">应用顺序</button>`);document.getElementById('studyMoveApply').onclick=()=>{this.move(index,Math.max(0,Math.min(this.route.stop_ids.length-1,Number(document.getElementById('studyMovePosition').value)-1)));document.getElementById('exDialog').close();};return;}
    const action=target.dataset.studyAction;
    if(action==='exit')this.close();
    if(action==='new')this.newRoute();if(action==='manage')this.manage();if(action==='copy')this.copyRoute();
    if(action==='save')this.saveNow().then(()=>{if(!this.lastSaveError)this.app.notify('路线与节点顺序已保存。');});
    if(action==='export')this.exportMenu();
    if(action==='add-filtered')this.add(this.matching().map(record=>record.id));
    if(action==='add-available')this.add(this.records.filter(record=>StudyRoutes.point(record)).map(record=>record.id));
    if(action==='add-checked')this.add([...this.checked]);
    if(action==='check-filtered'){this.matching().forEach(record=>this.checked.add(record.id));this.renderLibrary();}
    for(const key of ['province','city','county']){
      const value=this.filters[key]||(key==='province'?this.app.store.database.metadata.name:'');
      if(action==='add-'+key&&value)this.add(this.records.filter(record=>record[key]===value&&(!this.filters.province||record.province===this.filters.province)&&(!(key==='county'&&this.filters.city)||record.city===this.filters.city)).map(record=>record.id));
    }
    if(action==='reset-filters'){Object.keys(this.filters).forEach(key=>this.filters[key]='');this.checked.clear();this.renderLibrary(true);}
    if(action==='cancel-insertion'){this.insertion=null;this.renderLibrary();}
    if(action==='suggest')this.suggest();
    if(action==='clear')this.confirm('清空当前路线的全部节点？','路线名称与简介会保留。',()=>{this.route.stop_ids=[];this.playIndex=0;this.commit();});
    if(action==='roads'){this.roadPaused=!this.roadPaused;this.cancelRoads();this.renderStats();this.scheduleRoads();}
    if(action==='fit'){this.pause();this.adapter.fit();}
    if(action==='show-all'){this.pause();this.showAll=!this.showAll;document.getElementById('studyShowAll').classList.toggle('active',this.showAll);this.adapter.setRoute(this.route,this.showAll?[...this.routes.values()]:[]);this.adapter.fit(this.showAll);}
    if(action==='archive-close'){this.archive.hidden=true;document.getElementById('studyCloseArchive').hidden=true;}
    if(action==='play')this.play();if(action==='previous')this.jump(-1);if(action==='next')this.jump(1);
  }

  async close() {
    if(this.closing)return;this.closing=true;
    this.pause();this.cancelRoads();await this.saveNow();this.active=false;
    if(this.lastSaveError){this.active=true;this.closing=false;this.app.notify('保存尚未成功，请先重试保存或导出当前路线。');return;}
    clearTimeout(this.searchTimer);this.abort.abort();this.resizeObservers?.forEach(observer=>observer.disconnect());this.resizeObservers=[];this.adapter.destroy();
    for(const element of [this.toolbar,this.left,this.right,this.mapTools,this.archive,this.player,this.legend])element.remove();
    document.body.classList.remove('study-editing');
    for(const [link,original] of this.navigation||[])link.setAttribute('href',original);
    const url=new URL(location.href);url.searchParams.delete('study');url.searchParams.delete('route');history.replaceState(null,'',url);
    this.app.map.map?.resize?.();this.app.map.home();
    this.closing=false;
  }
};
