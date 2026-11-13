(() => {
  const id=new URLSearchParams(location.search).get('id');
  const original=ATLAS.records.find(record=>record.id===id);
  const record=original ? HeritageRecords.apply({...original,...(window.COORDINATE_REGISTRY?.[id]||{})}) : null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const root=document.getElementById('recordDetail');
  const home=document.querySelector('.museum-brand').getAttribute('href');
  if(!record){root.innerHTML=`<h1>未找到这条遗址档案</h1><p class="detail-notice">请从地图点位或台账检索结果进入。</p><a class="quiet-button" href="${home}">返回首页 ↗</a>`;return;}
  document.title=record.name+' · 重走抗联路';
  document.querySelectorAll('.museum-nav a').forEach(link => { const active=link.textContent===(record.province==='内蒙古'?'内蒙古东部':record.province); link.classList.toggle('active',active); if(active)link.setAttribute('aria-current','page'); });
  const pages={'黑龙江':'heilongjiang.html','吉林':'jilin.html','辽宁':'liaoning.html','内蒙古':'neimenggu.html'};
  const featured=MUSEUM.featured.find(place=>place.id===record.id);
  const photograph=HeritageImages.get(record);
  const image=photograph?.src;
  const coordinates=record.longitude!=null?`<dt>已关联公开坐标</dt><dd>${record.longitude.toFixed(6)}°E，${record.latitude.toFixed(6)}°N · WGS84<br>${escape(record.coordinatePrecision)}<br><a href="${escape(record.coordinateSource)}" target="_blank" rel="noopener">${escape(record.coordinateStatus)} ↗</a><br>${escape(record.verificationEvidence)}</dd>`:'<dt>地图资料</dt><dd>遗址级坐标待补充，可在省区地图查看台账所列行政范围。</dd>';
  const backgroundConflict=record.dataConflicts?.some(conflict=>conflict.conflictingFields?.includes('background'));
  const introduction=backgroundConflict?'原台账简介与遗址对象存在差异，原文与核验说明见下方资料差异。':record.background;
  const imageCredit=photograph?.credit||'';
  const imageAttribution=photograph?`<a href="${escape(photograph.source)}" target="_blank" rel="noopener">${escape(imageCredit)} ↗</a>`:'';
  root.innerHTML=`<div class="detail-breadcrumb"><a href="${home}">首页</a>　›　<a href="${pages[record.province]}">${escape(record.province)}档案</a>　›　遗址详情</div><article class="full-detail ${image?'':'text-only'}">${image?'<div class="detail-visual">':''}${image?`<img data-image-asset="${escape(photograph.key)}" src="${image}" alt="${escape(photograph.caption)}" tabindex="0" role="button" aria-label="放大遗址资料影像"><p class="detail-photo-credit">${escape(photograph.caption)} · ${imageAttribution}</p>`:''}${image?'</div>':''}<div><p class="museum-eyebrow">${escape(record.region)}</p><h1>${escape(record.name)}</h1><div class="detail-tags"><span class="detail-tag">${escape(record.kind||'类型未填写')}</span><span class="detail-tag">${escape(record.level||'级别未填写')}</span><span class="detail-tag">${escape(record.status||'核实状态未填写')}</span></div><p class="detail-story">${escape(introduction||'该条台账未提供历史背景，可沿台账地址进一步查阅。')}</p><dl class="detail-facts"><dt>台账地址</dt><dd>${escape(record.address||'台账未填写')}</dd>${coordinates}<dt>原始资料定位</dt><dd>${escape(ATLAS.sources[record.source])}<br>${escape(record.sheet)} · Excel 第 ${record.row} 行 · 序号 ${escape(record.serial)}</dd></dl><div class="detail-buttons"><button class="gold-button" id="detailSave">＋ 加入寻访</button><button class="detail-secondary" id="detailSpeak">语音讲解</button><a class="detail-secondary" href="${pages[record.province]}?site=${encodeURIComponent(record.id)}">进入省区地图 ↗</a></div>${(featured?.vr||record.vrUrl)?`<p class="detail-notice">关联云展由东北烈士纪念馆提供。<a href="${escape(MUSEUM.vr[0].url)}" target="_blank" rel="noopener">进入馆方全景展 ↗</a></p>`:''}</div></article><section class="detail-notes"><h2>留下你的研学观察</h2><p class="detail-notice">记录你看到的史实、资料出处与仍想追问的问题，手记保存在当前浏览器。</p><textarea id="detailNote" aria-label="研学手记" placeholder="我观察到什么？依据是什么？还有什么问题？"></textarea><button class="quiet-button" id="saveDetailNote">保存研学手记</button></section>`;
  const picture=root.querySelector('.detail-visual img');
  picture?.addEventListener('click',()=>HeritageImages.enlarge(record));
  picture?.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();HeritageImages.enlarge(record);}
  });
  function toast(text){const element=document.getElementById('detailToast');element.textContent=text;element.classList.add('show');setTimeout(()=>element.classList.remove('show'),2500);}
  if(record.dataConflicts?.length){
    if(record.dataConflicts.some(conflict=>conflict.conflictingFields?.includes('background'))){
      root.querySelector('.detail-story').textContent='原台账简介（已发现资料错配）\n'+record.background;
    }
    const notice=document.createElement('section');notice.className='detail-notice';
    const heading=document.createElement('h2');heading.textContent='资料核对差异';notice.append(heading);
    record.dataConflicts.forEach(conflict=>{
      const paragraph=document.createElement('p');paragraph.textContent=conflict.finding||conflict.conclusion||conflict.description||'原台账资料需要进一步核对';notice.append(paragraph);
    });
    if(backgroundConflict){const originalText=document.createElement('details');const label=document.createElement('summary');label.textContent='原台账简介（存在资料差异）';const paragraph=document.createElement('p');paragraph.textContent=record.background;originalText.append(label,paragraph);notice.append(originalText);}
    root.querySelector('.detail-notes').before(notice);
  }
  let saved=new Set();
  try{saved=new Set(JSON.parse(localStorage.getItem('kanglian-saved')||'[]'));document.getElementById('detailNote').value=localStorage.getItem('kanglian-draft-'+id)??localStorage.getItem('kanglian-note-'+id)??'';}catch{}
  document.getElementById('detailNote').addEventListener('input',event=>{try{localStorage.setItem('kanglian-draft-'+id,event.target.value);}catch{}});
  const button=document.getElementById('detailSave');
  const updateSave=()=>button.textContent=saved.has(id)?'✓ 已加入寻访':'＋ 加入寻访';updateSave();
  button.onclick=()=>{saved.has(id)?saved.delete(id):saved.add(id);try{localStorage.setItem('kanglian-saved',JSON.stringify([...saved]));updateSave();toast(saved.has(id)?'已保存到寻访清单':'已移出寻访清单');}catch{toast('浏览器存储暂时不可用');}};
  document.getElementById('saveDetailNote').onclick=()=>{try{localStorage.setItem('kanglian-note-'+id,document.getElementById('detailNote').value);toast('研学手记已保存');}catch{toast('浏览器存储暂时不可用');}};
  document.getElementById('detailSpeak').onclick=()=>{
    if(!window.speechSynthesis){toast('当前浏览器暂不支持语音朗读');return;}
    if(speechSynthesis.speaking){speechSynthesis.cancel();document.getElementById('detailSpeak').textContent='语音讲解';return;}
    const speech=new SpeechSynthesisUtterance(record.name+'。'+((record.searchBackground??record.background)||'原台账简介存在资料差异，请结合核验依据阅读。'));speech.lang='zh-CN';speech.rate=.9;speech.onend=()=>document.getElementById('detailSpeak').textContent='语音讲解';speechSynthesis.speak(speech);document.getElementById('detailSpeak').textContent='停止讲解';
  };
  window.addEventListener('pagehide',()=>window.speechSynthesis?.cancel());
})();
