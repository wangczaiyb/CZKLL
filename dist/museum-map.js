/* Geographic geometry, lighting, picking and camera controls for the homepage. */
window.MuseumMap = class MuseumMap {
  constructor(container, callbacks) {
    this.container=container;
    this.controlAbort = new AbortController();
    this.callbacks=callbacks;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.paused=this.reduced;
    this.view={x:0,y:0,distance:61,elevation:1.02,azimuth:-.08};
    this.overview=true;
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth < 700 ? 1.25 : 1.5));
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.setAttribute('aria-hidden','true');
    container.append(this.renderer.domElement);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(34,1,.1,300);
    this.camera.up.set(0,0,1);
    this.root=new THREE.Group();
    this.scene.add(this.root);
    this.projection=d3.geoMercator().center([104,36]).scale(42).translate([0,0]);
    this.scene.add(new THREE.HemisphereLight(0xffe8c2,0x351722,1.3));
    const keyLight=new THREE.DirectionalLight(0xffddb0,2.1);
    keyLight.position.set(-20,-5,35);this.scene.add(keyLight);
    const rimLight=new THREE.DirectionalLight(0xffb980,1.25);
    rimLight.position.set(25,30,18);this.scene.add(rimLight);
    const texture=new THREE.TextureLoader().load(MUSEUM.terrainTexture,loaded=>{if(!this.destroyed)this.buildTerrain(loaded.image);});
    texture.wrapS=THREE.RepeatWrapping;
    this.terrain=texture;
    this.meshes=[];this.boundaries=[];this.markers=[];this.labels=[];
    this.raycaster=new THREE.Raycaster();
    this.raycaster.params.Line.threshold=.16;
    this.mouse=new THREE.Vector2();
    this.buildLand();this.buildMarkers();this.buildLabels();this.buildParticles();
    this.bindControls();this.resize();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.intersection=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;});
    this.intersection.observe(container);this.visible=true;
    this.render=this.render.bind(this);
    this.render();this.intro();
    this.callbacks.initialized?.();
  }
  xy(coordinates) {
    const point=this.projection(coordinates);
    return [point[0],-point[1]];
  }
  coordinate(place) {
    if(place.coordinateSystem!=='GCJ-02')return place.coordinates;
    const [longitude,latitude]=place.coordinates;
    const x=longitude-105,y=latitude-35;
    let latDelta=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
    latDelta+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
    latDelta+=(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3;
    latDelta+=(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;
    let lonDelta=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
    lonDelta+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
    lonDelta+=(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3;
    lonDelta+=(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;
    const rad=latitude/180*Math.PI;
    const magic=1-.006693421622965943*Math.sin(rad)**2;
    latDelta=latDelta*180/((6378245*(1-.006693421622965943))/(magic*Math.sqrt(magic))*Math.PI);
    lonDelta=lonDelta*180/(6378245/Math.sqrt(magic)*Math.cos(rad)*Math.PI);
    return [longitude-lonDelta,latitude-latDelta];
  }
  shape(polygon) {
    const rings=polygon.map(ring=>ring.map(point=>new THREE.Vector2(...this.xy(point))));
    const shape=new THREE.Shape(rings[0]);
    rings.slice(1).forEach(ring=>shape.holes.push(new THREE.Path(ring)));
    return shape;
  }
  addFeature(feature,highlight,region) {
    const geometry=feature.geometry;
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    const height=highlight?.48:.24;
    const name=feature.properties.name;
    if(!name)return;
    const top=new THREE.MeshStandardMaterial({color:highlight?0x9b4f3b:0x60393d,metalness:.26,roughness:.68,bumpMap:this.terrain,bumpScale:.17});
    const side=new THREE.MeshStandardMaterial({color:highlight?0x6c302b:0x331b26,metalness:.22,roughness:.7});
    const featureGroup=new THREE.Group();
    featureGroup.userData={region,name,highlight,feature};
    const attributes=['position','normal','uv'];
    const buckets=[{position:[],normal:[],uv:[]},{position:[],normal:[],uv:[]}];
    const borderPoints=[];
    polygons.forEach(polygon=>{
      if(polygon[0].length<4)return;
      const extrusion=new THREE.ExtrudeGeometry(this.shape(polygon),{depth:height,bevelEnabled:false,steps:1,curveSegments:1});
      const position=extrusion.getAttribute('position');
      const uv=extrusion.getAttribute('uv');
      for(let index=0;index<position.count;index++){
        const coord=this.projection.invert([position.getX(index),-position.getY(index)]);
        uv.setXY(index,(coord[0]+180)/360,(coord[1]+90)/180);
      }
      uv.needsUpdate=true;
      extrusion.groups.forEach(group=>attributes.forEach(name=>{
        const attribute=extrusion.getAttribute(name);
        buckets[group.materialIndex][name].push(attribute.array.slice(group.start*attribute.itemSize,(group.start+group.count)*attribute.itemSize));
      }));
      extrusion.dispose();
      polygon.forEach(ring=>{
        for(let index=0;index<ring.length-1;index++){
          const a=this.xy(ring[index]),b=this.xy(ring[index+1]);
          borderPoints.push(new THREE.Vector3(...a,height+.012),new THREE.Vector3(...b,height+.012));
        }
      });
    });
    const merged=new THREE.BufferGeometry();
    attributes.forEach(name=>{
      const chunks=buckets.flatMap(bucket=>bucket[name]);
      const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0);
      const array=new Float32Array(length);let offset=0;
      chunks.forEach(chunk=>{array.set(chunk,offset);offset+=chunk.length;});
      merged.setAttribute(name,new THREE.BufferAttribute(array,name==='uv'?2:3));
    });
    const topCount=buckets[0].position.reduce((sum,chunk)=>sum+chunk.length,0)/3;
    const sideCount=buckets[1].position.reduce((sum,chunk)=>sum+chunk.length,0)/3;
    merged.addGroup(0,topCount,0);merged.addGroup(topCount,sideCount,1);
    const mesh=new THREE.Mesh(merged,[top,side]);
    mesh.userData=featureGroup.userData;featureGroup.add(mesh);this.meshes.push(mesh);
    const borderGeometry=new THREE.BufferGeometry().setFromPoints(borderPoints);
    const material=new THREE.LineBasicMaterial({color:highlight?0xf6ce8b:0xb38a68,transparent:true,opacity:highlight?.92:.4});
    const line=new THREE.LineSegments(borderGeometry,material);line.userData={region,highlight,height};featureGroup.add(line);
    if(!this.allBorders)this.allBorders=[];
    this.allBorders.push(line);
    if(highlight)this.boundaries.push(line);
    this.root.add(featureGroup);
    return featureGroup;
  }
  buildLand() {
    const keys={'黑龙江省':'黑龙江','吉林省':'吉林','辽宁省':'辽宁'};
    MUSEUM_GEOMETRY.china.features.forEach(feature=>this.addFeature(feature,Boolean(keys[feature.properties.name]),keys[feature.properties.name]||feature.properties.name));
    MUSEUM_GEOMETRY.east.features.forEach(feature=>this.addFeature(feature,true,'内蒙古'));
  }
  buildTerrain(image) {
    const textureCanvas=document.createElement('canvas');textureCanvas.width=image.width;textureCanvas.height=image.height;
    const textureContext=textureCanvas.getContext('2d',{willReadFrequently:true});textureContext.drawImage(image,0,0);
    const elevation=textureContext.getImageData(0,0,image.width,image.height).data;
    const extent={left:-25,right:25,bottom:-25,top:21};
    const mask=document.createElement('canvas');mask.width=1024;mask.height=1024;
    const context=mask.getContext('2d',{willReadFrequently:true});
    const regionNames=[];
    const draw=(feature,highlight,region)=>{
      if(!feature.properties.name)return;
      regionNames.push(region);
      const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
      context.fillStyle=`rgb(${highlight?255:85},${regionNames.length*5},0)`;
      polygons.forEach(polygon=>{
        context.beginPath();
        polygon.forEach(ring=>ring.forEach((coordinates,index)=>{
          const xy=this.xy(coordinates);
          const x=(xy[0]-extent.left)/(extent.right-extent.left)*1024;
          const y=(extent.top-xy[1])/(extent.top-extent.bottom)*1024;
          index===0?context.moveTo(x,y):context.lineTo(x,y);
        }));
        context.closePath();context.fill('evenodd');
      });
    };
    const projectNames={'黑龙江省':'黑龙江','吉林省':'吉林','辽宁省':'辽宁'};
    MUSEUM_GEOMETRY.china.features.forEach(feature=>draw(feature,Boolean(projectNames[feature.properties.name]),projectNames[feature.properties.name]||feature.properties.name));
    MUSEUM_GEOMETRY.east.features.forEach(feature=>draw(feature,true,'内蒙古'));
    const maskPixels=context.getImageData(0,0,1024,1024).data;
    this.regionAt=(x,y)=>{
      const mx=THREE.MathUtils.clamp(Math.floor((x-extent.left)/50*1024),0,1023);
      const my=THREE.MathUtils.clamp(Math.floor((extent.top-y)/46*1024),0,1023);
      return regionNames[Math.round(maskPixels[(my*1024+mx)*4+1]/5)-1];
    };
    const sample=(x,y)=>{
      const coordinates=this.projection.invert([x,-y]);
      const tx=THREE.MathUtils.clamp(Math.floor((coordinates[0]+180)/360*image.width),0,image.width-1);
      const ty=THREE.MathUtils.clamp(Math.floor((90-coordinates[1])/180*image.height),0,image.height-1);
      return elevation[(ty*image.width+tx)*4]/255;
    };
    this.sampleElevation=sample;
    const compact=this.container.clientWidth<700;
    const geometry=new THREE.PlaneGeometry(50,46,compact?132:238,compact?122:218);
    geometry.translate(0,-2,0);
    const position=geometry.getAttribute('position');
    const colors=[],inside=[];
    const dark=new THREE.Color(0x62373d),highlight=new THREE.Color(0xa06441);
    for(let index=0;index<position.count;index++){
      const x=position.getX(index),y=position.getY(index);
      const mx=THREE.MathUtils.clamp(Math.floor((x-extent.left)/50*1024),0,1023);
      const my=THREE.MathUtils.clamp(Math.floor((extent.top-y)/46*1024),0,1023);
      const pixel=(my*1024+mx)*4;
      const active=maskPixels[pixel]>200;
      inside.push(maskPixels[pixel+3]>0);
      const value=sample(x,y);
      position.setZ(index,(active?.49:.25)+value*2.1);
      const color=(active?highlight:dark).clone().multiplyScalar(.78+value*.7);
      colors.push(color.r,color.g,color.b);
    }
    const indices=[];
    const original=geometry.index.array;
    for(let index=0;index<original.length;index+=3){const a=original[index],b=original[index+1],c=original[index+2];if(inside[a]&&inside[b]&&inside[c])indices.push(a,b,c);}
    geometry.setIndex(indices);geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.16,side:THREE.FrontSide,transparent:true});
    this.terrainMesh=new THREE.Mesh(geometry,material);this.root.add(this.terrainMesh);
    if(this.timeline&&this.timeline.time()<2)gsap.fromTo(material,{opacity:0},{opacity:1,duration:this.reduced?0:1.1,ease:'power2.out'});
    this.allBorders.forEach(line=>{
      const points=line.geometry.attributes.position;
      for(let index=0;index<points.count;index++)points.setZ(index,line.userData.height+.025+sample(points.getX(index),points.getY(index))*2.1);
      points.needsUpdate=true;
    });
    this.markers.forEach(marker=>{marker.group.position.z=.55+sample(marker.group.position.x,marker.group.position.y)*2.1;});
  }
  pinGeometry() {
    const shape=new THREE.Shape();
    shape.moveTo(0,0);
    shape.bezierCurveTo(-.12,.25,-.4,.6,-.4,.85);
    shape.bezierCurveTo(-.4,1.4,.4,1.4,.4,.85);
    shape.bezierCurveTo(.4,.6,.12,.25,0,0);
    const hole=new THREE.Path();hole.absarc(0,.88,.18,0,Math.PI*2,true);shape.holes.push(hole);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.04,curveSegments:10});
    geometry.rotateX(Math.PI/2);
    return geometry;
  }
  buildMarkers() {
    const pinGeometry=this.pinGeometry();
    const gold=new THREE.MeshStandardMaterial({color:0xf3cd83,metalness:.62,roughness:.25,emissive:0x8b5c20,emissiveIntensity:.24});
    const hitLayer=document.createElement('div');hitLayer.className='landmark-hit-layer';this.container.append(hitLayer);
    MUSEUM.featured.forEach((place,index)=>{
      const group=new THREE.Group();
      const xy=this.xy(this.coordinate(place));
      group.position.set(xy[0],xy[1],.52);
      group.userData={site:place};
      const pin=new THREE.Mesh(pinGeometry,gold);pin.position.z=.18;group.add(pin);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.43,.018,6,44),new THREE.MeshBasicMaterial({color:0xf0c785,transparent:true,opacity:.65}));
      ring.position.z=.01;group.add(ring);
      const pulse=new THREE.Mesh(new THREE.RingGeometry(.37,.405,40),new THREE.MeshBasicMaterial({color:0xe8bc74,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));
      pulse.position.z=.02;group.add(pulse);
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.04,.15,2.5,10,1,true),new THREE.MeshBasicMaterial({color:0xf9dfa7,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false}));
      beam.rotation.x=Math.PI/2;beam.position.z=1.25;group.add(beam);
      this.root.add(group);
      const button=document.createElement('button');button.className='landmark-hit';button.dataset.site=place.key;button.setAttribute('aria-label',place.name);button.title=place.name;
      button.onpointerenter=()=>this.callbacks.hover(place,this.screenPosition(group.position));
      button.onpointerleave=()=>this.callbacks.leave();
      button.onfocus=()=>this.callbacks.hover(place,this.screenPosition(group.position));
      button.onblur=()=>this.callbacks.leave();
      button.onclick=event=>{event.stopPropagation();this.callbacks.select(place);};
      hitLayer.append(button);
      this.markers.push({place,group,pin,pulse,index,button});
    });
  }
  buildLabels() {
    const names=[['黑龙江',[129.3,49.4]],['吉林',[127.1,44.7]],['辽宁',[121.7,40]],['内蒙古东部',[118.6,46.4]],['中国',[102.8,34.8]]];
    const layer=document.getElementById('mapLabels');
    names.forEach(([name,coordinates])=>{
      const element=document.createElement('div');element.className=name==='中国'?'country-map-label':'province-map-label';
      element.textContent=name;layer.append(element);
      const xy=this.xy(coordinates);
      this.labels.push({element,position:new THREE.Vector3(xy[0],xy[1],.55)});
    });
  }
  buildParticles() {
    const coordinates=[];
    let seed=281;
    const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    for(let index=0;index<105;index++)coordinates.push((random()-.5)*75,(random()-.5)*42,random()*8-2);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));
    const material=new THREE.PointsMaterial({color:0xdfbd80,size:.07,transparent:true,opacity:.46,depthWrite:false});
    this.particles=new THREE.Points(geometry,material);this.scene.add(this.particles);
  }
  bindControls() {
    const listen = (target,type,handler,options={}) => target.addEventListener(type,handler,{...options,signal:this.controlAbort.signal});
    const canvas=this.renderer.domElement;
    let drag=null;
    listen(canvas,'pointerdown',event=>{gsap.killTweensOf(this.view);drag={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};canvas.setPointerCapture(event.pointerId);});
    listen(canvas,'pointermove',event=>{
      if(drag){this.view.azimuth-=(event.clientX-drag.x)*.004;this.view.elevation=THREE.MathUtils.clamp(this.view.elevation+(event.clientY-drag.y)*.003,.42,1.49);drag.x=event.clientX;drag.y=event.clientY;return;}
      const hit=this.pick(event);
      const province=hit?.object?.userData;
      if(this.hoverMesh && this.hoverMesh!==hit?.object)this.hoverMesh.material[0].emissive.setHex(0);
      this.hoverMesh=hit?.object;
      if(this.hoverMesh)this.hoverMesh.material[0].emissive.setHex(0x30160b);
      if(this.hoverBorder){this.hoverBorder.material.color.setHex(this.hoverBorder.userData.highlight?0xf6ce8b:0xb38a68);this.hoverBorder.material.opacity=this.hoverBorder.userData.highlight?.92:.4;}
      this.hoverBorder=this.allBorders.find(border=>border.userData.region===province?.region);
      if(this.hoverBorder){this.hoverBorder.material.color.setHex(0xffe7ad);this.hoverBorder.material.opacity=1;}
      canvas.style.cursor=province||this.pickRoute()?'pointer':'grab';
    });
    listen(canvas,'pointerup',event=>{
      if(drag && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6){
        const hit=this.pick(event);
        if(this.pickRoute())this.route(MUSEUM.routes.find(route=>route.id===this.activeRoute),true);
        else if(hit)this.callbacks.openRegion(hit.object.userData.region);
      }
      drag=null;
    });
    listen(canvas,'pointercancel',()=>drag=null);
    listen(canvas,'wheel',event=>{event.preventDefault();this.zoom(Math.exp(event.deltaY*.001));},{passive:false});
    listen(this.container,'keydown',event=>{
      if(event.key==='+'||event.key==='='){event.preventDefault();this.zoom(.8);}
      if(event.key==='-'){event.preventDefault();this.zoom(1.2);}
      if(event.key==='Home'){event.preventDefault();this.reset();}
      if(event.key==='ArrowLeft')this.view.x-=1;
      if(event.key==='ArrowRight')this.view.x+=1;
      if(event.key==='ArrowUp')this.view.y+=1;
      if(event.key==='ArrowDown')this.view.y-=1;
    });
    listen(canvas,'webglcontextlost',event=>{event.preventDefault();this.callbacks.error();});
  }
  pick(event) {
    const bounds=this.container.getBoundingClientRect();
    this.mouse.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height*2-1));
    this.raycaster.setFromCamera(this.mouse,this.camera);
    if(this.terrainMesh){
      const terrainHit=this.raycaster.intersectObject(this.terrainMesh,false)[0];
      if(terrainHit){
        const region=this.regionAt(terrainHit.point.x,terrainHit.point.y);
        const mesh=this.meshes.find(mesh=>mesh.userData.region===region);
        if(mesh)return {...terrainHit,object:mesh};
      }
    }
    return this.raycaster.intersectObjects(this.meshes,false)[0];
  }
  pickRoute() {return this.routeGroup&&this.raycaster.intersectObjects(this.routeGroup.children,false)[0];}
  zoom(factor) {
    this.overview=false;
    gsap.killTweensOf(this.view);
    gsap.to(this.view,{distance:THREE.MathUtils.clamp(this.view.distance*factor,5,100),duration:.45,ease:'power2.out'});
  }
  focusRegion(region) {
    const meshes=this.meshes.filter(mesh=>mesh.userData.region===region);
    if(!meshes.length)return;
    this.overview=false;
    const bounds=new THREE.Box3();meshes.forEach(mesh=>bounds.expandByObject(mesh));
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    const distance=THREE.MathUtils.clamp(Math.max(size.x,size.y)*2.2,8,68);
    gsap.killTweensOf(this.view);
    gsap.to(this.view,{x:center.x,y:center.y,distance,elevation:1.16,azimuth:0,duration:this.reduced?0:1.35,ease:'power3.inOut'});
    this.callbacks.focus(region);
  }
  focusNortheast() {
    this.overview=false;
    const target=this.xy([124.7,45.8]);
    gsap.killTweensOf(this.view);
    gsap.to(this.view,{x:target[0],y:target[1],distance:32,elevation:1.13,azimuth:0,duration:this.reduced?0:1.4,ease:'power3.inOut'});
    this.callbacks.focus('东北全域');
  }
  focusRoute(route) {
    this.overview=false;
    const bounds=new THREE.Box3();
    route.stops.forEach(key=>{const place=MUSEUM.featured.find(place=>place.key===key);const point=this.xy(this.coordinate(place));bounds.expandByPoint(new THREE.Vector3(...point,0));});
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    gsap.killTweensOf(this.view);
    gsap.to(this.view,{x:center.x,y:center.y,distance:THREE.MathUtils.clamp(Math.max(size.x,size.y)*3,6,40),elevation:1.16,azimuth:0,duration:this.reduced?0:1.35,ease:'power3.inOut'});
  }
  reset() {
    this.overview=true;
    gsap.killTweensOf(this.view);
    gsap.to(this.view,{x:0,y:0,distance:this.container.clientWidth<650?86:61,elevation:1.02,azimuth:-.08,duration:this.reduced?0:1.4,ease:'power3.inOut'});
    this.callbacks.focus('中国全景');
  }
  route(route,animate=true,duration=2.5) {
    if(this.routeGroup){this.root.remove(this.routeGroup);this.routeGroup.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});}
    this.routeGroup=new THREE.Group();this.root.add(this.routeGroup);
    const places=route.stops.map(key=>MUSEUM.featured.find(place=>place.key===key));
    const points=[];
    places.slice(0,-1).forEach((place,index)=>{
      const a=this.xy(this.coordinate(place)),b=this.xy(this.coordinate(places[index+1]));
      const start=new THREE.Vector3(...a,.64),end=new THREE.Vector3(...b,.64);
      const middle=start.clone().lerp(end,.5);middle.z+=Math.min(start.distanceTo(end)*.18,.8);
      const curve=new THREE.QuadraticBezierCurve3(start,middle,end);
      points.push(...curve.getPoints(70));
    });
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xfbe2a8,transparent:true,opacity:.94}));
    this.routeGroup.add(line);
    const progress={value:animate?0:points.length};
    geometry.setDrawRange(0,progress.value);
    this.routeTween?.kill();
    this.routeTween=gsap.to(progress,{value:points.length,duration:this.reduced?0:duration,ease:'none',onUpdate:()=>geometry.setDrawRange(0,Math.ceil(progress.value))});
    this.activeRoute=route.id;
  }
  intro() {
    this.timeline?.kill();
    this.reset();
    this.markers.forEach(marker=>marker.group.scale.setScalar(.001));
    this.boundaries.forEach(line=>line.geometry.setDrawRange(0,0));
    this.root.scale.z=.015;
    const duration=this.reduced?.01:1;
    this.timeline=gsap.timeline({onComplete:()=>this.callbacks.ready()});
    const landMaterials=this.meshes.flatMap(mesh=>mesh.material);
    landMaterials.forEach(material=>{material.transparent=true;material.opacity=0;});
    if(this.terrainMesh){this.terrainMesh.material.opacity=0;landMaterials.push(this.terrainMesh.material);}
    this.timeline.to(landMaterials,{opacity:1,duration:1.4*duration,ease:'power2.out'},.35*duration);
    const normalBorders=this.allBorders.filter(line=>!line.userData.highlight).map(line=>line.material);
    this.timeline.fromTo(normalBorders,{opacity:0},{opacity:.4,duration:1.2*duration},.65*duration);
    this.timeline.to(this.root.scale,{z:1,duration:1.6*duration,ease:'power3.out'},.35*duration);
    ['黑龙江','吉林','辽宁','内蒙古'].forEach((region,index)=>{
      const progress={value:0};
      this.timeline.to(progress,{value:1,duration:.8*duration,ease:'power1.inOut',onUpdate:()=>this.boundaries.filter(line=>line.userData.region===region).forEach(line=>line.geometry.setDrawRange(0,Math.ceil(line.geometry.attributes.position.count*progress.value)))},(1.25+index*.38)*duration);
    });
    this.markers.forEach((marker,index)=>this.timeline.to(marker.group.scale,{x:1,y:1,z:1,duration:.8*duration,ease:'back.out(1.5)'},(2.75+index*.12)*duration));
    this.timeline.call(()=>this.route(MUSEUM.routes[0],true,1.6),null,3.3*duration);
    this.timeline.fromTo('.hero-heading,.hero-data,.hero-region-picker,.hero-bottom',{opacity:0,y:14},{opacity:1,y:0,duration:.9*duration,stagger:.1,ease:'power2.out'},3.6*duration);
    this.timeline.to({}, {duration:.05},5*duration);
  }
  screenPosition(position) {
    const point=position.clone().applyMatrix4(this.root.matrixWorld).project(this.camera);
    return {x:(point.x+1)*this.width/2,y:(1-point.y)*this.height/2,visible:point.z<1&&Math.abs(point.x)<1.1&&Math.abs(point.y)<1.2};
  }
  resize() {
    const previousWidth=this.width;
    this.width=this.container.clientWidth;this.height=this.container.clientHeight;
    if(!this.width||!this.height)return;
    this.renderer.setSize(this.width,this.height,false);
    this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
    if(this.overview&&this.width!==previousWidth){gsap.killTweensOf(this.view);this.view.distance=this.width<650?86:61;}
  }
  destroy() {
    if(this.destroyed)return;
    this.destroyed=true;
    cancelAnimationFrame(this.frame);
    this.controlAbort.abort();
    this.observer?.disconnect();this.intersection?.disconnect();
    this.timeline?.kill();this.routeTween?.kill();
    gsap.killTweensOf(this.view);
    const materials=new Set(), geometries=new Set(), textures=new Set();
    this.scene.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      const values=Array.isArray(object.material)?object.material:[object.material];
      values.filter(Boolean).forEach(material=>{materials.add(material);Object.values(material).forEach(value=>{if(value?.isTexture)textures.add(value);});});
    });
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());
    this.terrain?.dispose();this.renderer.dispose();
    this.renderer.domElement.remove();
    this.markers.forEach(marker=>marker.button.remove());this.labels.forEach(label=>label.element.remove());
  }
  render(time=0) {
    if(this.destroyed)return;
    this.frame=requestAnimationFrame(this.render);
    if(this.destroyed||!this.visible||document.hidden)return;
    const viewSignature=[this.view.x,this.view.y,this.view.distance,this.view.elevation,this.view.azimuth,this.hoverMesh?.uuid,this.width,this.height].join('|');
    if(this.paused && this.timeline?.progress()===1 && this.lastViewSignature===viewSignature)return;
    this.lastViewSignature=viewSignature;
    if(time-(this.lastRenderTime || 0)<1000/30)return;
    this.lastRenderTime=time;
    const {x,y,distance,elevation,azimuth}=this.view;
    const horizontal=distance*Math.cos(elevation);
    this.camera.position.set(x+Math.sin(azimuth)*horizontal,y-Math.cos(azimuth)*horizontal,distance*Math.sin(elevation));
    this.camera.lookAt(x,y,0);this.camera.updateMatrixWorld();this.root.updateMatrixWorld(true);
    const markerScale=THREE.MathUtils.clamp(distance/61*1.3,.14,1.6);
    this.markers.forEach(marker=>{
      const visible=marker.place.primary||distance<12;
      marker.group.visible=visible;
      marker.button.hidden=!visible;
      if(this.timeline?.progress()===1)marker.group.scale.setScalar(markerScale);
      if(!this.paused){const phase=(time*.0003+marker.index*.16)%1;marker.pulse.scale.setScalar(1+phase*1.6);marker.pulse.material.opacity=(1-phase)*.38;marker.pin.position.z=.18+Math.sin(time*.0013+marker.index)*.045;}
      const anchor=marker.group.position.clone();anchor.z+=.95*markerScale;
      const screen=this.screenPosition(anchor);
      marker.button.style.transform=`translate(${screen.x}px,${screen.y}px) translate(-50%,-70%)`;
      marker.button.style.display=visible&&screen.visible?'':'none';
    });
    this.labels.forEach(label=>{const screen=this.screenPosition(label.position);label.element.style.transform=`translate(${screen.x}px,${screen.y}px) translate(-50%,-50%)`;label.element.hidden=!screen.visible;});
    if(!this.paused)this.particles.rotation.z=Math.sin(time*.00004)*.018;
    this.renderer.render(this.scene,this.camera);
  }
};
