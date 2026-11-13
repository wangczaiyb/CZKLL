# 重走抗联路

东北抗联红色文化数字化地图网站，包含东北三维首页、四省区统一 GIS 地图、遗址数字档案与自定义研学路线工作台。

## 启动

需要 Python 3.10 或更新版本，运行服务使用 Python 标准库。

```sh
python -B serve.py --port 8767
```

打开 http://127.0.0.1:8767/ 。进入任意省区，点击“研学路线编辑”即可创建路线。直接入口为 http://127.0.0.1:8767/heilongjiang.html?study=1 。

面向局域网或托管环境可指定监听地址。

```sh
python -B serve.py --host 0.0.0.0 --port 8767
```

## 网站文件

- `dist/` 包含可以直接提供 HTTP 服务的 HTML、CSS、JavaScript、图片、字体、地图库和网站数据。
- `serve.py` 提供网页及同源道路规划接口。
- `route_service.py` 提供 OSRM 分段道路规划、缓存和请求限速。
- `*.template.html` 为首页和省区页面模板。
- `build_pages.py` 根据模板和现有网站数据更新页面。
- `build_study_data.py` 根据四省区数据及坐标核验结果生成研学路线地点资源库。
- `prepare_exhibit.py` 和 `govern_data.py` 提供页面及目录生成使用的数据处理函数。
- `image-associations.json` 保存经过审核的图片关联。

## 更新页面与路线资源库

在仓库根目录执行以下命令，使用仓库内现有数据生成网页及路线资源库。

```sh
python -B build_study_data.py
python -B build_pages.py
```

静态托管时将发布目录设置为 `dist`。使用 `serve.py` 可同时启用同源道路规划接口。

## 研学路线

资源库保留 991 条来源记录及来源 ID，其中 938 条具有可用参考位置，53 条待定位。定位等级包括村屯级、乡镇级、区县级和待定位。行政区参考点用于研学规划，界面和导出文件保留位置精度与来源说明。

支持跨省区检索、多条件筛选、批量选点、地图添加、节点拖动与插入替换、自动保存、多路线管理、三维展示、路线播放，以及 PNG、GeoJSON、GPX、CSV 和打印介绍导出。

路线保存在当前浏览器的 IndexedDB 中，可通过 GeoJSON 导出与导入迁移到其他设备。更换网站域名或端口会使用对应来源的独立浏览器存储。

## 地图和道路服务

前端使用 Three.js、D3 与 MapLibre GL JS。地图服务配置位于 `dist/map-services.js`，包含道路、卫星影像、地形及本地行政区划降级模式。地图服务的来源与署名保留在页面中。

道路规划默认使用公共 OSRM 服务，按相邻节点逐段规划并限速。网络或服务不可用时，界面会标记示意连线或暂无道路数据。距离、预计时间和定位精度随路线导出。

可通过环境变量 `STUDY_OSRM_URL` 指定兼容 OSRM 的服务地址。道路缓存默认保存在项目内 `.cache/study-routes/road-cache.json`，也可通过 `STUDY_ROUTE_CACHE` 指定缓存文件路径。
