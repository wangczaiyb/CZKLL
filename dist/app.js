const $ = id => document.getElementById(id);
const pageProvince = document.body.dataset.province || '';
const pageFiles = {'黑龙江':'heilongjiang.html','吉林':'jilin.html','辽宁':'liaoning.html','内蒙古':'neimenggu.html'};
const records = ATLAS.records.filter(record => !pageProvince || record.province === pageProvince);
const provinces = ['黑龙江','吉林','辽宁','内蒙古'];
const state = {province:pageProvince,source:'',kind:'',query:'',page:0,selected:records[0].id,collection:false};
let saved = new Set();
try { saved = new Set(JSON.parse(localStorage.getItem('kanglian-saved') || '[]')); } catch {}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function filtered() {
  return records.filter(r => (!state.province || r.province === state.province) && (state.source === '' || String(r.source) === state.source) && (!state.kind || r.kind === state.kind) && (!state.collection || saved.has(r.id)) && (!state.query || [r.name,r.region,r.address,r.background,r.level].join(' ').toLowerCase().includes(state.query.toLowerCase())));
}
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
function selectRecord(id, scroll=false) {
  state.selected=id;
  const r=records.find(r=>r.id===id);
  if(!r) return;
  if(window.speechSynthesis) speechSynthesis.cancel();
  const photo=HeritageImages.get(r);
  const image = photo ? `<div class="detail-image"><img data-image-asset="${esc(photo.key)}" src="${photo.src}" alt="${esc(photo.caption)}" tabindex="0" role="button" aria-label="放大遗址资料影像"><span class="image-credit">${esc(photo.caption)} · <a href="${esc(photo.source)}" target="_blank" rel="noopener">${esc(photo.credit)} ↗</a></span></div>` : '';
  $('detail').innerHTML=image+`<div class="detail-body"><div class="detail-meta"><span>${esc(r.region)}</span><span>档案 ${esc(r.serial)}</span></div><h2>${esc(r.name)}</h2><p class="address">⌖ ${esc(r.address || '台账未提供地址')}</p><span class="tag">${esc(r.kind || '未分类')}</span><span class="tag">${esc(r.level || '级别未填写')}</span><p class="story">${esc(r.background || '该记录未提供历史背景，可依据台账地址进一步查阅。')}</p><span class="tag">${esc(r.status || '台账未填写核实状态')}</span><p class="source-row">来源 · ${r.source===0?'总台账':'市县级以上台账'}<br>${esc(r.sheet)} · Excel 第 ${r.row} 行</p><div class="detail-actions"><button id="saveRecord" class="${saved.has(id)?'saved':''}">${saved.has(id)?'✓ 已加入寻访':'＋ 加入寻访'}</button><button id="speakRecord">◉ 语音讲解</button><button id="mapSearch">地址检索 ↗</button></div></div>`;
  const picture=$('detail').querySelector('[data-image-asset]');
  picture?.addEventListener('click',()=>HeritageImages.enlarge(r));
  picture?.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();HeritageImages.enlarge(r);}
  });
  $('saveRecord').onclick=()=>{saved.has(id)?saved.delete(id):saved.add(id);try{localStorage.setItem('kanglian-saved',JSON.stringify([...saved]));}catch{toast('浏览器存储不可用，收藏仅在本次访问有效');}renderList();selectRecord(id);};
  $('speakRecord').onclick=()=>{
    if(!window.speechSynthesis){toast('当前浏览器暂不支持语音朗读');return;}
    if(speechSynthesis.speaking){speechSynthesis.cancel();$('speakRecord').textContent='◉ 语音讲解';return;}
    const utterance=new SpeechSynthesisUtterance(`${r.name}。${r.region}。${r.background || '台账未提供背景资料。'}`);
    utterance.lang='zh-CN';utterance.rate=.9;utterance.onend=()=>{if($('speakRecord'))$('speakRecord').textContent='◉ 语音讲解';};
    speechSynthesis.speak(utterance);$('speakRecord').textContent='■ 停止讲解';
  };
  $('mapSearch').onclick=()=>window.open('https://www.amap.com/search?query='+encodeURIComponent(r.name+' '+r.address),'_blank','noopener');
  document.querySelectorAll('.record').forEach(b=>b.classList.toggle('selected',b.dataset.id===id));
  if(window.focusArchive) window.focusArchive(r);
  if(scroll && innerWidth<1150) $('detail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderList() {
  const items=filtered();
  const pages=Math.max(1,Math.ceil(items.length/30));
  state.page=Math.max(0,Math.min(state.page,pages-1));
  if(window.updateArchiveMap) window.updateArchiveMap();
  $('resultCount').textContent=`${items.length} 条记录`;
  $('savedCount').textContent=records.filter(record=>saved.has(record.id)).length;
  $('results').innerHTML=items.length ? items.slice(state.page*30,(state.page+1)*30).map(r=>`<button class="record ${state.selected===r.id?'selected':''}" data-id="${esc(r.id)}"><span class="record-name">${esc(r.name)}</span><small><span class="record-tag">${r.source===0?'总台账':'市县级以上'}</span>${esc(r.region)}</small></button>`).join('') : '<div class="empty-results">没有匹配的记录。<br>试试其他关键词或重置筛选。</div>';
  $('pageLabel').textContent=`${state.page+1} / ${pages} 页`;
  $('prev').disabled=state.page===0;$('next').disabled=state.page===pages-1;
  $('provinceTabs').innerHTML=`<span class="current-province">${esc(pageProvince)}全部档案</span><span class="province-total">${records.length} 条</span>`;
  $('mapTitle').textContent=state.province ? `${state.province} · 区域档案` : '三省一区 · 全域视野';
  document.querySelectorAll('.land').forEach(el=>el.classList.toggle('chosen',el.dataset.province===state.province));
  $('collection').classList.toggle('active',state.collection);$('explore').classList.toggle('active',!state.collection);
}
function updateFilters() { state.page=0;renderList();$('results').scrollTop=0;const first=filtered()[0];if(first)selectRecord(first.id); }
function setProvince(p){
  if(p && p!==pageProvince){window.location.href=pageFiles[p];return;}
  state.province=pageProvince;updateFilters();
}
$('results').onclick=e=>{const b=e.target.closest('[data-id]');if(b)selectRecord(b.dataset.id,true);};
$('provinceTabs').onclick=e=>{const b=e.target.closest('[data-province]');if(b)setProvince(b.dataset.province);};
$('search').oninput=e=>{state.query=e.target.value.trim();updateFilters();};
$('source').onchange=e=>{state.source=e.target.value;updateFilters();};
Array.from($('source').options).forEach(option=>{
  if(option.value!=='')option.textContent=`${option.value==='0'?'总台账':'市县级以上'} · ${records.filter(record=>String(record.source)===option.value).length}条`;
});
$('kind').innerHTML+=[...new Set(records.map(r=>r.kind).filter(Boolean))].sort().map(k=>`<option>${esc(k)}</option>`).join('');
$('kind').onchange=e=>{state.kind=e.target.value;updateFilters();};
$('prev').onclick=()=>{state.page--;renderList();$('results').scrollTop=0;};$('next').onclick=()=>{state.page++;renderList();$('results').scrollTop=0;};
function reset(){Object.assign(state,{province:pageProvince,source:'',kind:'',query:'',page:0,collection:false});$('search').value='';$('source').value='';$('kind').value='';updateFilters();}
$('reset').onclick=reset;
$('collection').onclick=()=>{reset();state.collection=true;updateFilters();$('atlas').scrollIntoView();};
$('explore').onclick=()=>{reset();$('atlas').scrollIntoView();};
$('start').onclick=()=>$('atlas').scrollIntoView({behavior:'smooth'});
$('sourceNames').textContent=ATLAS.sources.join('；');
$('about').onclick=()=>$('infoDialog').showModal();$('closeInfo').onclick=()=>$('infoDialog').close();
$('infoDialog').onclick=e=>{if(e.target===$('infoDialog'))$('infoDialog').close();};
document.addEventListener('keydown',e=>{if(e.key==='/' && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();$('atlas').scrollIntoView();}});
$('fullscreen').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen();}catch{toast('当前预览环境未开放全屏功能');}};
$('export').onclick=()=>{const data=filtered();const fields=['name','region','address','level','kind','background','status'];const rows=[['名称','地区','地址','级别','类型','历史背景','核实状态','来源','Excel行号'],...data.map(r=>[...fields.map(k=>r[k]),ATLAS.sources[r.source],r.row])];const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='抗联寻访档案.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${data.length} 条记录`);};
initDetailedMap(records,selectRecord,setProvince,filtered,state);
const journeys=[['黑龙江','林海坚守','密营与抗联斗争记忆','A2'],['吉林','白山忠魂','根据地与英烈纪念','B3'],['辽宁','烽火西征','山地密营与西征足迹','C3'],['内蒙古','北疆星火','走近北疆抗联纪念地','D1']];
$('journeyGrid').innerHTML=journeys.filter(([province])=>province!==pageProvince).map(([province,title,desc,img])=>`<button class="journey-card" data-province="${province}"><img src="${img}.jpg" alt="${province}抗联相关实景" loading="lazy"><small>${province}</small><strong>${title}</strong><span>${desc}</span><b>↗</b></button>`).join('');
$('journeyGrid').onclick=e=>{const button=e.target.closest('[data-province]');if(button){window.location.href=pageFiles[button.dataset.province];}};
let tourTimer=null,tourIndex=0;
const tourImageKeys=['A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','D2','D3'];
const tourRecords=tourImageKeys.map(key=>records.find(r=>r.source===0 && HeritageImages.get(r)?.key===key)).filter(Boolean);
function stopTour(){clearInterval(tourTimer);tourTimer=null;$('tour').textContent='▷ 自动巡游';$('tourStatus').textContent='';}
$('tour').onclick=()=>{if(tourTimer){stopTour();return;}reset();$('atlas').scrollIntoView();tourIndex=0;const step=()=>{const r=tourRecords[tourIndex%tourRecords.length];state.province=r.province;state.selected=r.id;renderList();selectRecord(r.id);$('tourStatus').textContent=`${tourIndex%tourRecords.length+1} / ${tourRecords.length}`;tourIndex++;};step();tourTimer=setInterval(step,6500);$('tour').textContent='Ⅱ 暂停巡游';};
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas=$('embers'),ctx=canvas.getContext('2d');let width,height;
function resize(){width=canvas.width=innerWidth;height=canvas.height=innerHeight;}resize();window.addEventListener('resize',resize);
const particles=Array.from({length:45},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.2+.25,v:Math.random()*.00015+.00003}));
function frame(){ctx.clearRect(0,0,width,height);particles.forEach(p=>{if(!paused){p.y-=p.v;if(p.y<0){p.y=1;p.x=Math.random();}}ctx.beginPath();ctx.fillStyle=`rgba(244,193,119,${p.r*.3})`;ctx.arc(p.x*width,p.y*height,p.r,0,Math.PI*2);ctx.fill();});requestAnimationFrame(frame);}frame();
function updateMotion(){document.body.classList.toggle('paused',paused);$('motion').textContent=paused?'开启动效':'暂停动效';}updateMotion();
$('motion').onclick=()=>{paused=!paused;updateMotion();};
window.addEventListener('pagehide',()=>{stopTour();if(window.speechSynthesis)speechSynthesis.cancel();});
const requestedSite=new URLSearchParams(location.search).get('site');
if(records.some(record=>record.id===requestedSite))state.selected=requestedSite;
renderList();selectRecord(state.selected);
if(pageProvince&&!requestedSite)document.getElementById('mapHome').click();
window.atlasTest={records,filtered,state,saved};
