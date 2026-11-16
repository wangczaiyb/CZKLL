/* Reuses the active GIS instance and owns only study-route sources and layers. */
window.StudyRouteMap = class StudyRouteMap {
  constructor(engine,catalog,actions) {
    this.engine=engine;this.catalog=catalog;this.actions=actions;
    this.byId=new Map(catalog.records.map(record=>[record.id,record]));
    this.markers=new Map();this.handlers=[];
    this.frame=null;this.version=0;this.selectedId=null;
    engine.studyMode=true;
    this.move=()=>{if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.updatePins();});};
    this.interrupt=event=>{if(!event||event.originalEvent||['mousedown','touchstart','pointerdown','wheel'].includes(event.type))actions.pause();};
    this.bind();
  }

  bind() {
    if(this.engine.destroyed)return;
    if(!this.engine.ready){
      this.ready=()=>{window.removeEventListener('exhibit-map-ready',this.ready);this.bind();};
      window.addEventListener('exhibit-map-ready',this.ready);return;
    }
    if(this.engine.map?.addSource)this.bindGIS();else this.bindFlat();
    this.setRecords(this.records||this.catalog.records);
    if(this.route)this.setRoute(this.route,this.others);
    if(this.pendingFit){this.pendingFit=false;this.fit();}
  }

  bindGIS() {
    const map=this.map=this.engine.map;
    for(const marker of [...this.engine.markers.values(),...this.engine.clusterMarkers.values()])marker.getElement().hidden=true;
    for(const id of ['heritage-clusters','heritage-counts','context-points']){
      if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');
    }
    const empty=StudyRoutes.empty();
    map.addSource('study-boundaries',{type:'geojson',data:this.catalog.boundaries});
    map.addLayer({id:'study-boundaries',type:'line',source:'study-boundaries',paint:{'line-color':'#B99A65','line-width':1,'line-opacity':.45}});
    map.addSource('study-library',{type:'geojson',data:empty,cluster:true,clusterRadius:38,clusterMaxZoom:12});
    map.addLayer({id:'study-library-clusters',type:'circle',source:'study-library',filter:['has','point_count'],paint:{'circle-color':'#39322F','circle-radius':['step',['get','point_count'],16,20,21,100,26],'circle-stroke-color':'#B99A65','circle-stroke-width':1.5}});
    map.addLayer({id:'study-library-counts',type:'symbol',source:'study-library',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#E4D8C5'}});
    map.addLayer({id:'study-library-points',type:'circle',source:'study-library',filter:['!',['has','point_count']],paint:{'circle-radius':['case',['get','selected'],7,4],'circle-color':['match',['get','grade'],'村屯级','#D4B16F','乡镇级','#C2AE87','#A08E70'],'circle-stroke-color':'#E4D8C5','circle-stroke-width':1,'circle-opacity':.8}});
    map.addSource('study-selected',{type:'geojson',data:empty});
    map.addLayer({id:'study-selected',type:'circle',source:'study-selected',paint:{'circle-radius':7,'circle-color':'#c5a05d','circle-stroke-width':2,'circle-stroke-color':'#ffdda0','circle-opacity':.85}});
    this.listen('click','study-selected',event=>{if(this.claimClick(event)){const group=this.selectedGroups().find(item=>item.key===event.features[0].properties.key);if(group)this.chooseGroup(group);}});
    map.addSource('study-route-lines',{type:'geojson',data:empty,lineMetrics:true});
    map.addLayer({id:'study-route-glow',type:'line',source:'study-route-lines',paint:{'line-color':['case',['get','active'],'#D4B16F','#9A835D'],'line-width':['case',['get','active'],6,3],'line-blur':3,'line-opacity':.18}});
    map.addLayer({id:'study-route-roads',type:'line',source:'study-route-lines',filter:['==',['get','status'],'road'],paint:{'line-color':['case',['get','active'],'#D4B16F','#B99A65'],'line-width':['case',['get','active'],3.5,2],'line-opacity':.95}});
    map.addLayer({id:'study-route-schematic',type:'line',source:'study-route-lines',filter:['==',['get','status'],'schematic'],paint:{'line-color':['case',['get','active'],'#D4B16F','#9A835D'],'line-width':2.5,'line-dasharray':[3,2],'line-opacity':.85}});
    map.addLayer({id:'study-route-flow',type:'line',source:'study-route-lines',filter:['==',['get','active'],true],paint:{'line-color':'#F2E0B7','line-width':1.5,'line-dasharray':[0,4,3],'line-opacity':.7}});
    this.listen('click','study-library-points',event=>{if(!this.claimClick(event))return;const rows=[...new Set(event.features.map(feature=>feature.properties.id))].map(id=>this.byId.get(id));if(rows.length>1)this.actions.choose(rows.map(record=>({id:record.id,label:record.name+' · '+record.sheet+'第'+record.row+'行'})),'选择该位置的来源记录');else this.actions.archive(rows[0].id);});
    this.listen('click','study-library-clusters',event=>this.openCluster(event));
    for(const id of ['study-library-points','study-library-clusters']){
      this.listen('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});
      this.listen('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
    }
    for(const event of ['moveend','zoomend','resize'])this.listen(event,null,this.move);
    for(const event of ['mousedown','touchstart','zoomstart','rotatestart'])this.listen(event,null,this.interrupt);
    let phase=0;
    this.flowTimer=setInterval(()=>{
      if(document.hidden||matchMedia('(prefers-reduced-motion:reduce)').matches||!this.route?.route_segments.length||this.engine.destroyed)return;
      const patterns=[[0,4,3],[1,4,2],[2,4,1],[3,4,0]];
      map.setPaintProperty('study-route-flow','line-dasharray',patterns[phase++%patterns.length]);
    },650);
    map.resize();
  }

  listen(event,layer,callback) {
    if(layer)this.map.on(event,layer,callback);else this.map.on(event,callback);
    this.handlers.push([event,layer,callback]);
  }

  claimClick(event) {
    if(event.originalEvent?.studyHandled)return false;
    if(event.originalEvent)event.originalEvent.studyHandled=true;
    this.clusterSequence=(this.clusterSequence||0)+1;
    return true;
  }

  bindFlat() {
    const svg=this.engine.svg;
    this.flatGroups=[];
    for(const id of ['studyFlatBoundaries','studyFlatLines','studyFlatPoints','studyFlatSelected']){
      const group=document.createElementNS(svg.namespaceURI,'g');group.id=id;svg.append(group);this.flatGroups.push(group);
    }
    svg.querySelector('#flatPoints').style.display='none';
    const boundary=this.flatGroups[0];
    for(const feature of this.catalog.boundaries.features){
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',this.engine.path(feature.geometry));path.setAttribute('fill','#B99A6510');path.setAttribute('stroke','#B99A65');path.setAttribute('stroke-width','.8');path.setAttribute('vector-effect','non-scaling-stroke');boundary.append(path);
    }
    this.observer=new MutationObserver(this.move);this.observer.observe(svg,{attributes:true,attributeFilter:['viewBox']});
    svg.addEventListener('pointerdown',this.interrupt);svg.addEventListener('wheel',this.interrupt);
  }

  setRecords(records) {
    this.records=records;
    const selected=new Set(this.route?.stop_ids||[]);
    const signature=records.map(record=>record.id).join('|')+'#'+[...selected].join('|');
    if(this.map?.getSource('study-library')&&signature!==this.librarySignature){
      this.librarySignature=signature;
      this.libraryVersion=(this.libraryVersion||0)+1;
      this.map.getSource('study-library').setData({type:'FeatureCollection',features:records.filter(record=>StudyRoutes.point(record)).map(record=>({type:'Feature',geometry:{type:'Point',coordinates:StudyRoutes.point(record)},properties:{id:record.id,name:record.name,grade:record.routeLocation.grade,selected:selected.has(record.id)}}))});
    }
    this.updatePins();
  }

  setRoute(route,others=[]) {
    this.route=route;this.others=others;this.version++;
    if(!this.routeFrame)this.routeFrame=requestAnimationFrame(()=>{this.routeFrame=null;this.flushRoute();});
  }

  flushRoute() {
    if(this.destroyed||!this.route)return;
    const route=this.route,others=this.others;
    if(this.map?.getSource('study-route-lines')){
      const features=[];
      for(const item of [...others.filter(item=>item.route_id!==route.route_id),route]){
        for(const segment of item.route_segments){
          if(segment.geometry)features.push({type:'Feature',geometry:segment.geometry,properties:{route_id:item.route_id,status:segment.status,active:item.route_id===route.route_id}});
        }
      }
      this.map.getSource('study-route-lines').setData({type:'FeatureCollection',features});
      this.map.getSource('study-selected').setData({type:'FeatureCollection',features:this.selectedGroups().map(group=>({type:'Feature',geometry:{type:'Point',coordinates:group.coordinates},properties:{key:group.key}}))});
    }
    this.setRecords(this.records||this.catalog.records);
    this.drawFlatLines();this.updateMessage();
  }

  updateMessage() {
    if(!this.route)return;
    const stats=StudyRoutes.statistics(this.route,this.byId);
    document.getElementById('mapMessage').textContent=`路线编辑 · ${stats.total} 站 · ${stats.roadSegments} 段道路 / ${stats.schematicSegments} 段示意 / ${stats.unavailable} 段位置缺失`;
  }

  selectedGroups() {
    const groups=new Map();
    this.route?.stop_ids.forEach((id,index)=>{
      const record=this.byId.get(id),coordinates=StudyRoutes.point(record);
      if(!coordinates)return;
      const key=StudyRoutes.coordinateKey(coordinates);
      if(!groups.has(key))groups.set(key,{key,coordinates,records:[],orders:[]});
      const group=groups.get(key);group.records.push(record);group.orders.push(index+1);
    });
    return [...groups.values()];
  }

  updatePins() {
    if(this.destroyed||!this.engine.ready)return;
    if(!this.map){this.drawFlatPoints();return;}
    const groups=this.selectedGroups().filter(group=>this.map.getBounds().contains(group.coordinates));
    groups.sort((a,b)=>Number(b.records.some(record=>record.id===this.selectedId))-Number(a.records.some(record=>record.id===this.selectedId))||a.orders[0]-b.orders[0]);
    const current=new Set();
    for(const group of groups.slice(0,36)){
      current.add(group.key);
      let marker=this.markers.get(group.key);
      if(!marker){
        const button=document.createElement('button');button.className='ex-pin study-route-pin';button.style.setProperty('--category-color','#B99A65');
        button.innerHTML='<b></b>';
        button.addEventListener('click',event=>{event.stopPropagation();this.actions.pause();const live=this.selectedGroups().find(item=>item.key===group.key);if(live)this.chooseGroup(live);});
        marker=new maplibregl.Marker({element:button,anchor:'center'}).setLngLat(group.coordinates).addTo(this.map);this.markers.set(group.key,marker);
      }
      const button=marker.getElement();
      button.querySelector('b').textContent=group.orders.length>1?group.orders[0]+'+':group.orders[0];
      button.title=group.records.map((record,index)=>`${group.orders[index]}. ${record.name} · ${record.routeLocation.grade}`).join('\n');
      button.setAttribute('aria-label',button.title);
      button.classList.toggle('start',group.orders.includes(1));button.classList.toggle('end',group.orders.includes(this.route.stop_ids.length));
      button.classList.toggle('selected',group.records.some(record=>record.id===this.selectedId));
      button.dataset.precision=group.records[0].routeLocation.grade;
    }
    for(const [key,marker] of this.markers)if(!current.has(key)){marker.remove();this.markers.delete(key);}
    this.map.triggerRepaint();
  }

  chooseGroup(group) {
    this.clusterSequence=(this.clusterSequence||0)+1;
    const key=StudyRoutes.coordinateKey(group.coordinates);
    const screen=coordinates=>this.map?this.map.project(coordinates):this.engine.project(coordinates);
    const anchor=screen(group.coordinates),scale=this.map?1:Math.min(this.engine.svg.clientWidth/this.engine.box[2],this.engine.svg.clientHeight/this.engine.box[3]);
    const matching=(this.records||[]).filter(record=>{
      const point=StudyRoutes.point(record);if(!point)return false;if(StudyRoutes.coordinateKey(point)===key)return true;
      const position=screen(point);return Math.hypot((position.x??position[0])-(anchor.x??anchor[0]),(position.y??position[1])-(anchor.y??anchor[1]))*scale<=24;
    });
    const records=[...new Map([...group.records,...matching].map(record=>[record.id,record])).values()];
    if(records.length===1){this.actions.archive(records[0].id);return;}
    this.actions.choose(records.map(record=>{const order=this.route?.stop_ids.indexOf(record.id);return{id:record.id,label:`${order>=0?'第'+(order+1)+'站':'可加入'} ${record.name} · ${record.routeLocation.grade} · ${record.sheet}第${record.row}行`};}), '选择当前标记附近的来源记录');
  }

  async openCluster(event) {
    if(!this.claimClick(event))return;
    const feature=event.features[0],version=this.libraryVersion,sequence=this.clusterSequence;
    try{
      const leaves=await this.map.getSource('study-library').getClusterLeaves(feature.properties.cluster_id,feature.properties.point_count,0);
      if(this.destroyed||version!==this.libraryVersion||sequence!==this.clusterSequence)return;
      this.actions.choose(leaves.map(item=>{const record=this.byId.get(item.properties.id);return{id:record.id,label:`${record.name} · ${record.routeLocation.grade} · ${record.sheet}第${record.row}行`};}),'选择聚合中的来源记录');
    }catch{}
  }

  drawFlatLines() {
    if(!this.flatGroups||!this.route)return;
    const container=this.flatGroups[1];container.replaceChildren();
    for(const route of [...this.others.filter(item=>item.route_id!==this.route.route_id),this.route]){
      for(const status of ['road','schematic']){
        const segments=route.route_segments.filter(item=>item.geometry&&item.status===status);
        if(!segments.length)continue;
        const path=document.createElementNS(this.engine.svg.namespaceURI,'path');
        path.setAttribute('d',segments.map(segment=>segment.geometry.coordinates.map((point,index)=>(index?'L':'M')+this.engine.project(point).join(',')).join(' ')).join(' '));
        path.setAttribute('fill','none');path.setAttribute('stroke',route.route_id===this.route.route_id?'#D4B16F':'#B99A65');path.setAttribute('stroke-width',route.route_id===this.route.route_id?'2.5':'1.5');path.setAttribute('vector-effect','non-scaling-stroke');
        if(status==='schematic')path.setAttribute('stroke-dasharray','6 5');
        path.classList.add('study-flat-route');container.append(path);
      }
    }
  }

  drawFlatPoints() {
    if(!this.flatGroups)return;
    const svg=this.engine.svg,box=this.engine.box;
    const scale=Math.min(svg.clientWidth/box[2],svg.clientHeight/box[3]);
    const candidates=new Map();
    for(const record of this.records||[]){
      const coordinates=StudyRoutes.point(record);if(!coordinates)continue;
      const projected=this.engine.project(coordinates);
      if(projected[0]<box[0]||projected[0]>box[0]+box[2]||projected[1]<box[1]||projected[1]>box[1]+box[3])continue;
      const key=Math.floor((projected[0]-box[0])*scale/30)+','+Math.floor((projected[1]-box[1])*scale/30);
      if(!candidates.has(key))candidates.set(key,{records:[],coordinates,projected});
      candidates.get(key).records.push(record);
    }
    const ordinary=this.flatGroups[2];ordinary.replaceChildren();
    const add=(container,group,selected=false)=>{
      const wrapper=document.createElementNS(svg.namespaceURI,'g');wrapper.dataset.flatPoint=group.records[0].id;wrapper.setAttribute('role','button');wrapper.setAttribute('tabindex','0');wrapper.style.cursor='pointer';
      const projected=group.projected||this.engine.project(group.coordinates),radius=(selected?12:6)/scale;
      const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',projected[0]);circle.setAttribute('cy',projected[1]);circle.setAttribute('r',radius);circle.setAttribute('fill',selected?'#c4a05c':({村屯级:'#d9bb77',乡镇级:'#63c8c5',区县级:'#6e99c6'}[group.records[0].routeLocation.grade]));circle.setAttribute('stroke',group.records.some(record=>record.id===this.selectedId)?'#ffffff':'#e3cb97');circle.setAttribute('stroke-width',selected?'2':'1');circle.setAttribute('vector-effect','non-scaling-stroke');
      const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=group.records.map(record=>record.name+' · '+record.routeLocation.grade).join('\n');wrapper.append(circle,title);
      if(selected||group.records.length>1){const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x',projected[0]);text.setAttribute('y',projected[1]+4/scale);text.setAttribute('text-anchor','middle');text.setAttribute('font-size',11/scale);text.setAttribute('fill','#fff2d2');text.textContent=selected?(group.orders.length>1?group.orders[0]+'+':group.orders[0]):group.records.length;wrapper.append(text);}
      const select=event=>{event.stopPropagation();this.actions.pause();this.chooseGroup(group);};wrapper.addEventListener('click',select);wrapper.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();select(event);}});container.append(wrapper);
    };
    candidates.forEach(group=>add(ordinary,group));
    const selected=this.flatGroups[3];selected.replaceChildren();
    for(const group of this.selectedGroups()){
      const projected=this.engine.project(group.coordinates);
      if(projected[0]>=box[0]&&projected[0]<=box[0]+box[2]&&projected[1]>=box[1]&&projected[1]<=box[1]+box[3])add(selected,group,true);
    }
  }

  focus(id) {
    const record=this.byId.get(id),coordinates=StudyRoutes.point(record);this.selectedId=id;this.updatePins();
    if(!coordinates){this.actions.notify('该节点暂时待定位，已保留在路线和档案中。');return;}
    if(!this.engine.ready)return;
    const text=record.name+' · '+record.routeLocation.grade+' · '+record.routeLocation.basis;
    const context=document.getElementById('locationContext');context.hidden=false;context.textContent=text;
    if(this.map){
      this.map.stop();this.map.flyTo({center:coordinates,zoom:record.routeLocation.grade==='区县级'?9.2:record.routeLocation.grade==='乡镇级'?11.5:13.6,pitch:55,bearing:-12,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:1400});
    }else{
      const center=this.engine.project(coordinates),size=record.routeLocation.grade==='区县级'?100:35;
      this.engine.box=[center[0]-size/2,center[1]-size/2,size,size];this.engine.applyView();
    }
  }

  fit(all=false) {
    if(!this.engine.ready){this.pendingFit=true;return;}
    const routes=all?[...this.others,this.route]:[this.route];
    const points=routes.filter(Boolean).flatMap(route=>route.stop_ids.map(id=>StudyRoutes.point(this.byId.get(id))).filter(Boolean));
    if(!points.length){this.actions.notify('路线暂时没有可绘制的参考位置。');return;}
    if(this.map){
      const bounds=new maplibregl.LngLatBounds();points.forEach(point=>bounds.extend(point));
      this.map.stop();this.map.fitBounds(bounds,{padding:{top:90,bottom:110,left:55,right:55},maxZoom:12.5,pitch:40,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:1000});
    }else{
      const projected=points.map(point=>this.engine.project(point));const x=Math.min(...projected.map(point=>point[0])),y=Math.min(...projected.map(point=>point[1]));
      const width=Math.max(20,Math.max(...projected.map(point=>point[0]))-x),height=Math.max(20,Math.max(...projected.map(point=>point[1]))-y);
      this.engine.box=[x-width*.2,y-height*.2,width*1.4,height*1.4];this.engine.applyView();
    }
  }

  async snapshot() {
    if(!this.map)return null;
    const deadline=Date.now()+6000;
    while(!this.destroyed&&!this.map.areTilesLoaded()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,200));
    if(this.destroyed||!this.map.areTilesLoaded())return null;
    return new Promise(resolve=>{
      let timer;
      const capture=()=>{clearTimeout(timer);try{resolve(this.map.getCanvas().toDataURL('image/png'));}catch{resolve(null);}};
      this.map.once('render',capture);this.map.triggerRepaint();
      timer=setTimeout(()=>{this.map.off('render',capture);resolve(null);},2000);
    });
  }

  destroy() {
    if(this.destroyed)return;
    this.destroyed=true;this.version++;cancelAnimationFrame(this.frame);cancelAnimationFrame(this.routeFrame);clearInterval(this.flowTimer);
    window.removeEventListener('exhibit-map-ready',this.ready);this.observer?.disconnect();
    this.markers.forEach(marker=>marker.remove());this.markers.clear();
    this.engine.studyMode=false;
    if(this.map&&!this.engine.destroyed){
      for(const [event,layer,callback] of this.handlers){if(layer)this.map.off(event,layer,callback);else this.map.off(event,callback);}
      for(const id of ['study-route-flow','study-route-schematic','study-route-roads','study-route-glow','study-selected','study-library-points','study-library-counts','study-library-clusters','study-boundaries'])if(this.map.getLayer(id))this.map.removeLayer(id);
      for(const id of ['study-route-lines','study-selected','study-library','study-boundaries'])if(this.map.getSource(id))this.map.removeSource(id);
      for(const id of ['heritage-clusters','heritage-counts','context-points'])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility','visible');
      for(const marker of [...this.engine.markers.values(),...this.engine.clusterMarkers.values()])marker.getElement().hidden=false;
      this.engine.updateMarkers();this.engine.updateMessage();
    }
    if(this.flatGroups){this.flatGroups.forEach(group=>group.remove());this.engine.svg.querySelector('#flatPoints').style.display='';this.engine.svg.removeEventListener('pointerdown',this.interrupt);this.engine.svg.removeEventListener('wheel',this.interrupt);}
  }
};
