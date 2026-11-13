"""Build four exhibits with coordinate provenance and explicit unresolved records."""
import concurrent.futures
import copy
import json
import math
import re
import shutil
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf8')
ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
OUTPUTS = ROOT / 'outputs'
REGIONS = [
    {'name': '黑龙江', 'fullName': '黑龙江省', 'slug': 'heilongjiang', 'code': 230000, 'theme': '抗联主战场 · 北疆红色丰碑', 'description': '沿着松花江与林海密营，寻访黑土地上的抗联记忆。', 'center': [127.8, 48.3]},
    {'name': '吉林', 'fullName': '吉林省', 'slug': 'jilin', 'code': 220000, 'theme': '白山松水 · 英烈长存', 'description': '走近白山松水之间的抗联根据地、战迹地与英烈纪念设施。', 'center': [126.5, 43.5]},
    {'name': '辽宁', 'fullName': '辽宁省', 'slug': 'liaoning', 'code': 210000, 'theme': '烽火辽沈 · 山河铭记', 'description': '从九一八历史记忆出发，寻访辽东山地与西征足迹。', 'center': [123.4, 41.3]},
    {'name': '内蒙古', 'fullName': '内蒙古自治区东部', 'slug': 'neimenggu', 'code': 150000, 'theme': '北疆星火 · 兴安记忆', 'description': '走进呼伦贝尔、兴安盟、通辽与赤峰，阅读北疆抗战记忆。', 'center': [121.5, 46.6]},
]
EAST_CODES = {150400, 150500, 150700, 152200}
CITY_ALIASES = {'延边州': '延边朝鲜族自治州'}


def read_json(path):
    return json.loads(path.read_text(encoding='utf8'))


def download(code, full=True):
    filename = f'{code}{"_full" if full else ""}.json'
    path = OUTPUTS / filename
    if not path.exists():
        original = ROOT.parent / filename
        if original.exists():
            shutil.copyfile(original, path)
        else:
            url = 'https://geo.datav.aliyun.com/areas_v3/bound/' + filename
            with urllib.request.urlopen(url, timeout=35) as response:
                data = response.read()
            json.loads(data)
            path.write_bytes(data)
    return read_json(path)


def to_wgs(coordinates, coordinate_system):
    if coordinate_system in ['WGS84', 'WGS-84', 'EPSG:4326']:
        return coordinates[:2]
    if coordinate_system != 'GCJ-02':
        raise ValueError('Unrecognized coordinate reference ' + coordinate_system)
    lon, lat = coordinates[:2]
    x, y, pi = lon - 105, lat - 35, math.pi
    delta_lat = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*math.sqrt(abs(x))
    delta_lat += (20*math.sin(6*x*pi) + 20*math.sin(2*x*pi))*2/3
    delta_lat += (20*math.sin(y*pi) + 40*math.sin(y/3*pi))*2/3
    delta_lat += (160*math.sin(y/12*pi) + 320*math.sin(y*pi/30))*2/3
    delta_lon = 300 + x + 2*y + .1*x*x + .1*x*y + .1*math.sqrt(abs(x))
    delta_lon += (20*math.sin(6*x*pi) + 20*math.sin(2*x*pi))*2/3
    delta_lon += (20*math.sin(x*pi) + 40*math.sin(x/3*pi))*2/3
    delta_lon += (150*math.sin(x/12*pi) + 300*math.sin(x/30*pi))*2/3
    rad = lat/180*pi
    magic = 1 - .006693421622965943*math.sin(rad)**2
    return [lon - delta_lon*180/(6378245/math.sqrt(magic)*math.cos(rad)*pi), lat - delta_lat*180/((6378245*(1-.006693421622965943))/(magic*math.sqrt(magic))*pi)]


def convert_boundary(document):
    document = copy.deepcopy(document)
    def convert(coordinates):
        if isinstance(coordinates[0], (int, float)):
            return to_wgs(coordinates, 'GCJ-02')
        return [convert(part) for part in coordinates]
    for feature in document['features']:
        feature['geometry']['coordinates'] = convert(feature['geometry']['coordinates'])
        for key in ['center', 'centroid']:
            if feature['properties'].get(key):
                feature['properties'][key] = convert(feature['properties'][key])
    return document


