/* Route identities always reference original source-record IDs. */
(() => {
  const clone = value => structuredClone(value);
  const uuid = () => globalThis.crypto?.randomUUID?.() || 'route-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const point = record => record?.routeLocation?.coordinates || null;
  const coordinateKey = coordinates => coordinates.map(value=>Number(value).toFixed(6)).join(',');
  const segmentKey = (a,b) => a.id + '→' + b.id;
  const distance = (a,b) => {
    const radians = value => value*Math.PI/180;
    const latitude = radians(b[1]-a[1]), longitude = radians(b[0]-a[0]);
    const term = Math.sin(latitude/2)**2 + Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(longitude/2)**2;
    return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(term)));
  };
  const empty = () => ({type:'FeatureCollection',features:[]});
  const validLine = geometry => geometry?.type==='LineString'&&Array.isArray(geometry.coordinates)&&geometry.coordinates.length>=2&&geometry.coordinates.every(point=>Array.isArray(point)&&point.length>=2&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90);
  const touch = route => { route.updated_at=new Date(Math.max(Date.now(),Date.parse(route.updated_at||0)+1)).toISOString(); };

  class Repository {
    constructor() { this.writer = uuid(); this.database = null; this.mode = 'IndexedDB'; }

    async open() {
      try {
        this.database = await new Promise((resolve,reject) => {
          const request = indexedDB.open('kanglian-study-routes',1);
          request.onupgradeneeded = () => {
            for (const [name,key] of [['routes','route_id'],['segments','key'],['settings','key']]) request.result.createObjectStore(name,{keyPath:key});
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('路线存储被另一个页面占用，请关闭旧页面后重试'));
        });
        this.database.onversionchange = () => this.database.close();
      } catch {
        this.mode = 'localStorage';
        const testKey = 'kanglian-study-storage-test';
        localStorage.setItem(testKey,'1'); localStorage.removeItem(testKey);
      }
      return this;
    }

    async all() {
      if (!this.database) {
        const rows = [];
        for (let index=0;index<localStorage.length;index++) {
          const key = localStorage.key(index);
          if (key.startsWith('kanglian-study-route:')) {
            try { rows.push(JSON.parse(localStorage.getItem(key))); } catch {}
          }
        }
        return rows.filter(row=>!row.deleted);
      }
      return new Promise((resolve,reject) => {
        const request = this.database.transaction('routes').objectStore('routes').getAll();
        request.onsuccess=()=>resolve(request.result.filter(row=>!row.deleted));request.onerror=()=>reject(request.error);
      });
    }

    async save(route) {
      const snapshot = clone(route);
      snapshot.writer_id = this.writer;
      if (!this.database) {
        const key = 'kanglian-study-route:'+route.route_id;
        const previous = JSON.parse(localStorage.getItem(key)||'null');
        if (previous?.deleted) throw new Error('ROUTE_DELETED');
        if (previous && previous.revision>snapshot.revision && previous.writer_id!==this.writer) throw new Error('ROUTE_CONFLICT');
        snapshot.revision = Math.max(snapshot.revision||0,previous?.revision||0)+1;
        try { localStorage.setItem(key,JSON.stringify(snapshot)); }
        catch(error) {
          if(error.name!=='QuotaExceededError')throw error;
          snapshot.route_geometry=empty();snapshot.route_segments=[];snapshot.geometry_cache_omitted=true;
          localStorage.setItem(key,JSON.stringify(snapshot));
        }
        return snapshot;
      }
      return new Promise((resolve,reject) => {
        const transaction = this.database.transaction('routes','readwrite');
        const store = transaction.objectStore('routes');
        const request = store.get(snapshot.route_id);
        let conflict = false,deleted=false;
        request.onsuccess = () => {
          const previous = request.result;
          if(previous?.deleted){deleted=true;transaction.abort();return;}
          if (previous && previous.revision>snapshot.revision && previous.writer_id!==this.writer) {
            conflict = true; transaction.abort(); return;
          }
          snapshot.revision = Math.max(snapshot.revision||0,previous?.revision||0)+1;
          store.put(snapshot);
        };
        transaction.oncomplete=()=>resolve(snapshot);
        transaction.onabort=()=>reject(new Error(deleted?'ROUTE_DELETED':conflict?'ROUTE_CONFLICT':'路线保存失败'));
        transaction.onerror=()=>reject(transaction.error);
      });
    }

    async remove(id) {
      localStorage.removeItem('kanglian-study-draft:'+id);
      if (!this.database) { localStorage.setItem('kanglian-study-route:'+id,JSON.stringify({route_id:id,deleted:true,writer_id:this.writer,updated_at:new Date().toISOString()})); return; }
      return new Promise((resolve,reject) => {
        const transaction = this.database.transaction('routes','readwrite');
        const store=transaction.objectStore('routes'),request=store.get(id);
        request.onsuccess=()=>store.put({route_id:id,deleted:true,revision:(request.result?.revision||0)+1,writer_id:this.writer,updated_at:new Date().toISOString()});
        transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
      });
    }

    async cached(key) {
      if (!this.database) return null;
      return new Promise(resolve => {
        const request = this.database.transaction('segments').objectStore('segments').get(key);
        request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);
      });
    }

    async cache(key,value) {
      if (!this.database) return;
      return new Promise(resolve => {
        const transaction=this.database.transaction('segments','readwrite');
        const store=transaction.objectStore('segments');
        store.put({key,...value,cached_at:Date.now()});
        const count=store.count();
        count.onsuccess=()=>{if(count.result>1500){let remaining=count.result-1500;const cursor=store.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item&&remaining-->0){item.delete();item.continue();}};}};
        transaction.oncomplete=resolve;transaction.onerror=resolve;
      });
    }

    draft(route) {
      try {
        const snapshot = {...route,route_geometry:null,route_segments:[]};
        localStorage.setItem('kanglian-study-draft:'+route.route_id,JSON.stringify(snapshot));
        localStorage.setItem('kanglian-study-active',route.route_id);
      } catch {}
    }
  }

  function createRoute(name='我的研学路线') {
    const now=new Date().toISOString();
    return {route_id:uuid(),route_name:name,route_description:'',route_theme:'',route_type:'road',province_scope:[],stop_ids:[],stop_order:[],route_geometry:empty(),route_segments:[],route_status:'draft',created_at:now,updated_at:now,revision:0};
  }

  function normalize(route,byId) {
    const record = {...createRoute(),...clone(route)};
    record.stop_ids = [...new Set((Array.isArray(route.stop_ids)?route.stop_ids:[]).filter(id=>typeof id==='string'))];
    record.stop_order = [...record.stop_ids];
    record.route_name = String(record.route_name||'未命名路线');
    record.route_description = String(record.route_description||'');
    record.route_segments = Array.isArray(record.route_segments)?record.route_segments.filter(item=>item&&typeof item.key==='string'):[];
    record.unknown_stop_ids=record.stop_ids.filter(id=>!byId.has(id));
    return record;
  }

  function reconcile(route,byId) {
    const old = new Map(route.route_segments.map(item=>[item.key,item]));
    const stops=route.stop_ids.map(id=>byId.get(id)||{id,name:'来源记录暂不可用',routeLocation:{coordinates:null,grade:'待定位'}});
    route.province_scope=[...new Set(stops.map(record=>record.province).filter(Boolean))];
    route.stop_order=[...route.stop_ids];
    route.route_segments=[];
    for(let index=0;index<stops.length-1;index++) {
      const a=stops[index],b=stops[index+1],start=point(a),end=point(b),key=segmentKey(a,b);
      const fingerprint=start&&end?coordinateKey(start)+';'+coordinateKey(end):'unavailable';
      const previous=old.get(key);
      const previousRoadValid=previous?.status!=='road'||(Number.isFinite(previous.distance_m)&&previous.distance_m>=0&&Number.isFinite(previous.duration_s)&&previous.duration_s>=0);
      if(previous?.fingerprint===fingerprint && validLine(previous.geometry) && previousRoadValid && (route.route_type==='road'||previous.status!=='road')) {
        route.route_segments.push({...previous,index});continue;
      }
      route.route_segments.push({key,index,from_id:a.id,to_id:b.id,fingerprint,status:start&&end?'schematic':'unavailable',
        geometry:start&&end?{type:'LineString',coordinates:[start,end]}:null,
        schematic_distance_m:start&&end?distance(start,end):null,distance_m:null,duration_s:null,
        note:start&&end?'研学参考位置示意连线':'相邻节点缺少位置，保留路线断点'});
    }
    route.route_geometry={type:'FeatureCollection',features:route.route_segments.filter(item=>item.geometry).map(item=>({type:'Feature',geometry:item.geometry,properties:{route_id:route.route_id,index:item.index,from_id:item.from_id,to_id:item.to_id,status:item.status}}))};
    route.route_status=route.route_segments.some(item=>item.status==='unavailable')?'partial':route.stop_ids.length>1?'ready':'draft';
    return route;
  }

  function statistics(route,byId) {
    const rows=route.stop_ids.map(id=>byId.get(id)).filter(Boolean);
    const grades={村屯级:0,乡镇级:0,区县级:0,待定位:route.stop_ids.length-rows.length};
    rows.forEach(row=>grades[row.routeLocation.grade]++);
    const roads=route.route_segments.filter(item=>item.status==='road');
    const lines=route.route_segments.filter(item=>item.status==='schematic');
    const roadDistance=roads.reduce((sum,item)=>sum+(item.distance_m||0),0),schematicDistance=lines.reduce((sum,item)=>sum+(item.schematic_distance_m||0),0);
    return {total:route.stop_ids.length,provinces:new Set(rows.map(row=>row.province)).size,cities:new Set(rows.map(row=>row.province+'|'+row.city)).size,
      pictures:rows.filter(row=>row.image).length,vr:rows.filter(row=>row.vrUrl).length,grades,
      roadDistance,roadDuration:roads.reduce((sum,item)=>sum+(item.duration_s||0),0),
      schematicDistance,geometryDistance:roads.length||lines.length?roadDistance+schematicDistance:null,roadSegments:roads.length,schematicSegments:lines.length,
      unavailable:route.route_segments.filter(item=>item.status==='unavailable').length};
  }

  function suggest(route,byId,type) {
    const ids=[...route.stop_ids], index=new Map(ids.map((id,position)=>[id,position]));
    if(type==='distance') {
      const remaining=ids.filter(id=>point(byId.get(id))),ordered=[];
      if(remaining.length)ordered.push(remaining.shift());
      while(remaining.length) {
        const start=point(byId.get(ordered.at(-1)));let best=0,bestDistance=Infinity;
        for(let position=0;position<remaining.length;position++) {
          const candidate=distance(start,point(byId.get(remaining[position])));
          if(candidate<bestDistance){best=position;bestDistance=candidate;}
        }
        ordered.push(remaining.splice(best,1)[0]);
      }
      return [...ordered,...ids.filter(id=>!point(byId.get(id)))];
    }
    return ids.sort((a,b)=>{
      const left=byId.get(a),right=byId.get(b);
      if(type==='year')return (left?.historyYears[0]??Infinity)-(right?.historyYears[0]??Infinity)||index.get(a)-index.get(b);
      const value=row=>type==='province'?row?.province||'':(row?.province||'')+' '+(row?.city||'');
      return value(left).localeCompare(value(right),'zh-CN')||index.get(a)-index.get(b);
    });
  }

  window.StudyRoutes={Repository,createRoute,normalize,reconcile,statistics,suggest,point,coordinateKey,segmentKey,uuid,distance,empty,clone,touch,validLine};
})();
