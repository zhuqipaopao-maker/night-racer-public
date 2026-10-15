import * as THREE from 'three';
import { radialTexture } from './textures.js';

// Tyre smoke: one Points draw call, per-particle size & alpha.
export class Smoke {
  constructor(scene, max = 360) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64) }, scale: { value: 300 } },
      vertexShader: `attribute float size; attribute float alpha; uniform float scale; varying float vA;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.62,0.63,0.68), t.a * vA); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  emit(x, y, z, vx, vz, strength = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4], i * 3);
    this.vel.set([vx * 0.25 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, vz * 0.25 + (Math.random() - 0.5) * 1.5], i * 3);
    this.life[i] = 1.4 + Math.random() * 0.8; this.age[i] = 0; this.size[i] = 1.2; this.alpha[i] = 0.28 * strength;
  }
  update(dt, pixelRatio) {
    this.mat.uniforms.scale.value = 300 * pixelRatio;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      this.vel[i * 3] *= 0.97; this.vel[i * 3 + 2] *= 0.97;
      this.size[i] = 1.2 + k * 6;
      this.alpha[i] = Math.max(0, (1 - k)) * 0.3;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

// Skid marks: ring buffer of quads per rear wheel.
export class Skids {
  constructor(scene, perWheel = 1400) {
    this.per = perWheel;
    const total = perWheel * 2;
    this.pos = new Float32Array(total * 4 * 3);
    const idx = [];
    for (let q = 0; q < total; q++) { const b = q * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.geo = g;
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x050506, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
    this.cur = [0, 0]; this.last = [null, null];
    this.dirty = false;
  }
  add(w, x, z, on, y0 = 0) {
    if (!on) { this.last[w] = null; return; }
    const prev = this.last[w];
    this.last[w] = [x, z];
    if (!prev) return;
    const dx = x - prev[0], dz = z - prev[1], len = Math.hypot(dx, dz);
    if (len < 0.05) { this.last[w] = prev; return; }
    const px = -dz / len * 0.14, pz = dx / len * 0.14, y = y0 + 0.025;
    const q = w * this.per + this.cur[w]; this.cur[w] = (this.cur[w] + 1) % this.per;
    this.pos.set([prev[0] - px, y, prev[1] - pz, prev[0] + px, y, prev[1] + pz, x - px, y, z - pz, x + px, y, z + pz], q * 12);
    this.dirty = true;
  }
  update() { if (this.dirty) { this.geo.attributes.position.needsUpdate = true; this.dirty = false; } }
}

export class Rain {
  constructor(scene, count = 5000) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.seed.set([(Math.random() - 0.5) * 90, Math.random() * 40, (Math.random() - 0.5) * 90], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb2d6, transparent: true, opacity: 0.32, depthWrite: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.t = 0;
  }
  set visible(v) { this.lines.visible = v; }
  get visible() { return this.lines.visible; }
  update(dt, cx, cz, vx, vz, cy = 0) {
    if (!this.lines.visible) return;
    this.t += dt;
    const fall = 26;
    for (let i = 0; i < this.count; i++) {
      const sx = this.seed[i * 3], sz = this.seed[i * 3 + 2];
      let y = (this.seed[i * 3 + 1] - this.t * fall) % 40; if (y < 0) y += 40;
      const x = cx + ((sx - cx % 90 + 135) % 90) - 45, z = cz + ((sz - cz % 90 + 135) % 90) - 45;
      const k = i * 6;
      this.pos[k] = x; this.pos[k + 1] = y + cy - 15; this.pos[k + 2] = z;
      this.pos[k + 3] = x - vx * 0.012; this.pos[k + 4] = y + cy - 14.25; this.pos[k + 5] = z - vz * 0.012;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
