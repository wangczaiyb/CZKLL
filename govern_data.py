"""Build conservative entity links and reproducible geographic candidates.

Original workbook rows and their coordinates are immutable inputs. Candidate
positions are published separately and never replace the source coordinate.
"""
import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORK = ROOT.parent
AUDIT = WORK / 'phase2-audit'
OUT = WORK / 'phase3-execution' / 'geography'
DIST = ROOT / 'dist'
SLUGS = ['heilongjiang', 'jilin', 'liaoning', 'neimenggu']
NAMESPACE = uuid.UUID('73fe15dc-c3a7-4e12-a627-3bb042c2b1aa')


@contextmanager
def candidate_lock():
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / 'candidate-write.lock').open('a+b') as handle:
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            if not handle.read(1):
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def script_data(path, prefix):
    return json.loads(path.read_text(encoding='utf-8')[len(prefix):-1])


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def write_script(name, global_name, data):
    (DIST / name).write_text(f'window.{global_name}=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';', encoding='utf-8')


def csv_rows(name):
    with (AUDIT / name).open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


def contains(point, geometry):
    def ring_inside(ring):
        x, y = point
        inside = False
        previous = ring[-1]
        for current in ring:
            x1, y1 = previous
            x2, y2 = current
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
            previous = current
        return inside
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return any(ring_inside(polygon[0]) and not any(ring_inside(hole) for hole in polygon[1:]) for polygon in polygons)


def normalize(value):
    # Preserve descriptive qualifiers because a museum and an original site can differ.
    return re.sub(r'[\s·“”"、]', '', value or '')


def entities(records):
    pairs = csv_rows('04-duplicate-candidates.csv')
    by_id = {record['id']: record for record in records}
    parent = {record['id']: record['id'] for record in records}

    def find(key):
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    decisions = []
    fields = ['name', 'province', 'region', 'address', 'kind', 'background', 'level', 'status']
    for pair in pairs:
        a, b = (by_id[pair['source_record_id_' + side]] for side in ['a', 'b'])
        exact = all(normalize(a.get(field)) == normalize(b.get(field)) for field in fields)
        safe = exact and bool(a['address']) and a['source'] != b['source'] and not pair['object_risks']
        if safe:
            left, right = sorted([find(a['id']), find(b['id'])])
            parent[right] = left
        decisions.append({
            'candidate_id': pair['candidate_id'], 'source_record_ids': [a['id'], b['id']],
            'decision': 'linked_identical_source_content' if safe else 'pending_identity_review',
            'basis': '两份来源的名称、省市、原地址、类别、简介、等级和状态完全一致' if safe else '存在字段差异或对象风险，保留独立实体',
            'original_relation_types': pair['relation_types'], 'object_risks': pair['object_risks']
        })
    groups = defaultdict(list)
    for record in records:
        groups[find(record['id'])].append(record['id'])
    bindings = {}
    entities_by_id = {}
    for members in groups.values():
        identifier = 'site-' + str(uuid.uuid5(NAMESPACE, min(members)))
        entities_by_id[identifier] = {'id': identifier, 'source_record_ids': sorted(members), 'identity_status': 'linked_identical_source_content' if len(members) > 1 else 'independent_source_record'}
        bindings.update({member: identifier for member in members})
    payload = {'version': 1, 'source_record_count': len(records), 'entity_count': len(groups), 'bindings': bindings, 'entities': entities_by_id, 'decision_counts': dict(Counter(row['decision'] for row in decisions))}
    write_json(OUT / 'entity-registry.json', payload)
    write_json(OUT / 'duplicate-decisions.json', decisions)
    write_script('entity-registry.js', 'HERITAGE_ENTITIES', payload)
    return bindings


def fetch_osm():
    cache = OUT / 'osm-northeast.json'
    query = '[out:json][timeout:40];nwr["name"~"抗联|烈士|抗日|纪念馆|密营|遗址|纪念碑|皇宫|战犯|战俘|万人坑|纪念园"](38.5,116.0,53.7,135.3);out center tags;'
    url = 'https://overpass.private.coffee/api/interpreter?' + urllib.parse.urlencode({'data': query})
    attempt = {'provider': 'Overpass / OSM', 'endpoint': url, 'requested_at': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'KanglianHeritageResearch/2.0 (educational heritage inventory)'})
        with urllib.request.urlopen(request, timeout=55) as response:
            data = json.load(response)
        if data.get('remark'):
            raise ValueError(data['remark'])
        write_json(cache, data)
        attempt.update(status='completed', element_count=len(data.get('elements', [])))
    except Exception as error:
        attempt.update(status='failed', error=str(error))
    write_json(OUT / 'osm-request.json', attempt)
    return attempt


