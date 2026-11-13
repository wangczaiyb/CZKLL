window.initDetailedMap = function(records, selectRecord, setProvince, filtered, state) {
  const stage=document.getElementById('mapStage');
  const province=document.body.dataset.province;
  const views={'黑龙江':{center:[128,48],zoom:4.7},'吉林':{center:[126.2,43.5],zoom:6},'辽宁':{center:[123,41.3],zoom:6},'内蒙古':{center:[119.5,47],zoom:4.7}};
  const initialView=views[province]||{center:[125.6,45.4],zoom:4.3};
  stage.innerHTML='<div id="streetMap" aria-label="中文开源详细地图"></div><div class="map-status" id="tileStatus">正在加载中文地图…</div><button class="map-home" id="mapHome">⌖ 全域</button><button class="map-tilt" id="mapTilt">立体视角</button>';
  const map=new maplibregl.Map({container:'streetMap',style:ZH_STYLE,...initialView,minZoom:3,maxZoom:19,localIdeographFontFamily:'Microsoft YaHei, PingFang SC, sans-serif',locale:{'NavigationControl.ZoomIn':'放大地图','NavigationControl.ZoomOut':'缩小地图','NavigationControl.ResetBearing':'恢复正北方向','AttributionControl.ToggleAttribution':'地图来源','AttributionControl.MapFeedback':'地图反馈','FullscreenControl.Enter':'全屏显示','FullscreenControl.Exit':'退出全屏'},attributionControl:false});
  map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
  map.addControl(new maplibregl.AttributionControl({compact:false,customAttribution:'<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> 贡献者'}),'bottom-right');
  const provinceCenters={'黑龙江':[127.5,47.5],'吉林':[126.5,43.5],'辽宁':[123,41.5],'内蒙古':[120.3,48]};
  const prefix={'黑龙江':'23','吉林':'22','辽宁':'21','内蒙古':'15'};
  function locate(record){
    const text=record.address+' '+record.region;
    const candidates=CENTERS.filter(c=>String(c.adcode).startsWith(prefix[record.province]) && text.includes(c.name));
    candidates.sort((a,b)=>(b.level==='district')-(a.level==='district') || b.name.length-a.name.length);
    const center=candidates[0];
    return center?{name:center.name,coord:center.center||center.centroid,level:center.level}:{name:record.province,coord:provinceCenters[record.province],level:'province'};
  }
  let markers=[],popup=null,loaded=false;
  window.updateArchiveMap=()=>{
    markers.forEach(marker=>marker.remove());markers=[];
    const groups=new Map();
    filtered().forEach(record=>{const place=locate(record);if(!place.coord)return;const key=place.name+'-'+record.province;if(!groups.has(key))groups.set(key,{...place,records:[]});groups.get(key).records.push(record);});
    groups.forEach(group=>{
      const element=document.createElement('button');element.className='archive-marker vector-marker';element.textContent=group.records.length;element.title=group.name+' · '+group.records.length+'条记录';element.setAttribute('aria-label',element.title);
      const marker=new maplibregl.Marker({element}).setLngLat(group.coord).addTo(map);markers.push(marker);
      element.onclick=()=>{
        if(popup)popup.remove();
        const box=document.createElement('div');box.className='map-popup';
        const title=document.createElement('strong');title.textContent=group.name+' · '+group.records.length+'条台账记录';box.append(title);
        const note=document.createElement('p');note.textContent='按所属行政区聚合，标记位于行政区中心。';box.append(note);
        group.records.forEach(record=>{const button=document.createElement('button');button.textContent=record.name;button.onclick=()=>selectRecord(record.id,true);box.append(button);});
        popup=new maplibregl.Popup({maxWidth:'290px'}).setLngLat(group.coord).setDOMContent(box).addTo(map);
      };
    });
  };
  window.focusArchive=record=>{
    const place=locate(record);if(!place.coord)return;
    map.flyTo({center:place.coord,zoom:place.level==='district'?10:place.level==='city'?8:5.5,duration:900});
    document.getElementById('mapTitle').textContent=record.region+' · 中文地图';
    document.getElementById('tileStatus').textContent=place.name+' · 行政区中心参考定位';
  };
  map.on('load',()=>{
    loaded=true;document.getElementById('tileStatus').textContent='中文地名 · 可缩放查看街道、河流和建筑';
    const codes={'黑龙江':'23','吉林':'22','辽宁':'21','内蒙古':'15'};
    const boundaries={...ADMIN,features:ADMIN.features.filter(feature=>!province||String(feature.properties.adcode).startsWith(codes[province]))};
    map.addSource('admin-borders',{type:'geojson',data:boundaries});
    map.addLayer({id:'admin-borders',type:'line',source:'admin-borders',paint:{'line-color':'#a93944','line-width':1,'line-opacity':.45}});
    const building=map.getStyle().layers.find(layer=>layer['source-layer']==='building' && layer.type==='fill');
    if(building)map.addLayer({id:'archive-buildings-3d',source:building.source,'source-layer':'building',type:'fill-extrusion',minzoom:13,paint:{'fill-extrusion-color':'#c5a487','fill-extrusion-height':['coalesce',['get','render_height'],6],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.75}});
  });
  map.on('error',e=>{if(!loaded)document.getElementById('tileStatus').textContent='中文地图正在连接，网络较慢时请稍候';});
  document.getElementById('mapHome').textContent='⌖ '+(province||'全域');
  document.getElementById('mapHome').onclick=()=>{map.flyTo({...initialView,duration:1000});document.getElementById('mapTitle').textContent=(province||'三省一区')+' · 中文全域地图';};
  document.getElementById('mapTilt').onclick=()=>{const tilted=map.getPitch()>0;map.easeTo({pitch:tilted?0:55,bearing:tilted?0:-15,duration:800});document.getElementById('mapTilt').textContent=tilted?'立体视角':'平面视角';};
  document.querySelector('.map-footer span').textContent='拖动平移 · 滚轮缩放 · 右键拖动旋转 · 点击数字查看档案';
  document.querySelector('.map-note').innerHTML='中文地图来源 OpenFreeMap / OpenStreetMap · 数字按行政区聚合，台账未提供逐地点经纬度。行政边界来源 <a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noopener">DataV</a>。';
  document.querySelector('.live-dot').textContent='中文详细地图';
  window.archiveMap=map;
  new ResizeObserver(()=>map.resize()).observe(stage);
  window.updateArchiveMap();
};
