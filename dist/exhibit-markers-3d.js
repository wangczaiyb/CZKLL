/* Shares the MapLibre WebGL context. Models are created at the first street-level view. */
class ExhibitMarkers3D {
  constructor(exhibitMap) {
    this.owner = exhibitMap;
    this.id = 'heritage-models';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.models = new Map();
  }

  onAdd(map, gl) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffe2b4, 1.8));
    const light = new THREE.DirectionalLight(0xfff2cd, 2.5);
    light.position.set(-1, -2, 4); this.scene.add(light);
    this.renderer = new THREE.WebGLRenderer({canvas: map.getCanvas(), context: gl, antialias: true});
    this.renderer.autoClear = false;
  }

  createModel() {
    const group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({color: 0xb99a65, roughness: 0.48, metalness: 0.7, emissive: 0x6b512d, emissiveIntensity: 0.08});
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 13, 24), gold);
    cone.rotation.x = -Math.PI / 2; cone.position.z = 6.5; group.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 2.1, 10, 28), gold);
    ring.rotation.x = Math.PI / 2; ring.position.z = 17; group.add(ring);
    const ground = new THREE.Mesh(new THREE.TorusGeometry(10, 0.45, 6, 40), new THREE.MeshBasicMaterial({color: 0xd4b16f, transparent: true, opacity: 0.5}));
    ground.position.z = 0.5; group.add(ground);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.8, 33, 12, 1, true), new THREE.MeshBasicMaterial({color: 0xd4b16f, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide}));
    beam.rotation.x = Math.PI / 2; beam.position.z = 16.5; group.add(beam);
    group.userData.ground = ground;
    group.userData.gold = gold;
    group.userData.beam = beam;
    return group;
  }

  render(gl, args) {
    const zoom = this.map.getZoom();
    const enabled = !this.owner.studyMode && zoom >= (this.owner.minimumZoom ?? 14.5) && this.map.getPitch() > 10;
    const activeKeys = new Set();
    for (const [key, marker] of this.owner.markers) {
      marker.getElement().classList.toggle('webgl-pin', enabled);
      if (!enabled) continue;
      activeKeys.add(key);
      let model = this.models.get(key);
      if (!model) {
        model = this.createModel(); this.scene.add(model); this.models.set(key, model);
      }
      const location = marker.getLngLat();
      const elevation = this.owner.terrain ? (this.map.queryTerrainElevation(location) || 0) : 0;
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(location, elevation + 1);
      const metersPerPixel = Math.cos(location.lat * Math.PI / 180) * 40075016.686 / (512 * Math.pow(2, zoom));
      const scale = mercator.meterInMercatorCoordinateUnits() * metersPerPixel * 1.6;
      model.position.set(mercator.x, mercator.y, mercator.z);
      const element = marker.getElement();
      const selected = element.classList.contains('selected');
      const size = selected ? scale * 1.12 : scale;
      model.scale.set(size, -size, size);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      model.userData.ground.material.opacity = selected && !reduced
        ? 0.55 + Math.sin(performance.now() / 800) * 0.15
        : 0.4;
      model.userData.beam.material.opacity = selected ? 0.1 : 0.025;
      model.userData.gold.color.set(element.classList.contains('end') ? '#9A7846' : element.classList.contains('start') || selected ? '#D4B16F' : '#B99A65');
    }
    this.models.forEach((model, key) => {
      if (activeKeys.has(key)) return;
      this.scene.remove(model);
      model.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      this.models.delete(key);
    });
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
    if (enabled && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden && !this.repaintTimer) {
      this.repaintTimer = setTimeout(() => { this.repaintTimer = null; this.map.triggerRepaint(); }, 33);
    }
  }

  onRemove() {
    clearTimeout(this.repaintTimer);
    this.scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    this.renderer.dispose();
  }
}

window.ExhibitMarkers3D = ExhibitMarkers3D;
