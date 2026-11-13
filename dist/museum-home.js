(() => {
  const ui=new MuseumUI();
  let map;
  let startupTimer;
  const callbacks = {
    hover: (place, screen) => ui.hover(place, screen),
    leave: () => ui.hideHover(), select: place => ui.select(place), focus: region => ui.focus(region),
    openRegion: region => { if (ui.pageFiles[region]) location.href = ui.pageFiles[region]; else map?.focusRegion(region); },
    initialized: () => { clearTimeout(startupTimer); },
    ready: () => { clearTimeout(startupTimer); document.body.classList.add('hero-entered'); },
    error: () => fallback()
  };
  const fallback = () => {
    clearTimeout(startupTimer);
    if (map instanceof MuseumFlatMap) return;
    disposeMap();
    map = new MuseumFlatMap(document.getElementById('chinaScene'), callbacks);
    ui.map = map;
    if (window.museumApp) window.museumApp.map = map;
    document.querySelectorAll('.hero-heading,.hero-data,.hero-region-picker,.hero-bottom').forEach(element => { element.style.opacity = '1'; element.style.transform = 'none'; });
  };
  function disposeMap() {
    if (!map) return;
    cancelAnimationFrame(map.frame);
    map.timeline?.kill(); map.routeTween?.kill(); map.observer?.disconnect(); map.intersection?.disconnect();
    if(map.destroy)map.destroy(); else map.renderer?.dispose();
  }
  try {
    map = new MuseumMap(document.getElementById('chinaScene'), callbacks);
    ui.map = map;
    startupTimer = setTimeout(() => { if (!map?.renderer && !(map instanceof MuseumFlatMap)) fallback(); }, 8000);
  } catch (error) {
    fallback();
    console.warn('立体渲染不可用，已切换真实行政区交互地图。', error);
  }
  document.getElementById('focusNortheast').onclick=()=>map?.focusNortheast();
  document.getElementById('viewChina').onclick=()=>map?.reset();
  document.getElementById('replayIntro').onclick=()=>{document.body.classList.remove('hero-entered');map?.intro();};
  document.getElementById('zoomSceneIn').onclick=()=>map?.zoom(.8);
  document.getElementById('zoomSceneOut').onclick=()=>map?.zoom(1.25);
  document.getElementById('toggleMapMotion').onclick=event=>{
    if(!map)return;
    map.paused=!map.paused;
    if(map.timeline && map.timeline.progress()<1)map.timeline.paused(map.paused);
    map.routeTween?.paused(map.paused);
    event.currentTarget.textContent=map.paused?'▷':'Ⅱ';
    event.currentTarget.setAttribute('aria-label',map.paused?'开启动效':'暂停地图动效');
  };
  document.querySelectorAll('[data-focus-map]').forEach(button=>button.onclick=()=>{document.getElementById('home').scrollIntoView({behavior:'smooth'});map?.focusNortheast();});
  ui.animateStats();
  window.museumApp={ui,map,data:MUSEUM};
  window.addEventListener('pagehide',event=>{
    clearTimeout(startupTimer);
    if(!map)return;
    cancelAnimationFrame(map.frame);
    if(event.persisted)return;
    disposeMap();
  });
  window.addEventListener('pageshow',event=>{if(event.persisted&&map)map.render();});
})();