def point_in_ring(point, ring):
    inside = False
    x, y = point
    for index, (x1, y1) in enumerate(ring):
        x2, y2 = ring[index-1]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1) + x1:
            inside = not inside
    return inside


def point_in_geometry(point, geometry):
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    return any(point_in_ring(point, polygon[0]) and not any(point_in_ring(point, hole) for hole in polygon[1:]) for polygon in polygons)


def canonical_name(name):
    return re.sub(r'[\s\W_]+', '', name).replace('革命烈士', '烈士').replace('历史博物馆', '博物馆')


def name_variants(name):
    variants = [name, re.split(r'[（(【]', name)[0]]
    variants += re.findall(r'[（(【]([^）)】]+)[）)】]', name)
    return {canonical_name(value.removeprefix('含')) for value in variants if len(value) >= 5}


def load_research():
    entries = []
    for path in OUTPUTS.glob('verified-*.json'):
        document = read_json(path)
        rows = document if isinstance(document, list) else document.get('records', document.get('verified', []))
        entries.extend(row for row in rows if row.get('coordinates') and row.get('source'))
    conflicts = []
    for path in OUTPUTS.glob('conflicts-*.json'):
        document = read_json(path)
        conflicts.extend(document if isinstance(document, list) else document.get('conflicts', []))
    for conflict in conflicts:
        if not conflict.get('source'):
            conflict['source'] = next(iter(conflict.get('sources', [])), conflict.get('evidenceSource'))
        if not conflict.get('finding'):
            conflict['finding'] = conflict.get('verifiedFact') or conflict.get('conclusion')
    return entries, conflicts


def lookup_research(raw, entries):
    for entry in entries:
        ids = entry.get('matchedRecordIds', entry.get('recordIds', []))
        if raw['id'] in ids:
            return entry
        if entry.get('province') == raw['province'] and name_variants(raw['name']) & name_variants(entry.get('name', '')):
            return entry
    return None


def osm_match(raw, elements, city):
    matches = []
    aliases = name_variants(raw['name'])
    if not city:
        return None
    for element in elements:
        tags = element.get('tags', {})
        names = [tags.get('name', ''), tags.get('name:zh', ''), tags.get('official_name', ''), tags.get('alt_name', '')]
        if not any(canonical_name(name) in aliases for name in names if len(name) >= 5):
            continue
        center = element.get('center', element)
        if 'lon' not in center or not point_in_geometry([center['lon'], center['lat']], city['geometry']):
            continue
        matches.append(element)
    if len(matches) != 1:
        return None
    element = matches[0]
    center = element.get('center', element)
    return {'coordinates': [center['lon'], center['lat']], 'coordinateSystem': 'WGS84', 'source': f"https://www.openstreetmap.org/{element['type']}/{element['id']}", 'evidence': '公开GIS名称与台账名称一致，坐标落于所列地市边界内', 'precision': '公开POI/命名设施参考点', 'verificationLevel': '开放GIS匹配'}


