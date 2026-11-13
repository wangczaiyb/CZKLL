"""Read-only OSRM adapter with bounded disk cache and global request pacing."""
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

CACHE_PATH = Path(os.environ.get('STUDY_ROUTE_CACHE', str(Path(__file__).resolve().parent / '.cache' / 'study-routes' / 'road-cache.json')))
LOCK = threading.Lock()
LAST_REQUEST = 0
FAILED_UNTIL = 0


def segment(start, end):
    global LAST_REQUEST, FAILED_UNTIL
    if any(not math.isfinite(value) for value in start+end) or any(abs(point[0])>180 or abs(point[1])>85 for point in [start,end]):
        raise ValueError('Invalid WGS84 coordinates')
    endpoint = os.environ.get('STUDY_OSRM_URL','https://router.project-osrm.org').rstrip('/')
    coordinates = ';'.join(','.join(f'{value:.6f}' for value in point) for point in [start,end])
    key = endpoint+'|'+coordinates
    with LOCK:
        cache = {}
        if CACHE_PATH.exists():
            try:
                cache = json.loads(CACHE_PATH.read_text(encoding='utf-8'))
            except (ValueError,OSError):
                pass
        previous = cache.get(key)
        if previous and time.time()-previous['cached_at'] < (604800 if previous['status']=='road' else 86400):
            return {**previous,'cached':True}
        if time.time()<FAILED_UNTIL:
            return {'status':'service_unavailable','reason':'道路服务连接暂不可用，保留示意连线'}
        time.sleep(max(0,1.1-(time.monotonic()-LAST_REQUEST)))
        LAST_REQUEST = time.monotonic()
        query = urllib.parse.urlencode({'overview':'simplified','geometries':'geojson','steps':'false','radiuses':'1500;1500'})
        url = endpoint+'/route/v1/driving/'+coordinates+'?'+query
        try:
            request = urllib.request.Request(url,headers={'User-Agent':'KanglianStudyRoutes/1.0 (educational route planner)'})
            with urllib.request.urlopen(request,timeout=12) as response:
                data = json.load(response)
            if data.get('code') in ['NoRoute','NoSegment']:
                result = {'status':'no_road','reason':'路由服务未返回可用道路，保留示意连线'}
            elif data.get('code')=='Ok' and data.get('routes'):
                route = data['routes'][0]
                geometry = route.get('geometry',{})
                if geometry.get('type')!='LineString' or len(geometry.get('coordinates',[]))<2:
                    raise ValueError('Missing road geometry')
                if any(not isinstance(point,list) or len(point)<2 or any(type(value) not in (int,float) or not math.isfinite(value) for value in point[:2]) or abs(point[0])>180 or abs(point[1])>90 for point in geometry['coordinates']):
                    raise ValueError('Invalid road coordinates')
                if any(type(route.get(key)) not in (int,float) or not math.isfinite(route[key]) or route[key]<0 for key in ['distance','duration']):
                    raise ValueError('Invalid route metrics')
                result = {'status':'road','geometry':geometry,'distance_m':route['distance'],'duration_s':route['duration'],
                          'provider':'OSRM / OpenStreetMap','source':endpoint,'waypoints':data.get('waypoints',[]),'crs':'WGS84'}
            else:
                raise ValueError('Routing service rejected request')
        except urllib.error.HTTPError as error:
            try:
                problem=json.load(error)
            except (ValueError,OSError):
                problem={}
            if problem.get('code') in ['NoRoute','NoSegment']:
                result={'status':'no_road','reason':'该相邻节点段缺少可用道路，保留示意连线'}
            else:
                FAILED_UNTIL=time.time()+60
                return {'status':'service_unavailable','reason':'道路服务暂不可用，已保留示意连线'}
        except Exception:
            FAILED_UNTIL = time.time()+60
            return {'status':'service_unavailable','reason':'道路服务连接失败，已保留示意连线'}
        result['cached_at'] = time.time()
        cache[key] = result
        cache = dict(sorted(cache.items(),key=lambda item:item[1]['cached_at'],reverse=True)[:1500])
        CACHE_PATH.parent.mkdir(parents=True,exist_ok=True)
        temporary = CACHE_PATH.with_suffix('.tmp')
        temporary.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        temporary.replace(CACHE_PATH)
        return result
