import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const PALETTE = ['#d9ac85','#7fae98','#88aabd','#bc92a5','#c8c189','#8da49b','#d2987d','#a19ebb','#a7bc96','#80b9b2','#c8a7b5','#cdb798','#7899ac','#bca780','#a8b9b1','#c3928f','#929bad','#c0c29c','#94b5c5','#b0a5be'];
const COLOR_CACHE = new Map();
export function stateColor(state) {
  if (!COLOR_CACHE.has(state)) {
    const color = new THREE.Color(PALETTE[((state * 7) % PALETTE.length + PALETTE.length) % PALETTE.length]);
    color.offsetHSL(0, ((Math.floor((state-1)/20)%5)-2)*.035, ((Math.floor((state-1)/20)%5)-2)*.045);
    COLOR_CACHE.set(state, '#'+color.getHexString());
  }
  return COLOR_CACHE.get(state);
}

export class LatticeViewer {
  constructor(element, onPick) {
    this.element = element;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    element.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotateSpeed = 0.8;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9daab0, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(-15, -20, 40);
    this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xcee6e5, 0.5);
    fill.position.set(20, 5, 10);
    this.scene.add(fill);
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clip = { enabled: false, axis: 2, value: Infinity };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(element);
    this.selected = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.035, 1.035, 1.035)), new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }));
    this.selected.visible = false;
    this.selected.renderOrder = 10;
    this.scene.add(this.selected);
    element.addEventListener('pointerdown', e => { this.down = [e.clientX, e.clientY, e.button]; });
    element.addEventListener('pointerup', e => {
      if (!this.down || this.down[2] !== 0 || Math.hypot(e.clientX-this.down[0], e.clientY-this.down[1]) > 4 || !this.mesh) return;
      const rect = element.getBoundingClientRect();
      this.pointer.set((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObject(this.mesh);
      const hit = hits.find(h => this.visibleSites[h.instanceId]);
      if (hit) {
        this.selectedIndex = hit.instanceId;
        this.updateSelection();
        this.onPick?.(this.selectedIndex);
      } else {
        this.selectedIndex = null;
        this.selected.visible = false;
        this.onPick?.(null);
      }
    });
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      element.dispatchEvent(new CustomEvent('viewer-error', { bubbles: true, detail: '三维图形上下文丢失，请刷新页面恢复。' }));
    });
    this.animate = this.animate.bind(this);
    this.animate();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.element;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  load(data, model = {}) {
    this.data = data;
    this.model = model;
    this.planar = data.modelId === 'thin_film';
    this.frameIndex = data.frames.length-1;
    this.selectedIndex = null;
    this.selected.visible = false;
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(o => { if(o.isInstancedMesh)o.dispose(); o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose(); });
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const mins = [Infinity,Infinity,Infinity], maxs = [-Infinity,-Infinity,-Infinity];
    for (const p of data.positions) for (let a=0;a<3;a++) { mins[a]=Math.min(mins[a],p[a]); maxs[a]=Math.max(maxs[a],p[a]); }
    this.center = mins.map((v,a)=>(v+maxs[a])/2);
    const spans = mins.map((v,a)=>maxs[a]-v+data.spacing);
    this.extent = Math.max(...spans);
    const geometry = this.planar ? new THREE.SphereGeometry(data.spacing*.43,12,8) : new THREE.BoxGeometry(data.spacing, data.spacing, data.spacing);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), data.ids.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...spans)), new THREE.LineBasicMaterial({ color: '#a4bfbe', transparent: true, opacity: 0.25 }));
    this.group.add(outline);
    const grid = new THREE.GridHelper(this.extent*2.2, 22, '#476569', '#36545b');
    grid.rotation.x = Math.PI/2;
    grid.position.z = -spans[2]/2-.12;
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    this.group.add(grid);
    grid.visible = !this.planar;
    const axes = new THREE.AxesHelper(this.extent*0.22);
    axes.position.set(-spans[0]/2-.4, -spans[1]/2-.4, -spans[2]/2-.05);
    this.group.add(axes);
    this.controls.minDistance = this.extent*.45;
    this.controls.maxDistance = this.extent*8;
    this.camera.far = this.extent*25;
    this.camera.updateProjectionMatrix();
    this.setClip(this.clip);
    this.setFrame(data.frames.length-1);
    this.reset();
  }

  reset() {
    if (!this.extent) return;
    this.camera.up.set(0, this.planar?1:0, this.planar?0:1);
    if(this.planar){
      this.controls.target.set(0,0,0);
      this.camera.position.set(0,0,this.extent*1.8/Math.min(1,this.camera.aspect));
      this.controls.update();
      return;
    }
    this.controls.target.set(0,0,-this.extent*.04);
    const scale = this.extent * (this.camera.aspect < 1 ? 2.6 : 1.65);
    this.camera.position.set(scale*1.08, -scale*1.42, scale*1.04);
    this.controls.update();
  }

  setFrame(index) {
    if (!this.data) return;
    this.frameIndex = index;
    const states = this.data.frames[index].states;
    for (let i=0;i<states.length;i++) this.mesh.setColorAt(i, this.color.set(this.model.colors?.[states[i]] || stateColor(states[i])));
    this.mesh.instanceColor.needsUpdate = true;
    if(this.planar)this.setClip(this.clip);
    this.updateSelection();
  }

  setClip(clip) {
    this.clip = { ...clip };
    if (!this.data) return;
    let count = 0;
    this.visibleSites = new Uint8Array(this.data.ids.length);
    for (let i=0;i<this.data.positions.length;i++) {
      const p=this.data.positions[i];
      const show = (!clip.enabled || p[clip.axis] <= clip.value + 1e-6) &&
        (!this.planar || this.showVacancies || this.data.frames[this.frameIndex].states[i] === 2);
      this.visibleSites[i] = show ? 1 : 0;
      if (show) { this.matrix.makeTranslation(p[0]-this.center[0],p[1]-this.center[1],p[2]-this.center[2]); count++; }
      else this.matrix.makeScale(0,0,0);
      this.mesh.setMatrixAt(i,this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    this.mesh.computeBoundingSphere();
    this.visibleCount=count;
    this.updateSelection();
  }

  updateSelection() {
    const i = this.selectedIndex;
    if (i == null || !this.data || !this.visibleSites[i]) { this.selected.visible=false; return; }
    const p=this.data.positions[i];
    this.selected.position.set(p[0]-this.center[0],p[1]-this.center[1],p[2]-this.center[2]);
    this.selected.scale.setScalar(this.data.spacing);
    this.selected.visible=true;
  }

  snapshot() { this.renderer.render(this.scene,this.camera); return this.renderer.domElement.toDataURL('image/png'); }

  animate() {
    this.animationId = requestAnimationFrame(this.animate);
    if (!this.element.clientWidth || document.hidden) return;
    this.controls.update();
    this.renderer.render(this.scene,this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.animationId);
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse(o=>{ o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material?.dispose(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
