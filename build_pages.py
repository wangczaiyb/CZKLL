import json,hashlib,re
from prepare_exhibit import REGIONS
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parent
dist=root/'dist'
raw=(dist/'data.js').read_text(encoding='utf8')
data=json.loads(raw[len('window.ATLAS='):-1])
counts=Counter(record['province'] for record in data['records'])
image_registry=json.loads((root/'image-associations.json').read_text(encoding='utf8'))
record_ids={record['id'] for record in data['records']}
if not set(image_registry['bindings']).issubset(record_ids):
    raise ValueError('Image binding references an unknown source record')
for binding in image_registry['bindings'].values():
    if binding['status']=='associated' and binding['asset_id'] not in image_registry['assets']:
        raise ValueError('Image binding references an unknown asset')
(dist/'image-associations.js').write_text('window.HERITAGE_IMAGE_REGISTRY='+json.dumps(image_registry,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
regions=[('黑龙江','heilongjiang','林海坚守','从纪念馆到深山密营，探寻黑土地上的抗联记忆。','A2'),('吉林','jilin','白山忠魂','走近白山松水间的抗联根据地与英烈纪念设施。','B3'),('辽宁','liaoning','烽火西征','沿着山地密营与西征足迹，阅读辽宁抗联历史。','C3'),('内蒙古','neimenggu','北疆星火','从呼伦贝尔到兴安岭，寻访北疆抗联的历史印记。','D1')]
def navigation(current):
    items=[('首页','index.html')]+[(name,slug+'.html') for name,slug,*_ in regions]
    labels={'内蒙古':'内蒙古东部'}
    return ''.join(f'<a href="{href}"'+(' class="active" aria-current="page"' if name==current else '')+f'>{labels.get(name,name)}</a>' for name,href in items)
template=(root/'province.template.html').read_text(encoding='utf8')
for name,slug,theme,description,image in regions:
    html=template.replace('<body>','<body class="province-page" data-province="'+name+'">')
    html=html.replace('<title>重走抗联路 · 红色记忆数字地图</title>',f'<title>{name} · 重走抗联路</title>')
    html=html.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="pages.css">')
    html=html.replace('<header>','<header class="province-header">').replace('class="brand" href="#"','class="brand" href="index.html"')
    html=html.replace('<small>NORTHEAST · MEMORY ATLAS</small>','<small>东北抗联记忆数字档案</small>')
    html=html.replace('<nav>','<nav class="site-nav" aria-label="省区页面切换">'+navigation(name)+'</nav><nav class="utility-nav">',1)
    html=html.replace('id="explore">全域探索','id="explore">本省区档案')
    html=html.replace('<main><section class="intro">',f'<main><div class="page-breadcrumb"><a href="index.html">首页</a><span>›</span><span>{name}</span></div><section class="intro province-intro">')
    html=html.replace('东北三省一区 · 抗联记忆数字档案',name+' · 抗联记忆数字档案')
    html=html.replace('<h1>山河铭记<span>薪火不息</span></h1>',f'<h1>{name}<span>{theme}</span></h1>')
    html=html.replace('沿着林海雪原的足迹，走近每一处承载信念的地方。',description)
    html=html.replace('开启沉浸寻访','探索'+name)
    html=html.replace('<strong>991<span>条</span></strong><p>完整台账记录</p>',f'<strong>{counts[name]}<span>条</span></strong><p>本省区完整台账记录</p>')
    city_count=len(set(record['region'] for record in data['records'] if record['province']==name))
    html=html.replace('<strong>4<span>省区</span></strong><p>跨越东北的红色记忆</p>',f'<strong>{city_count}<span>地区</span></strong><p>按原始台账地区统计</p>')
    html=html.replace('从一处遗址，走进一段历史','继续探索其他省区').replace('点击主题，探索区域档案 ↗','切换独立省区页面 ↗')
    html=html.replace('<script src="d3.min.js"></script>','').replace('<script src="geo.js"></script>','').replace('<script src="stories.js"></script>','')
    (dist/(slug+'.html')).write_text(html,encoding='utf8')
    (dist/(slug+'-classic.html')).write_text(html,encoding='utf8')
exhibit_template=(root/'exhibit.template.html').read_text(encoding='utf8')
for config in REGIONS:
    exhibit=exhibit_template
    values={'FULL_NAME':config['fullName'],'NAME':config['name'],'CHAPTER':'内蒙古东部' if config['name']=='内蒙古' else config['name'],'THEME':config['theme'],'DESCRIPTION':config['description'],'DATA_FILE':config['slug']+'-data.js','NAV':navigation(config['name'])}
    for key,value in values.items():exhibit=exhibit.replace('{{'+key+'}}',value)
    (dist/(config['slug']+'.html')).write_text(exhibit,encoding='utf8')
    destination=config['slug']+'.html'
    legacy='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正在进入省区地图</title></head><body><p>省区档案已整合到统一地图。</p><a id="continue" href="'''+destination+'''">进入省区地图</a><script>
const parameters=new URLSearchParams(location.search);
if(parameters.has('id')&&!parameters.has('site'))parameters.set('site',parameters.get('id'));
const target='''+json.dumps(destination)+'''+(parameters.size?'?'+parameters.toString():'')+location.hash;
document.getElementById('continue').href=target;
location.replace(target);
</script></body></html>'''
    (dist/(config['slug']+'-classic.html')).write_text(legacy,encoding='utf8')
home=(root/'museum-home.template.html').read_text(encoding='utf8').replace('{{NAV}}',navigation('首页'))
cards=[]
for name,slug,theme,description,image in regions:
    cards.append(f'<a class="region-card" href="{slug}.html" aria-label="进入{name}独立页面"><img src="{image}.jpg" alt="{name}抗联相关实景"><span class="region-count-label">{counts[name]} 条台账记录</span><h3>{name}</h3><p class="region-theme">{theme}</p><p class="region-description">{description}</p><span class="region-link">进入{name}<b>↗</b></span></a>')
(dist/'index.html').write_text(home.replace('{{CARDS}}',''.join(cards)),encoding='utf8')
for page in dist.glob('*.html'):
    text=page.read_text(encoding='utf8')
    if 'rel="icon"' not in text:
        text=text.replace('<head>','<head><link rel="icon" href="data:,">',1)
    def version_asset(match):
        asset=dist/match[2]
        if not asset.is_file():return match[0]
        version=hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
        return match[1]+match[2]+'?v='+version+'"'
    text=re.sub(r'((?:src|href)=")([^"?]+\.(?:js|css))(?:\?v=[^\"]*)?"',version_asset,text)
    page.write_text(text,encoding='utf8')
print(json.dumps({'pages':['首页']+[r[0] for r in regions],'records':dict(counts),'total':sum(counts.values())},ensure_ascii=False))