def official_search(record):
    """Optional search adapter. A search hit alone never grants precise status."""
    endpoint = os.environ.get('HERITAGE_SEARCH_ENDPOINT')
    key = os.environ.get('HERITAGE_SEARCH_KEY')
    if not endpoint:
        return []
    query = f"{record['province']} {record['city']} {record.get('county') or ''} {record['name']} 遗址 地址 site:gov.cn"
    request = urllib.request.Request(endpoint + '?' + urllib.parse.urlencode({'q': query}), headers={'Ocp-Apim-Subscription-Key': key or '', 'User-Agent': 'HeritageEvidence/2.0'})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.load(response)
        return [{'url': item['url'], 'title': item.get('name'), 'excerpt': item.get('snippet')} for item in data.get('webPages', {}).get('value', []) if urllib.parse.urlparse(item['url']).hostname and urllib.parse.urlparse(item['url']).hostname.endswith('.gov.cn')]
    except Exception as error:
        return [{'status': 'request_failed', 'error': str(error)}]


def geographic_candidates(databases, bindings, online_search=False):
    existing_path = OUT / 'geography-candidates.json'
    previous_records = read_json(existing_path).get('records', {}) if existing_path.exists() else {}
    elements = []
    for path in [OUT / 'osm-northeast.json', ROOT / 'outputs/osm-hlj-specific.json']:
        if path.exists():
            elements.extend(read_json(path).get('elements', []))
    elements = list({(item['type'], item['id']): item for item in elements}.values())
    osm_by_name = defaultdict(list)
    for element in elements:
        osm_by_name[normalize(element.get('tags', {}).get('name', ''))].append(element)
    research = read_json(ROOT / 'outputs/national-heritage-candidates.json')
    research_by_id = defaultdict(list)
    for candidate in research['candidates']:
        for match in candidate['matchedRecords']:
            research_by_id[match['recordId']].append(candidate)
    candidates = {}
    for database in databases:
        for record in database['records']:
            if record['longitude'] is not None:
                continue
            city = next((feature for feature in database['cities']['features'] if feature['properties']['name'] == record['city']), None)
            county = next((feature for feature in database['counties']['features'] if feature['properties']['adcode'] == record.get('scopeAdcode')), None)
            scope = county if county and str(county['properties']['adcode'])[:4] == str(city['properties']['adcode'])[:4] else city
            grade = 'C' if scope else 'D'
            options = []
            for element in osm_by_name.get(normalize(record['name']), []):
                center = element.get('center', element)
                if 'lon' not in center or not city:
                    continue
                point = [center['lon'], center['lat']]
                province_ok = contains(point, database['province']['features'][0]['geometry'])
                city_ok = contains(point, city['geometry'])
                county_ok = not scope or contains(point, scope['geometry'])
                source = f"https://www.openstreetmap.org/{element['type']}/{element['id']}"
                options.append({'longitude': point[0], 'latitude': point[1], 'crs': 'WGS84', 'source': source, 'name': element['tags']['name'], 'within_province': province_ok, 'within_city': city_ok, 'within_scope': county_ok, 'position_type': 'POI' if element['type'] == 'node' else 'named_feature_reference', 'evidence': 'OSM原始名称完全一致，使用公开GIS坐标，独立入口精度待核验'})
            valid = [item for item in options if item['within_province'] and item['within_city'] and item['within_scope']]
            if len(valid) == 1:
                grade = 'B'
            candidates[record['id']] = {
                'source_record_id': record['id'], 'entity_id': bindings[record['id']], 'name': record['name'],
                'province': record['province'], 'city': record['city'], 'county': record.get('county'),
                'original_address': record['originalAddress'], 'grade': grade, 'accepted': False,
                'position': valid[0] if grade == 'B' else None,
                'scope_adcode': scope['properties']['adcode'] if scope else None,
                'scope_name': scope['properties']['name'] if scope else None,
                'scope_source': database['metadata']['boundarySource'] if scope else None,
                'poi_candidates': options,
                'research_candidates': [{'name': item['name'], 'coordinates': item['coordinates'], 'crs': 'WGS84', 'source': research['datasetDOI'], 'status': 'pending_independent_review', 'reason': '数据集存在已知错位，候选名称相近不自动采用'} for item in research_by_id[record['id']]],
                'official_search': official_search(record) if online_search else [],
                'search_query': ' '.join(filter(None, [record['province'], record['city'], record.get('county'), record['name'], record['originalAddress']])),
                'status': 'candidate_position_needs_review' if grade == 'B' else 'administrative_scope_only' if grade == 'C' else 'insufficient_evidence',
                'completed_steps': ['source_fields', 'cached_research_match', 'osm_name_match', 'administrative_validation', 'crs_check', 'evidence_ranking'],
                'pending_steps': ['official_web_search'] if not online_search else ['independent_position_review'],
                'updated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z')
            }
            previous = previous_records.get(record['id'], {})
            current = candidates[record['id']]
            identity_fields = ['name', 'province', 'city', 'original_address']
            if previous.get('online_attempted') and all(previous.get(field) == current.get(field) for field in identity_fields):
                for field in ['official_search', 'address_candidates', 'online_attempted', 'online_status', 'online_error', 'geocoded_candidates', 'pending_steps']:
                    if field in previous:
                        current[field] = previous[field]
                position = previous.get('position')
                if position and previous.get('grade') == 'B' and position.get('official_evidence') and position.get('precise_address') and city:
                    point = [position['longitude'], position['latitude']]
                    if contains(point, city['geometry']) and contains(point, database['province']['features'][0]['geometry']):
                        current.update(grade='B', position=position, status='official_address_geocoded_needs_review')
    assert len(candidates) == 890
    summary = {'total': len(candidates), 'grades': dict(Counter(item['grade'] for item in candidates.values())), 'osm_elements': len(elements), 'official_online_search_enabled': online_search and bool(os.environ.get('HERITAGE_SEARCH_ENDPOINT')), 'online_attempted':sum(bool(row.get('online_attempted')) for row in candidates.values()), 'formal_records_modified': 0}
    write_json(OUT / 'geography-candidates.json', {'summary': summary, 'records': candidates})
    write_script('geography-candidates.js', 'GEOGRAPHY_CANDIDATES', {'summary': summary, 'records': candidates})
    return summary


