(() => {
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fileName=route=>route.route_name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100)||'研学路线';
  function download(content,name,type) {
    const blob=content instanceof Blob?content:new Blob([content],{type});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function stops(route,byId) {
    return route.stop_ids.map((id,index)=>({record:byId.get(id),id,index:index+1}));
  }
  function properties(route,record,id,index) {
    return {route_id:route.route_id,route_name:route.route_name,route_description:route.route_description,source_record_id:id,order:index,
      name:record?.name||'来源记录暂不可用',province:record?.province||'',city:record?.city||'',county:record?.county||'',township:record?.township||'',village:record?.village||'',
      address:record?.address||'',original_address:record?.originalAddress||'',precision:record?.routeLocation.grade||'待定位',
      position_basis:record?.routeLocation.basis||'来源记录暂不可用',position_source:record?.routeLocation.source||'',crs:'WGS84',
      source_sheet:record?.sheet||'',source_row:record?.row||'',background:record?.background||'',image:record?.image||null,vr_url:record?.vrUrl||null};
  }
  function geojson(route,byId) {
    return {type:'FeatureCollection',name:route.route_name,properties:{route_id:route.route_id,description:route.route_description,theme:route.route_theme,crs:'WGS84',stop_ids:route.stop_ids,stop_order:route.stop_order,route_type:route.route_type,statistics:StudyRoutes.statistics(route,byId),distance_unit:'metres',duration_unit:'seconds',position_notice:'村屯、乡镇和区县参考位置用于研学规划'},features:[
      ...stops(route,byId).map(({record,id,index})=>({type:'Feature',geometry:StudyRoutes.point(record)?{type:'Point',coordinates:StudyRoutes.point(record)}:null,properties:properties(route,record,id,index)})),
      ...route.route_segments.filter(segment=>segment.geometry).map(segment=>({type:'Feature',geometry:segment.geometry,properties:{feature_type:'route_segment',route_id:route.route_id,index:segment.index+1,from_id:segment.from_id,to_id:segment.to_id,status:segment.status,distance_m:segment.status==='road'?segment.distance_m:null,schematic_distance_m:segment.status==='schematic'?segment.schematic_distance_m:null,duration_s:segment.status==='road'?segment.duration_s:null,provider:segment.provider||'',note:segment.note||''}}))]};
  }
  function gpx(route,byId) {
    const waypoints=stops(route,byId).filter(({record})=>StudyRoutes.point(record)).map(({record,id,index})=>{
      const [lon,lat]=StudyRoutes.point(record);return `<wpt lat="${lat}" lon="${lon}"><name>${escape(index+'. '+record.name)}</name><desc>${escape(record.routeLocation.grade+' · '+record.routeLocation.basis+' · '+record.address)}</desc><extensions><study:source_record_id>${escape(id)}</study:source_record_id><study:order>${index}</study:order><study:precision>${escape(record.routeLocation.grade)}</study:precision><study:crs>WGS84</study:crs></extensions></wpt>`;
    }).join('');
    const tracks=route.route_segments.filter(segment=>segment.geometry).map(segment=>`<trk><name>${escape(route.route_name+' · 第'+(segment.index+1)+'段 · '+(segment.status==='road'?'道路路线':'示意连线'))}</name><extensions><study:status>${segment.status}</study:status><study:from_id>${escape(segment.from_id)}</study:from_id><study:to_id>${escape(segment.to_id)}</study:to_id></extensions><trkseg>${segment.geometry.coordinates.map(([lon,lat])=>`<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg></trk>`).join('');
    const pending=stops(route,byId).filter(({record})=>!StudyRoutes.point(record)).map(({id,index,record})=>`<study:unlocated_stop order="${index}" source_record_id="${escape(id)}">${escape(record?.name||id)}</study:unlocated_stop>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="重走抗联路" xmlns="http://www.topografix.com/GPX/1/1" xmlns:study="https://kanglian.local/study-route/1"><metadata><name>${escape(route.route_name)}</name><desc>${escape(route.route_description+' 村镇及区县参考位置，仅供研学规划。')}</desc></metadata>${waypoints}${tracks}<extensions>${pending}</extensions></gpx>`;
  }
  function csv(route,byId) {
    const headers=['路线名称','路线简介','顺序','来源记录ID','遗址名称','省份','城市','区县','乡镇','村屯','地址','原台账地址','定位等级','位置说明','经度','纬度','坐标系','定位来源','工作表','原始行号','图片资源','VR资源','历史简介'];
    const cell=value=>{let text=String(value??'');if(/^[=+@\t\r]/.test(text)||/^-[^\d]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const rows=stops(route,byId).map(({record,id,index})=>{
      const p=properties(route,record,id,index),point=StudyRoutes.point(record);
      return [p.route_name,p.route_description,index,id,p.name,p.province,p.city,p.county,p.township,p.village,p.address,p.original_address,p.precision,p.position_basis,point?.[0]??'',point?.[1]??'','WGS84',p.position_source,p.source_sheet,p.source_row,p.image,p.vr_url,p.background].map(cell).join(',');
    });
    return '\ufeff'+[headers.map(cell).join(','),...rows].join('\r\n');
  }
  function vectorImage(route,byId,catalog) {
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
    const context=canvas.getContext('2d');context.fillStyle='#0c1b2c';context.fillRect(0,0,1600,1000);
    const rows=stops(route,byId).filter(({record})=>StudyRoutes.point(record));
    const project=([lon,lat])=>[lon,-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*180/Math.PI];
    const points=rows.map(({record})=>project(StudyRoutes.point(record)));
    if(!points.length){context.fillStyle='#b5c4d0';context.font='24px sans-serif';context.fillText('当前路线节点暂时待定位',60,300);return canvas;}
    const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
    const width=Math.max(.05,Math.max(...points.map(p=>p[0]))-minX),height=Math.max(.05,Math.max(...points.map(p=>p[1]))-minY);
    const scale=Math.min(1400/width,700/height),xOffset=800-(minX+width/2)*scale,yOffset=510-(minY+height/2)*scale;
    const xy=point=>{const p=project(point);return[p[0]*scale+xOffset,p[1]*scale+yOffset];};
    context.save();context.beginPath();context.rect(20,120,1560,750);context.clip();
    for(const feature of catalog.boundaries.features){
      const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
      context.beginPath();for(const polygon of polygons)for(const ring of polygon)ring.forEach((point,index)=>{const p=xy(point);if(index)context.lineTo(...p);else context.moveTo(...p);});
      context.fillStyle='#17384b';context.fill('evenodd');context.strokeStyle='#5c8ba5';context.lineWidth=1;context.stroke();
    }
    for(const segment of route.route_segments){if(!segment.geometry)continue;context.beginPath();segment.geometry.coordinates.forEach((point,index)=>{const p=xy(point);if(index)context.lineTo(...p);else context.moveTo(...p);});context.strokeStyle=segment.status==='road'?'#e9c483':'#a0b6c8';context.lineWidth=3;context.setLineDash(segment.status==='road'?[]:[9,6]);context.stroke();}
    context.setLineDash([]);
    rows.forEach(({record,index})=>{const [x,y]=xy(StudyRoutes.point(record));context.beginPath();context.arc(x,y,rows.length>100?4:8,0,Math.PI*2);context.fillStyle='#e4bd74';context.fill();if(rows.length<=35||index===1||index===route.stop_ids.length){context.fillStyle='#f5e1b9';context.font='15px sans-serif';context.fillText(index+'. '+record.name.slice(0,22),x+12,y+4);}});
    context.restore();return canvas;
  }
  async function png(route,byId,catalog,adapter) {
    const snapshot=await adapter?.snapshot();
    let canvas;
    if(snapshot){
      try {
        const image=new Image();image.src=snapshot;await image.decode();
        canvas=document.createElement('canvas');canvas.width=Math.max(1200,image.width);canvas.height=Math.round(image.height*canvas.width/image.width)+190;
        const context=canvas.getContext('2d');context.fillStyle='#0b1a2a';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,105,canvas.width,canvas.height-190);
        const map=adapter.map,scale=canvas.width/map.getContainer().clientWidth;
        for(const {record,index} of stops(route,byId)){
          const point=StudyRoutes.point(record);if(!point||!map.getBounds().contains(point))continue;
          const p=map.project(point);const x=p.x*scale,y=p.y*scale+105;
          context.beginPath();context.arc(x,y,10,0,Math.PI*2);context.fillStyle='#d3ab61';context.fill();context.fillStyle='#172638';context.font='bold 12px sans-serif';context.textAlign='center';context.fillText(index,x,y+4);
          if(route.stop_ids.length<=20){context.textAlign='left';context.fillStyle='#fff0c9';context.font='15px sans-serif';context.fillText(record.name.slice(0,20),x+14,y+5);}
        }
      }catch{canvas=null;}
    }
    if(!canvas)canvas=vectorImage(route,byId,catalog);
    const context=canvas.getContext('2d');context.textAlign='left';context.fillStyle='#0b1a2a';context.fillRect(0,0,canvas.width,100);context.fillRect(0,canvas.height-82,canvas.width,82);
    context.fillStyle='#f0d49a';context.font='bold 30px sans-serif';context.fillText(route.route_name,35,43);
    context.fillStyle='#b7c9d6';context.font='16px sans-serif';context.fillText((route.route_description||'自定义研学路线').slice(0,85),35,76);
    const stats=StudyRoutes.statistics(route,byId);
    context.fillText(`${stats.total}站 · ${stats.provinces}省区 · ${stats.cities}城市 · 道路${stats.roadSegments}段 / 示意${stats.schematicSegments}段 / 缺少位置${stats.unavailable}段`,35,canvas.height-50);
    context.font='13px sans-serif';context.fillText('WGS84 · 村镇及区县参考位置用于研学规划 · 完整节点与定位说明见CSV/GeoJSON',35,canvas.height-25);
    context.textAlign='right';context.font='11px sans-serif';context.fillText(snapshot?'地图 © OpenStreetMap / Esri / Mapzen，详见网页图源署名':'行政边界 DataV · 研学参考路线示意图',canvas.width-25,canvas.height-8);
    return canvas.toDataURL('image/png');
  }
  function printable(route,byId,image) {
    const stats=StudyRoutes.statistics(route,byId);let chapter='',number=0;
    const nodes=stops(route,byId).map(({record,id,index})=>{
      const current=(record?.province||'归属待确认')+' · '+(record?.city||'');let heading='';
      if(current!==chapter){chapter=current;heading=`<h2>第${++number}章 · ${escape(chapter)}</h2>`;}
      const coordinates=StudyRoutes.point(record);
      return `${heading}<section class="stop"><h3>${index}. ${escape(record?.name||id)}</h3><p>${escape(record?.province)} ${escape(record?.city)} ${escape(record?.county)} ${escape(record?.township)} ${escape(record?.village)}</p><p>${escape(record?.routeLocation.grade||'待定位')} · ${escape(record?.routeLocation.basis||'暂时待定位')} · WGS84${coordinates?' · '+coordinates.join(', '):''}</p><p>${escape(record?.address||'地址待确认')}</p><p>${escape(record?.background_warning?'原台账简介存在资料差异，请通过数字档案阅读核验依据。':record?.background||'历史简介待补充')}</p><small>来源记录 ${escape(id)} · ${escape(record?.sheet)} 第${record?.row||''}行</small></section>`;
    }).join('');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(route.route_name)}</title><style>body{font:14px/1.8 system-ui,sans-serif;max-width:1000px;margin:32px auto;color:#203449;padding:0 24px}h1{font-size:30px}h2{border-bottom:1px solid #cab583;padding-bottom:8px;margin-top:36px}h3{margin-bottom:8px}.stop{break-inside:avoid;border-bottom:1px solid #dce1e5;padding-bottom:18px}small{color:#576d80}img{width:100%}button{padding:10px 20px;background:#143047;color:white;border:0;border-radius:5px;cursor:pointer}@media print{button{display:none}body{margin:0;max-width:none}h2{break-after:avoid}@page{margin:18mm}}</style></head><body><button onclick="window.print()">打印路线介绍</button><h1>${escape(route.route_name)}</h1><p>${escape(route.route_description)}</p><p>主题 ${escape(route.route_theme||'自主研学')} · ${stats.total}站 · ${stats.provinces}省区 · ${stats.cities}城市</p><p>道路路线${stats.roadSegments}段，示意连线${stats.schematicSegments}段，位置缺失${stats.unavailable}段。${stats.roadSegments?'道路段里程 '+(stats.roadDistance/1000).toFixed(1)+'公里。':''}</p><p>村镇与区县参考位置用于研学规划。道路规划连接参考位置，实地参访请结合道路情况核实。</p>${image?`<img src="${image}" alt="研学路线参考地图">`:''}${nodes}</body></html>`;
  }
  window.StudyRouteExport={escape,download,fileName,geojson,gpx,csv,png,printable};
})();
