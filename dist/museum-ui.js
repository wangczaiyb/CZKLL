window.MuseumUI = class MuseumUI {
  constructor() {
    this.pageFiles={'黑龙江':'heilongjiang.html','吉林':'jilin.html','辽宁':'liaoning.html','内蒙古':'neimenggu.html'};
    this.searchPage=0;
    this.map=null;
    this.buildRegions();this.bindDialogs();this.bindNavigation();this.bindSearch();
    const card=document.getElementById('mapHoverCard');
    card.addEventListener('pointerenter',()=>clearTimeout(this.hoverTimer));
    card.addEventListener('pointerleave',()=>this.hideHover());
    document.getElementById('museumSources').innerHTML=MUSEUM.sourceNames.map(name=>`<p class="source-name">${this.escape(name)}</p>`).join('');
    document.querySelector('.hero-landscape').style.backgroundImage=`url("${MUSEUM.assets.A2}")`;
  }
  escape(value) {
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  detailUrl(record) {return this.pageFiles[record.province || record.region]+'?site='+encodeURIComponent(record.id);}
  toast(text) {
    const element=document.getElementById('museumToast');element.textContent=text;element.classList.add('show');
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>element.classList.remove('show'),3200);
  }
  buildRegions() {
    const entries=Object.entries(MUSEUM.stats.regions);
    document.getElementById('regionFocusButtons').innerHTML=entries.map(([name,count])=>`<a class="region-focus-button" data-focus-region="${name}" href="${this.pageFiles[name]}"><span>${name==='内蒙古'?'内蒙古东部':name}</span><small>${count} 条</small></a>`).join('');
    document.getElementById('heroRegionCounts').innerHTML=entries.map(([name,count])=>`<a href="${this.pageFiles[name]}"><span>${name==='内蒙古'?'内蒙古东部':name}</span><span><strong>${count}</strong><small>条</small></span></a>`).join('');
    document.getElementById('regionChart').innerHTML=entries.map(([name,count])=>`<div class="chart-row"><span class="chart-name">${name==='内蒙古'?'内蒙古东部':name}</span><div class="chart-track"><span class="chart-fill" style="--value:${count/335*100}%"></span></div><strong data-count="${count}">0</strong><a href="${this.pageFiles[name]}">省区档案 ↗</a></div>`).join('');
    document.querySelector('.fallback-regions').innerHTML=entries.map(([name])=>`<a href="${this.pageFiles[name]}">${name}</a>`).join('');
  }
  bindDialogs() {
    document.querySelectorAll('[data-open-search]').forEach(button=>button.onclick=()=>this.openSearch());
    document.querySelectorAll('[data-open-about]').forEach(button=>button.onclick=()=>document.getElementById('museumAboutDialog').showModal());
    document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
    document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}}));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')document.getElementById('mapHoverCard').hidden=true;
      if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();this.openSearch();}
    });
  }
  bindNavigation() {
    const menu=document.querySelector('.mobile-menu');
    menu.onclick=()=>{const open=document.querySelector('.museum-nav').classList.toggle('open');menu.setAttribute('aria-expanded',String(open));};
    document.querySelectorAll('.museum-nav a').forEach(link=>link.onclick=()=>{document.querySelector('.museum-nav').classList.remove('open');menu.setAttribute('aria-expanded','false');});

  }
  bindSearch() {
    ['archiveSearchInput','archiveRegionFilter','archiveSourceFilter'].forEach(id=>document.getElementById(id).addEventListener(id==='archiveSearchInput'?'input':'change',()=>{this.searchPage=0;this.renderSearch();}));
    document.getElementById('searchPrev').onclick=()=>{this.searchPage--;this.renderSearch();};
    document.getElementById('searchNext').onclick=()=>{this.searchPage++;this.renderSearch();};
  }
  openSearch(query='',province='') {
    document.getElementById('archiveSearchInput').value=query;
    document.getElementById('archiveRegionFilter').value=province;
    document.getElementById('archiveSourceFilter').value='';this.searchPage=0;this.renderSearch();
    const dialog=document.getElementById('archiveSearchDialog');if(!dialog.open)dialog.showModal();
    setTimeout(()=>document.getElementById('archiveSearchInput').focus(),50);
  }
  renderSearch() {
    const query=document.getElementById('archiveSearchInput').value.trim().toLowerCase();
    const province=document.getElementById('archiveRegionFilter').value;
    const source=document.getElementById('archiveSourceFilter').value;
    const records=ATLAS.records.filter(record=>(!province||record.province===province)&&(source===''||String(record.source)===source)&&(!query||[record.name,record.region,record.address,record.background].join(' ').toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(records.length/20));
    this.searchPage=Math.max(0,Math.min(this.searchPage,pages-1));
    document.getElementById('archiveSearchCount').textContent=records.length+' 条记录';
    document.getElementById('archiveSearchResults').innerHTML=records.length?records.slice(this.searchPage*20,this.searchPage*20+20).map(record=>`<a class="search-result" href="${this.detailUrl(record)}"><div><h3>${this.escape(record.name)}</h3><p>${this.escape(record.region)} · ${this.escape(record.kind)} · ${record.source===0?'总台账':'市县级以上台账'}</p></div><span>查看档案 ↗</span></a>`).join(''):'<p class="search-empty">没有找到匹配记录，请调整关键词或筛选条件。</p>';
    document.getElementById('searchPage').textContent=`${this.searchPage+1} / ${pages} 页`;
    document.getElementById('searchPrev').disabled=this.searchPage===0;
    document.getElementById('searchNext').disabled=this.searchPage===pages-1;
    document.getElementById('archiveSearchResults').scrollTop=0;
  }
  hover(place,screen) {
    clearTimeout(this.hoverTimer);
    const card=document.getElementById('mapHoverCard');
    const routes=MUSEUM.routes.filter(route=>route.stops.includes(place.key));
    const image=place.image&&MUSEUM.assets[place.image];
    card.innerHTML=(image?`<img class="hover-image" src="${image}" alt="${this.escape(place.name)}实景">`:'')+`<div class="hover-body"><span class="hover-meta">${this.escape(place.region)} · ${this.escape(place.kind)}</span><h3>${this.escape(place.name)}</h3><p>${this.escape(place.background.slice(0,100))}</p><div class="hover-badges">${place.vr?'<span>馆方VR云展</span>':''}<span>${routes.length} 条关联研学建议</span></div><a class="hover-open" href="${this.detailUrl(place)}">进入遗址详情 ↗</a></div>`;
    const stage=document.querySelector('.hero-map-stage');
    const hero=document.querySelector('.museum-hero');
    const left=stage.offsetLeft+screen.x+20;
    const top=stage.offsetTop+screen.y-90;
    card.style.left=Math.max(10,Math.min(left,hero.clientWidth-310))+'px';
    card.style.top=Math.max(145,Math.min(top,hero.clientHeight-390))+'px';
    card.hidden=false;
  }
  hideHover() {this.hoverTimer=setTimeout(()=>document.getElementById('mapHoverCard').hidden=true,230);}
  select(place) {window.location.href=this.detailUrl(place);}
  focus(region) {
    document.querySelectorAll('[data-focus-region]').forEach(button=>button.classList.toggle('active',button.dataset.focusRegion===region));
    const text=region==='内蒙古'?'蒙东范围 · 呼伦贝尔、兴安盟、通辽、赤峰':region==='中国全景'?'点击省区，展开东北抗联记忆':region+' · 点击金色标记阅读遗址';
    document.getElementById('focusCaption').textContent=text;
    this.focusedRegion=this.pageFiles[region]?region:'';
    const entry=document.getElementById('enterAtlas');
    const target=this.focusedRegion;
    entry.href=target?this.pageFiles[target]:'#digital-features';
    entry.innerHTML=target?'进入'+(target==='内蒙古'?'内蒙古东部':target+'省')+'地图 <span>↗</span>':'进入遗址地图 <span>↗</span>'; 
  }
  playRoute(id) {
    const route=MUSEUM.routes.find(route=>route.id===id);
    if(!this.map){this.toast('当前设备可通过路线卡片阅读途经遗址。');return;}
    if(this.map.timeline?.progress()<1)this.map.timeline.progress(1).pause();
    document.getElementById('home').scrollIntoView({behavior:this.map.reduced?'auto':'smooth'});
    document.querySelectorAll('[data-route]').forEach(button=>{const active=button.dataset.route===id;button.classList.toggle('active',active);button.querySelector('span').textContent=active?'重新演绎路线':'在地图上演绎路线';});
    this.map.route(route,true);this.map.focusRoute(route);
    this.toast(route.name+' · 研学建议连线');
  }
  animateStats() {
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const element=entry.target;
      if(element.dataset.count){const count={value:0};gsap.to(count,{value:Number(element.dataset.count),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:1.6,ease:'power2.out',onUpdate:()=>element.textContent=Math.round(count.value)});}
      else gsap.to(element,{scaleX:1,duration:1.4,ease:'power3.out'});
      observer.unobserve(element);
    }),{threshold:.2});
    document.querySelectorAll('[data-count],.chart-fill').forEach(element=>observer.observe(element));
  }
};