def coordinate_reviews(databases):
    reviews = {}
    for database in databases:
        for record in database['records']:
            if record['longitude'] is None:
                continue
            name = record['name']
            item = {'grade': 'B', 'status': 'public_reference_precision_limited', 'position_type': '设施公开参考点', 'sources': [record['coordinateSource']], 'reason': '具有公开坐标来源，尚无实地或测绘精度核验'}
            if '沈阳二战盟军' in name or '抚顺战犯' in name:
                item.update(grade='C', status='coordinate_conflict_pending', reason='多个公开坐标存在位移，官方地址可确认，入口坐标尚需独立核验，地图仅显示行政范围')
                item['sources'].append('https://whly.ln.gov.cn/whly/wlzt/lnww/zdwwbhdw/C578498CA6B541949D63C74E4109AF57/index.shtml' if '沈阳' in name else 'https://zh.wikipedia.org/wiki/抚顺战犯管理所')
            if '童长荣' in name:
                item.update(position_type='陵园范围参考点', reason='来源记录合写殉难地、墓与陵园，当前公开坐标仅对应陵园范围')
            if '尚志烈士陵园' in name:
                item.update(address='尚志市尚志镇北环街176号', address_basis='https://www.dswxyjy.org.cn/n1/2020/0409/c222137-31667346.html')
            if name == '哈尔滨烈士陵园':
                park = read_json(DIST / 'harbin-pilot-site.geojson')['features'][0]
                inside = contains([record['longitude'], record['latitude']], park['geometry'])
                item.update(reason='高德公开POI与体育街1号地址一致，独立OSM命名园区边界校验通过，入口精度仍有限', within_named_site=inside)
                item['sources'].append(park['properties']['source'])
                assert inside
            if '诺门罕' in name:
                item.update(address='新巴尔虎左旗罕达盖苏木查干诺尔嘎查（馆方公开地址）', address_basis='https://www.nuomenhanzhanyi.com/col.jsp?id=104')
            if record['dataConflicts']:
                item['conflicts'] = record['dataConflicts']
            reviews[record['id']] = item
    write_json(OUT / 'existing-coordinate-decisions.json', reviews)
    write_script('coordinate-reviews.js', 'COORDINATE_REVIEWS', reviews)


def compact_catalog():
    museum = script_data(DIST / 'museum-data.js', 'window.MUSEUM=')
    registry = read_json(ROOT / 'image-associations.json')
    assets = {key: asset['file'] for key, asset in registry['assets'].items()}
    for item in museum.get('vr', []):
        if item.get('image'):
            assets[item['image']] = item['image'] + '.jpg'
    museum['assets'] = assets
    museum['terrainTexture'] = 'earth-topology.png'
    write_script('museum-catalog.js', 'MUSEUM', museum)
    buildings = read_json(DIST / 'harbin-building-footprints.geojson')
    site = read_json(DIST / 'harbin-pilot-site.geojson')
    write_script('pilot-geometry.js', 'HERITAGE_PILOT', {'buildings':buildings, 'site':site, 'buildingCount':len(buildings['features']), 'withMeasuredHeight':sum('height_m' in feature['properties'] for feature in buildings['features'])})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch-osm', action='store_true')
    parser.add_argument('--official-search', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    databases = [script_data(DIST / (slug + '-data.js'), 'window.EXHIBIT_DB=') for slug in SLUGS]
    atlas = script_data(DIST / 'data.js', 'window.ATLAS=')
    bindings = entities(atlas['records'])
    if args.fetch_osm:
        print(json.dumps(fetch_osm(), ensure_ascii=False), flush=True)
    summary = geographic_candidates(databases, bindings, args.official_search)
    coordinate_reviews(databases)
    compact_catalog()
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    with candidate_lock():
        main()