def build_region(config, atlas, museum, photographs, entries, conflicts, elements):
    cities = download(config['code'])
    if config['name'] == '内蒙古':
        cities['features'] = [feature for feature in cities['features'] if feature['properties']['adcode'] in EAST_CODES]
        polygons = []
        for feature in cities['features']:
            geometry = feature['geometry']
            polygons.extend(geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']])
        province = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'name': config['fullName'], 'adcode': '150000-east'}, 'geometry': {'type': 'MultiPolygon', 'coordinates': polygons}}]}
    else:
        province = download(config['code'], full=False)
    codes = [feature['properties']['adcode'] for feature in cities['features']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        county_documents = list(pool.map(download, codes))
    counties = {'type': 'FeatureCollection', 'features': [feature for doc in county_documents for feature in doc['features']]}
    cities, counties, province = map(convert_boundary, [cities, counties, province])
    image_registry = read_json(ROOT / 'image-associations.json')
    records = []
    for raw in atlas['records']:
        if raw['province'] != config['name']:
            continue
        original_city = raw['region'].split('·')[-1]
        city_name = CITY_ALIASES.get(original_city, original_city)
        city = next((feature for feature in cities['features'] if feature['properties']['name'] == city_name), None)
        county = next((feature for feature in counties['features'] if feature['properties']['name'] in raw['address'] and len(feature['properties']['name']) >= 3 and city and str(feature['properties']['adcode'])[:4] == str(city['properties']['adcode'])[:4]), None)
        record = {**raw, 'originalAddress': raw['address'], 'originalCity': original_city, 'city': city_name, 'county': county['properties']['name'] if county else None,
                  'longitude': None, 'latitude': None, 'coordinateStatus': '缺少遗址级坐标', 'coordinateSystem': 'WGS84', 'coordinateSource': None,
                  'image': None, 'imageSource': None, 'vrUrl': None, 'people': [name for name in ['杨靖宇', '赵一曼', '赵尚志', '李兆麟', '周保中', '冷云', '魏拯民', '陈翰章', '冯仲云', '李延禄'] if name in raw['name'] + raw['background']],
                  'events': [], 'routeIds': [], 'digitizationStatus': None, 'constructionYear': None, 'openingStatus': None,
                  'scopeAdcode': county['properties']['adcode'] if county else (city['properties']['adcode'] if city else config['code']),
                  'scopeName': county['properties']['name'] if county else (city_name if city else config['fullName']), 'scopeLevel': '县区' if county else '地市',
                  'verificationLevel': '未确认', 'verificationEvidence': None, 'dataConflicts': []}
        researched = lookup_research(raw, entries)
        match = researched or osm_match(raw, elements, city)
        featured = next((place for place in museum['featured'] if place['province'] == config['name'] and (place['term'] in raw['name'] or ('七三一' in place['name'] and '七三一' in raw['name']))), None)
        if not match and featured and 'arcgis.com' not in featured['coordinateSource']:
            match = {'coordinates': featured['coordinates'], 'coordinateSystem': featured['coordinateSystem'], 'source': featured['coordinateSource'], 'evidence': '此前已收录的公开地图坐标，公开资料参考点', 'precision': '公开设施参考点', 'verificationLevel': '已有公开资料'}
        if match:
            coordinate_system = match.get('coordinateSystem', 'WGS84')
            coordinates = to_wgs(match['coordinates'], coordinate_system)
            record.update(longitude=coordinates[0], latitude=coordinates[1], coordinateStatus='已核对公开资料' if researched else '已匹配公开地图',
                          coordinateSource=match['source'], sourceCoordinates=match['coordinates'], sourceCoordinateSystem=coordinate_system,
                          coordinateMethod='原始WGS84' if coordinate_system == 'WGS84' else 'GCJ-02近似逆变换',
                          verificationEvidence=match.get('evidence'), verificationEvidenceSources=match.get('evidenceUrls', []), verificationLevel=match.get('verificationLevel', match.get('verificationStatus', '公开资料核对')), coordinatePrecision=match.get('precision'),
                          verifiedAt=match.get('verifiedAt', '2026-11-12'))
            if match.get('correctedAddress'):
                record['address'] = match['correctedAddress']
            if match.get('city'):
                record['city'] = CITY_ALIASES.get(match['city'], match['city'])
        for conflict in conflicts:
            ids = conflict.get('recordIds', conflict.get('matchedRecordIds', []))
            if raw['id'] in ids or conflict.get('name') == raw['name']:
                record['dataConflicts'].append(conflict)
                if conflict.get('correctedCity'):
                    record['city'] = conflict['correctedCity']
                corrected_scope = next((feature for feature in counties['features'] + cities['features'] if feature['properties']['name'] == conflict.get('correctedScope')), None)
                if corrected_scope:
                    record.update(scopeAdcode=corrected_scope['properties']['adcode'], scopeName=corrected_scope['properties']['name'], scopeBasis='独立公开资料纠正行政归属', scopeLevel='县区' if corrected_scope['properties'].get('level') == 'district' else '地市')
        if featured:
            record.update(vrUrl=museum['vr'][0]['url'] if featured['vr'] else None,
                          routeIds=[route['id'] for route in museum['routes'] if featured['key'] in route['stops']])
        binding = image_registry['bindings'].get(raw['id'], {})
        asset = image_registry['assets'].get(binding.get('asset_id')) if binding.get('status') == 'associated' else None
        record.update(image=binding['asset_id'] if asset else None,
                      imageSource=asset['source'] if asset else None,
                      imageCaption=asset['caption'] if asset else None,
                      imageStatus=binding.get('status', 'not_recorded'))
        records.append(record)
    located = [record for record in records if record['longitude'] is not None]
    metadata = {**config, 'recordCount': len(records), 'locatedCount': len(located), 'uniqueLocatedCount': len({(record['longitude'], record['latitude']) for record in located}), 'pendingCount': len(records)-len(located),
                'cityCount': len(cities['features']), 'countyCount': len(counties['features']), 'conflictCount': sum(bool(record['dataConflicts']) for record in records),
                'boundarySource': 'https://datav.aliyun.com/portal/school/atlas/area_selector', 'boundaryCRS': 'GCJ-02→WGS84近似逆变换，精度校核与授权待完成',
                'boundaryCRSDocumentation': 'https://help.aliyun.com/en/datav/datav-7-0/user-guide/map-data-format-1', 'displayCRS': 'WGS84，经Web Mercator显示', 'terrainSource': 'https://registry.opendata.aws/terrain-tiles/'}
    payload = {'metadata': metadata, 'records': records, 'cities': cities, 'counties': counties, 'province': province}
    script = 'window.EXHIBIT_DB=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';'
    (DIST / f"{config['slug']}-data.js").write_text(script, encoding='utf8')
    if config['name'] == '黑龙江':
        (DIST / 'exhibit-data.js').write_text(script + 'window.HLJ_DB=window.EXHIBIT_DB;', encoding='utf8')
    (DIST / f"{config['slug']}-records.json").write_text(json.dumps({'metadata': metadata, 'records': records}, ensure_ascii=False, indent=2), encoding='utf8')
    return metadata, records


def main():
    atlas = json.loads((DIST / 'data.js').read_text(encoding='utf8')[13:-1])
    museum = json.loads((DIST / 'museum-data.js').read_text(encoding='utf8')[14:-1])
    photographs = read_json(OUTPUTS / 'photo-sources.json')
    entries, conflicts = load_research()
    elements = []
    for path in [OUTPUTS / 'osm-northeast-heritage.json', OUTPUTS / 'osm-jilin-heritage.json']:
        if path.exists():
            elements.extend(read_json(path).get('elements', []))
    elements = list({(element['type'], element['id']): element for element in elements}.values())
    all_records, summaries = [], []
    for config in REGIONS:
        metadata, records = build_region(config, atlas, museum, photographs, entries, conflicts, elements)
        summaries.append(metadata)
        all_records.extend(records)
        print(json.dumps({key: metadata[key] for key in ['name', 'recordCount', 'locatedCount', 'pendingCount', 'conflictCount']}, ensure_ascii=False), flush=True)
    (DIST / 'coordinate-audit.json').write_text(json.dumps({'regions': summaries, 'records': all_records}, ensure_ascii=False, indent=2), encoding='utf8')
    registry_fields = ['longitude', 'latitude', 'coordinateStatus', 'coordinateSource', 'coordinateSystem', 'sourceCoordinates', 'sourceCoordinateSystem', 'coordinateMethod', 'coordinatePrecision', 'verificationLevel', 'verificationEvidence', 'verificationEvidenceSources', 'verifiedAt', 'originalAddress', 'originalCity', 'address', 'city', 'scopeName', 'scopeAdcode', 'scopeBasis', 'dataConflicts', 'vrUrl', 'image', 'imageSource']
    registry = {record['id']: {key: record.get(key) for key in registry_fields} for record in all_records}
    (DIST / 'coordinate-registry.js').write_text('window.COORDINATE_REGISTRY=' + json.dumps(registry, ensure_ascii=False, separators=(',', ':')) + ';', encoding='utf8')
    for featured in museum['featured']:
        record = next((record for record in all_records if record['id'] == featured['id']), None)
        if record and record['longitude'] is not None:
            featured.update(coordinates=[record['longitude'], record['latitude']], coordinateSystem='WGS84', coordinateSource=record['coordinateSource'], coordinateCredit=record['coordinateStatus'])
    (DIST / 'museum-data.js').write_text('window.MUSEUM=' + json.dumps(museum, ensure_ascii=False, separators=(',', ':')) + ';', encoding='utf8')


if __name__ == '__main__':
    main()
