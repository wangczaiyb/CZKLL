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
    const gold = new THREE.MeshStandardMaterial({color: 0xecc782, roughness: 0.3, metalness: 0.65, emissive: 0x90682b, emissiveIntensity: 0.3});
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 13, 24), gold);
    cone.rotation.x = -Math.PI / 2; cone.position.z = 6.5; group.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 2.1, 10, 28), gold);
    ring.rotation.x = Math.PI / 2; ring.position.z = 17; group.add(ring);
    const ground = new THREE.Mesh(new THREE.TorusGeometry(10, 0.45, 6, 40), new THREE.MeshBasicMaterial({color: 0xf3cf8a, transparent: true, opacity: 0.8}));
    ground.position.z = 0.5; group.add(ground);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.8, 33, 12, 1, true), new THREE.MeshBasicMaterial({color: 0xf4cf89, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide}));
    beam.rotation.x = Math.PI / 2; beam.position.z = 16.5; group.add(beam);
    group.userData.ground = ground;
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
      model.scale.set(scale, -scale, scale);
      model.userData.ground.material.opacity = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 0.6 + Math.sin(performance.now() / 700) * 0.2;
      model.userData.ground.material.color.set(marker.getElement().style.getPropertyValue('--category-color') || '#D4A428');
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
