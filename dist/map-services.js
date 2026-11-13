/* Replace URLs with licensed services when deploying to another network. */
window.MAP_SERVICES = {
  road: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '道路 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: '影像 © Esri, Vantor, Earthstar Geographics, GIS User Community · <a href="https://goto.arcgisonline.com/maps/World_Imagery" target="_blank" rel="noopener">来源与使用条款</a>'
  },
  terrain: {
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    maxzoom: 15,
    encoding: 'terrarium',
    attribution: '高程 © Mapzen / AWS Terrain Tiles · <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">数据来源</a>'
  },
  // Optional same-origin JSON override. Keys and URL templates follow this file.
  timeout: 12000,
  ...window.MAP_SERVICE_OVERRIDES
};
