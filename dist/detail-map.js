window.initDetailedMap = function(records, selectRecord, setProvince, filtered, state) {
  const stage=document.getElementById('mapStage');
  stage.innerHTML='<div id="streetMap" aria-label="OpenStreetMap详细交互地图"></div><div class="map-status" id="tileStatus">正在加载详细底图…</div><button class="map-home" id="mapHome">⌖ 全域</button><button class="map-tilt" id="mapTilt">立体视角</button>';
  const map=L.map('streetMap',{zoomControl:true,scrollWheelZoom:true,minZoom:3,maxZoom:19}).setView([45.4,125.6],5);
  const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'}).addTo(map);
  const terrain=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenStreetMap contributors, SRTM | © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)'});
  const outlines=L.geoJSON(ADMIN,{style:{color:'#a03c3f',weight:1,fillColor:'#b54e4e',fillOpacity:.025},onEachFeature:(f,layer)=>{layer.bindTooltip(f.properties.name,{sticky:true});layer.on('click',()=>{map.fitBounds(layer.getBounds(),{padding:[20,20]});const p=f.properties.adcode.toString().slice(0,2);setProvince({'23':'黑龙江','22':'吉林','21':'辽宁','15':'内蒙古'}[p]);});}});
  L.control.layers({'街道地图 · OpenStreetMap':streets,'地形地图 · OpenTopoMap':terrain},{'市级行政边界 · DataV':outlines},{collapsed:true,position:'topright'}).addTo(map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  let tileErrors=0;
  streets.on('load',()=>{document.getElementById('tileStatus').textContent=tileErrors?'部分底图未加载，可切换图层':'详细街道底图 · 可缩放至街道';});
  streets.on('tileerror',()=>{tileErrors++;document.getElementById('tileStatus').textContent='底图网络加载受限，可切换地形图或查看行政边界';if(!map.hasLayer(outlines))outlines.addTo(map);});
  terrain.on('load',()=>{document.getElementById('tileStatus').textContent='地形底图 · OpenTopoMap';});
  const provinceCenters={'黑龙江':[127.5,47.5],'吉林':[126.5,43.5],'辽宁':[123,41.5],'内蒙古':[120.3,48]};
  const prefix={'黑龙江':'23','吉林':'22','辽宁':'21','内蒙古':'15'};
  function locate(record){
    const text=record.address+' '+record.region;
    const candidates=CENTERS.filter(c=>String(c.adcode).startsWith(prefix[record.province]) && text.includes(c.name));
    candidates.sort((a,b)=>(b.level==='district')-(a.level==='district') || b.name.length-a.name.length);
    const center=candidates[0];
    return center?{name:center.name,coord:center.center||center.centroid,level:center.level}:{name:record.province,coord:provinceCenters[record.province],level:'province'};
  }
  const markers=L.layerGroup().addTo(map);
  let focusLayer=null;
  window.updateArchiveMap=()=>{
    markers.clearLayers();
    const groups=new Map();
    filtered().forEach(r=>{const place=locate(r);if(!place.coord)return;const key=place.name+'-'+r.province;if(!groups.has(key))groups.set(key,{...place,records:[]});groups.get(key).records.push(r);});
    groups.forEach(group=>{
      const icon=L.divIcon({className:'archive-marker',html:`<span>${group.records.length}</span>`,iconSize:[32,32],iconAnchor:[16,16]});
      const marker=L.marker([group.coord[1],group.coord[0]],{icon,title:group.name+' · '+group.records.length+'条'}).addTo(markers);
      marker.bindTooltip(group.name+' · '+group.records.length+'条记录');
      const box=document.createElement('div');box.className='map-popup';
      const title=document.createElement('strong');title.textContent=group.name+' · '+group.records.length+'条台账记录';box.append(title);
      const note=document.createElement('p');note.textContent='按所属行政区聚合。标记位于行政区中心。';box.append(note);
      group.records.forEach(record=>{const button=document.createElement('button');button.textContent=record.name;button.onclick=()=>selectRecord(record.id,true);box.append(button);});
      marker.bindPopup(box,{maxHeight:230,maxWidth:280});
    });
  };
  window.focusArchive=record=>{
    const place=locate(record);if(!place.coord)return;
    if(focusLayer)map.removeLayer(focusLayer);
    focusLayer=L.circleMarker([place.coord[1],place.coord[0]],{radius:22,color:'#c32337',weight:2,fillOpacity:.08}).addTo(map);
    map.flyTo([place.coord[1],place.coord[0]],place.level==='district'?10:place.level==='city'?8:6,{duration:.65});
    document.getElementById('tileStatus').textContent=place.name+' · 行政区中心参考定位，精确位置请使用地址检索';
  };
  document.getElementById('mapHome').onclick=()=>map.flyTo([45.4,125.6],5);
  document.getElementById('mapTilt').onclick=()=>{const tilted=stage.classList.toggle('tilted');document.getElementById('mapTilt').textContent=tilted?'平面视角':'立体视角';setTimeout(()=>map.invalidateSize(),350);};
  document.querySelector('.map-footer span').textContent='拖动平移 · 滚轮缩放 · 点击数字查看区域全部档案';
  document.querySelector('.map-note').innerHTML='底图 © OpenStreetMap contributors · 行政区划来源 <a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noopener">阿里云 DataV</a>。数字按行政区聚合，台账未提供地点经纬度。';
  document.querySelector('.live-dot').textContent='开源详细地图';
  window.archiveMap=map;
  new ResizeObserver(()=>map.invalidateSize()).observe(stage);
  window.updateArchiveMap();
};
