"""Compile all source rows and explicitly graded study-route reference positions."""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from govern_data import contains, script_data

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
SLUGS = ['heilongjiang', 'jilin', 'liaoning', 'neimenggu']


def administrative_point(feature):
    for key in ['center', 'centroid']:
        point = feature['properties'].get(key)
        if point and contains(point, feature['geometry']):
            return point, '现有行政区划中心参考位置' if key=='center' else '现有行政边界几何中心参考位置'
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    for polygon in sorted(polygons, key=lambda item: len(item[0]), reverse=True):
        ring = polygon[0]
        ys = sorted(set(point[1] for point in ring))
        candidates = [(min(ys) + max(ys)) / 2] + [(a+b)/2 for a,b in zip(ys,ys[1:])]
        for y in candidates:
            intersections = []
            for a,b in zip(ring, ring[1:] + ring[:1]):
                if (a[1] > y) != (b[1] > y):
                    intersections.append(a[0] + (y-a[1]) * (b[0]-a[0]) / (b[1]-a[1]))
            intersections.sort()
            for left,right in sorted(zip(intersections[::2],intersections[1::2]),key=lambda pair:pair[1]-pair[0],reverse=True):
                point = [(left+right)/2,y]
                if contains(point,geometry):
                    return point, '现有县级行政边界内部参考位置'
    return None, None


def address_parts(address, county, city, province):
    tail = re.split(r'[（(]', address)[0]
    if county and county in tail:
        tail = tail.split(county,1)[1]
    else:
        for prefix in [province+'省', province, city]:
            if prefix and tail.startswith(prefix):
                tail = tail[len(prefix):]
    township = re.match(r'([\u4e00-\u9fff]{1,12}?(?:苏木|镇|乡))', tail)
    town = township[1] if township else None
    if township:
        tail = tail[township.end():]
    village = re.match(r'([\u4e00-\u9fff]{1,12}?(?:嘎查|村|屯))',tail)
    return town, village[1] if village else None


def main():
    reviews = script_data(DIST/'coordinate-reviews.js', 'window.COORDINATE_REVIEWS=')
    databases = [script_data(DIST/(slug+'-data.js'), 'window.EXHIBIT_DB=') for slug in SLUGS]
    rows = []
    boundaries = []
    counties = {}
    anchors = defaultdict(list)
    for slug,database in zip(SLUGS,databases):
        boundaries.extend(database['province']['features'])
        province_counties = database['counties']['features']
        for feature in province_counties:
            counties[str(feature['properties']['adcode'])] = feature
        for source in database['records']:
            record = dict(source)
            review = reviews.get(record['id'], {})
            record['address'] = review.get('address') or record['address']
            city = next((feature for feature in database['cities']['features'] if feature['properties']['name']==record['city']),None)
            scope = next((feature for feature in province_counties if str(feature['properties']['adcode'])==str(record['scopeAdcode'])),None)
            if scope is None:
                matches = [feature for feature in province_counties if feature['properties']['name'] in record['address'] and city and feature['properties']['parent']['adcode']==city['properties']['adcode']]
                scope = max(matches,key=lambda feature:len(feature['properties']['name']),default=None)
            county = scope['properties']['name'] if scope else record.get('county')
            town,village = address_parts(record['address'],county,record['city'],record['province'])
            conflict = any('background' in item.get('conflictingFields',[]) for item in record.get('dataConflicts',[]))
            people = [person for person in record['people'] if not conflict or person in record['name']]
            record.update(county=county, township=town, village=village, province_slug=slug, people=people,
                          historyYears=sorted(set(int(year) for year in re.findall(r'19(?:3[1-9]|4[0-5])',record['background']))) if not conflict else [],
                          county_adcode=str(scope['properties']['adcode']) if scope else None,
                          background_warning=conflict)
            point = [record['longitude'],record['latitude']]
            usable = all(isinstance(value,(int,float)) for value in point) and review.get('grade') not in ['C','D']
            record['routeLocation'] = {'coordinates': point if usable else None, 'grade':'村屯级' if usable else '待定位',
                'basis':'既有设施公开参考位置，精度有限' if usable else '缺少可用的村镇或区县参考位置',
                'crs':'WGS84', 'source':record.get('coordinateSource') if usable else None,
                'reference_record_id':record['id'] if usable else None, 'is_reference':True}
            if usable and scope and not contains(point,scope['geometry']):
                record['routeLocation']['basis'] += '；台账区县与当前坐标的边界校验存在差异，参访前需核验行政归属'
                record['routeLocation']['administrative_warning'] = True
            if not usable and not scope:
                address_head=re.split(r'[（(]',record['address'])[0]
                address_counties=[feature for feature in province_counties if feature['properties']['name'] in address_head]
                if len(address_counties)==1:
                    record['routeLocation']['basis']='台账城市与地址所列区县的行政归属存在差异，当前保留文字节点，位置待核验'
                    record['routeLocation']['administrative_warning']=True
            if usable and scope:
                if village:
                    anchors[(record['province'],record['county_adcode'],town,village)].append(record)
                if town:
                    anchors[(record['province'],record['county_adcode'],town,None)].append(record)
            rows.append(record)
    for record in rows:
        location = record['routeLocation']
        if location['coordinates']:
            continue
        county = counties.get(record['county_adcode'])
        if not county:
            continue
        for key,grade in [((record['province'],record['county_adcode'],record['township'],record['village']),'村屯级'),
                          ((record['province'],record['county_adcode'],record['township'],None),'乡镇级')]:
            if not key[2] or (grade == '村屯级' and not key[3]):
                continue
            reference = next((item for item in anchors.get(key,[]) if contains(item['routeLocation']['coordinates'],county['geometry'])),None)
            if reference:
                location.update(coordinates=reference['routeLocation']['coordinates'],grade=grade,
                                basis=f'同{grade[:-1]}已有关联设施的公开参考位置，仅供区域研学规划',source=reference['routeLocation']['source'],reference_record_id=reference['id'])
                break
        if location['coordinates'] is None:
            point,basis = administrative_point(county)
            if point:
                location.update(coordinates=point,grade='区县级',basis=basis+'，用于区县范围研学参考',source='https://datav.aliyun.com/portal/school/atlas/area_selector')
    assert len(rows)==991 and len({record['id'] for record in rows})==991
    payload = {'version':1,'records':rows,'boundaries':{'type':'FeatureCollection','features':boundaries},
               'metadata':{'sourceRecordCount':len(rows),'availableCount':sum(bool(row['routeLocation']['coordinates']) for row in rows),
                           'grades':dict(Counter(row['routeLocation']['grade'] for row in rows)),
                           'positionPolicy':'村镇与区县参考位置用于研学规划，保留原始地址及来源身份'}}
    (DIST/'study-route-data.js').write_text('window.STUDY_ROUTE_CATALOG='+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
    print(json.dumps(payload['metadata'],ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
