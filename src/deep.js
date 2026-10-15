import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 坠梦 — one long lap through six dream layers. Each layer's scenery sits beside its own stretch of road
// and is only drawn near it; sky, fog, light and exposure blend from layer to layer as you drive, and the
// big crossings (diving into the sea, bursting out of it into space, the moon gate) get their own moments.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// smooth 2D value noise for terrain and rocks
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += vnoise(x * f, z * f) * a; f *= 2.03; a *= 0.5; } return s; };

// look of each layer: sky gradient, stars, sun, fog, hemisphere + key light, exposure
export const LOOKS = {
  grid:   { top: [0.02, 0.01, 0.08], hor: [0.95, 0.22, 0.55], below: [0.05, 0.0, 0.1], stars: 1, neb: 0, sun: [0, 0.12, -1], sunCol: [1.0, 0.5, 0.6], sunSize: 0.28, stripe: 1,
            fog: [0.23, 0.05, 0.29], dens: 0.0011, hemiS: [1.0, 0.37, 0.82], hemiG: [0.13, 0.78, 1.0], hemiI: 0.9, key: [1.0, 0.54, 0.78], keyI: 1.6, exp: 1.1 },
  jungle: { top: [0.32, 0.5, 0.42], hor: [0.75, 0.82, 0.55], below: [0.1, 0.16, 0.08], stars: 0, neb: 0, sun: [0.3, 0.75, 0.6], sunCol: [1.0, 0.95, 0.75], sunSize: 0.03, stripe: 0,
            fog: [0.3, 0.4, 0.27], dens: 0.0042, hemiS: [0.85, 1.0, 0.7], hemiG: [0.16, 0.2, 0.08], hemiI: 1.25, key: [1.0, 0.9, 0.62], keyI: 2.0, exp: 1.0 },
  cloud:  { top: [0.22, 0.34, 0.72], hor: [1.0, 0.62, 0.34], below: [0.9, 0.75, 0.6], stars: 0, neb: 0, sun: [0.55, 0.1, 0.83], sunCol: [1.0, 0.8, 0.45], sunSize: 0.09, stripe: 0,
            fog: [0.95, 0.72, 0.52], dens: 0.0005, hemiS: [1.0, 0.88, 0.7], hemiG: [0.55, 0.42, 0.35], hemiI: 1.4, key: [1.0, 0.82, 0.6], keyI: 1.7, exp: 0.95 },
  city:   { top: [0.01, 0.02, 0.06], hor: [0.28, 0.12, 0.26], below: [0.04, 0.02, 0.06], stars: 0.4, neb: 0.2, sun: [-0.3, 0.05, 1], sunCol: [0.9, 0.5, 0.3], sunSize: 0.0, stripe: 0,
            fog: [0.11, 0.07, 0.15], dens: 0.0016, hemiS: [0.5, 0.56, 1.0], hemiG: [0.3, 0.15, 0.08], hemiI: 0.75, key: [1.0, 0.7, 0.45], keyI: 0.8, exp: 1.1 },
  seaTop: { top: [0.06, 0.16, 0.34], hor: [0.42, 0.66, 0.74], below: [0.05, 0.2, 0.26], stars: 0, neb: 0, sun: [-0.8, 0.25, -0.55], sunCol: [1.0, 0.9, 0.75], sunSize: 0.05, stripe: 0,
            fog: [0.3, 0.52, 0.6], dens: 0.0016, hemiS: [0.7, 0.88, 1.0], hemiG: [0.1, 0.25, 0.3], hemiI: 1.2, key: [1.0, 0.92, 0.8], keyI: 1.0, exp: 1.0 },
  sea:    { top: [0.0, 0.32, 0.42], hor: [0.0, 0.16, 0.24], below: [0.0, 0.05, 0.09], stars: 0, neb: 0, sun: [-0.8, 0.25, -0.55], sunCol: [0.4, 0.9, 1.0], sunSize: 0.0, stripe: 0,
            fog: [0.02, 0.17, 0.24], dens: 0.011, hemiS: [0.35, 0.8, 1.0], hemiG: [0.0, 0.12, 0.18], hemiI: 1.1, key: [0.5, 0.9, 1.0], keyI: 1.0, exp: 1.15 },
  space:  { top: [0.0, 0.0, 0.01], hor: [0.04, 0.02, 0.1], below: [0.01, 0.0, 0.03], stars: 1.6, neb: 1, sun: [0.6, 0.35, 0.2], sunCol: [1.0, 1.0, 1.0], sunSize: 0.025, stripe: 0,
            fog: [0.02, 0.01, 0.05], dens: 0.0003, hemiS: [0.55, 0.55, 1.0], hemiG: [0.15, 0.05, 0.2], hemiI: 0.8, key: [0.95, 0.95, 1.0], keyI: 2.2, exp: 1.05 },
};
// how long (metres of road) each layer takes to fade in
const FADE = { grid: 60, jungle: 320, cloud: 260, city: 360, seaTop: 260, sea: 1, space: 70 };

const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
const FOG_V = '\n#include <fog_pars_vertex>\n', FOG_F = '\n#include <fog_pars_fragment>\n';
const WORLD_V = `${FOG_V} varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;

// merge simple parts (each with one colour and a transform) into one geometry with vertex colours
function part(geo, color, m, jitter = 0, r = Math.random) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let k = 0; k < n; k += 3) { const f = 1 - jitter / 2 + r() * jitter; for (let q = 0; q < 3; q++) { c[(k + q) * 3] = col.r * f; c[(k + q) * 3 + 1] = col.g * f; c[(k + q) * 3 + 2] = col.b * f; } }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const M = () => new THREE.Matrix4();
// tilt (x) first, then turn (y)
const TRS = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
// displace a geometry's vertices outward by noise (rocks, asteroids); by position, so shared corners stay together
function lumpy(geo, amt, freq, seed = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); const n = fbm(v.x * freq + seed, v.z * freq + v.y * freq * 0.7, 3); v.multiplyScalar(1 + (n - 0.5) * amt); p.setXYZ(k, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}

// leaf textures drawn on canvas (alpha-tested, so no sorting)
function leafTex(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  if (kind === 'fern') {
    g.strokeStyle = '#2f5a1e'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 256); g.quadraticCurveTo(70, 120, 60, 4); g.stroke();
    for (let y = 240; y > 12; y -= 12) { const w = 56 * Math.sin((256 - y) / 256 * Math.PI) + 6, cx = 64 + (256 - y) * -0.02; g.fillStyle = `hsl(${100 + (y % 24)},55%,${28 + (y % 36) / 3}%)`;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + sd * w * 0.6, y - 10, cx + sd * w, y - 16); g.quadraticCurveTo(cx + sd * w * 0.5, y - 2, cx, y + 4); g.fill(); } }
  } else if (kind === 'palm') {
    g.strokeStyle = '#4a6a20'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 256); g.lineTo(64, 0); g.stroke();
    for (let y = 250; y > 6; y -= 7) { const w = 60 * Math.sin((256 - y) / 256 * Math.PI * 0.9 + 0.15); g.strokeStyle = `hsl(${88 + (y % 20)},50%,${30 + (y % 14)}%)`; g.lineWidth = 5;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(64, y); g.lineTo(64 + sd * w, y - 22); g.stroke(); } }
  } else {   // broad leaf
    const grd = g.createLinearGradient(0, 0, 128, 0); grd.addColorStop(0, '#1f4a1a'); grd.addColorStop(0.5, '#3f7a2a'); grd.addColorStop(1, '#1f4a1a');
    g.fillStyle = grd; g.beginPath(); g.moveTo(64, 252); g.bezierCurveTo(-30, 170, 10, 30, 64, 4); g.bezierCurveTo(118, 30, 158, 170, 64, 252); g.fill();
    g.strokeStyle = 'rgba(160,200,120,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 250); g.lineTo(64, 8); g.stroke();
    for (let y = 220; y > 30; y -= 22) for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + sd * 25, y - 12, 64 + sd * 46, y - 30); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// a curved strip (frond / leaf) along +z from the origin, arching up then drooping: length L, width W
function frondGeo(L, W, droop, seg = 6) {
  const g = new THREE.PlaneGeometry(W, L, 1, seg); g.translate(0, L / 2, 0); g.rotateX(Math.PI / 2);   // lies along +z
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const t = p.getZ(k) / L; p.setY(k, Math.sin(t * Math.PI * 0.6) * L * 0.25 - droop * t * t * L); }
  g.computeVertexNormals(); return g;
}

export function buildDeep(scene, track, opts = {}) {
  const Q = opts.quality ?? 1;
  const r = rng(77);
  const time = { value: 0 }, beat = track.beat || { value: 0 };
  const Z = track.cfg.zones, N = track.N, step = track.step;
  const idx = m => Math.max(0, Math.min(N - 1, Math.round(m / step)));
  const zoneRange = name => { const out = []; Z.forEach(([n, s], k) => { if (n === name) out.push([s, k + 1 < Z.length ? Z[k + 1][1] : track.length]); }); return out; };
  const samples = (m0, m1, every = 4) => { const a = []; for (let i = idx(m0); i <= idx(m1); i += every) a.push(i); return a; };
  // spatial hash of the centreline: nearest road distance anywhere, fast
  const CELL = 40, hashT = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(track.px[i] / CELL) + ',' + Math.floor(track.pz[i] / CELL); if (!hashT.has(k)) hashT.set(k, []); hashT.get(k).push(i); }
  const nearRoad = (x, z, R = 160) => {
    let best = 1e18, bi = -1; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), n = Math.ceil(R / CELL);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { const L = hashT.get((cx + a) + ',' + (cz + b)); if (L) for (const i of L) { const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2; if (d < best) { best = d; bi = i; } } }
    return { d: Math.sqrt(best), i: bi };
  };
  const far = (x, z, d) => nearRoad(x, z, d + CELL).d >= d;
  const bbox = (m0, m1, pad) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const i of samples(m0, m1)) { a = Math.min(a, track.px[i]); b = Math.max(b, track.px[i]); c = Math.min(c, track.pz[i]); d = Math.max(d, track.pz[i]); } return { x0: a - pad, x1: b + pad, z0: c - pad, z1: d + pad }; };
  const groups = [];
  const layer = (ranges, margin = 700) => { const g = new THREE.Group(); scene.add(g); groups.push({ g, ranges, margin }); return g; };
  const E = track.edge;
  const m4 = M();
  // like instanced(), but split into square cells so each cell is frustum-culled on its own (and, with
  // maxDist, hidden beyond that distance from the camera). list items start with [x, y, z, ...].
  const culled = [];
  const chunked = (geo, mat, list, setter, cell = 260, maxDist = 0) => {
    const grp = new THREE.Group(), cells = new Map();
    list.forEach((it, k) => { const key = Math.floor(it[0] / cell) + ',' + Math.floor(it[2] / cell); if (!cells.has(key)) cells.set(key, []); cells.get(key).push([it, k]); });
    for (const items of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach(([it, k], n) => { setter(m4, it, k, { setColorAt: (_, c) => im.setColorAt(n, c) }); im.setMatrixAt(n, m4); });
      im.computeBoundingSphere(); grp.add(im);
      if (maxDist) culled.push([im, maxDist]);
    }
    return grp;
  };
  const instanced = (geo, mat, list, setter) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length; list.forEach((it, k) => { setter(m4, it, k, im); im.setMatrixAt(k, m4); }); return im; };
  const neon = (r0, g0, b0) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r0, g0, b0), toneMapped: false }); m.onBeforeCompile = sh => { sh.uniforms.beat = beat; sh.fragmentShader = 'uniform float beat;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= 0.55 + beat * 0.9;'); }; return m; };
  const jung = zoneRange('jungle')[0], JB = bbox(jung[0], jung[1], 420);

  // ---------- sky dome (follows the camera) ----------
  const U = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, below: { value: new THREE.Color() }, stars: { value: 0 }, neb: { value: 0 },
    sun: { value: new THREE.Vector3(0, 0.1, -1) }, sunCol: { value: new THREE.Color() }, sunSize: { value: 0.1 }, stripe: { value: 0 }, time, beat };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, hor, below, sunCol, sun; uniform float stars, neb, sunSize, stripe, time, beat; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = vP.y;
        vec3 c = y >= 0.0 ? mix(hor, top, smoothstep(0.0, 0.55, y)) : mix(hor, below, smoothstep(0.0, -0.25, y));
        vec3 q = floor(vP * 320.0); float st = step(0.996, h(q)) * (0.5 + 0.5 * sin(time * 2.0 + h(q) * 40.0));
        c += st * stars * smoothstep(-0.2, 0.3, y);
        float n = sin(vP.x * 4.0 + vP.y * 3.0) * sin(vP.z * 5.0 - vP.y * 2.0 + 1.3) + 0.5 * sin(vP.x * 11.0 + vP.z * 7.0);
        c += neb * (vec3(0.35, 0.08, 0.5) * smoothstep(0.2, 1.2, n) + vec3(0.05, 0.2, 0.45) * smoothstep(0.3, 1.3, -n));
        vec3 sd = normalize(sun);
        if (sunSize > 0.001 && dot(vP, sd) > 0.0) {
          vec3 rgt = normalize(cross(vec3(0.0,1.0,0.0), sd)); vec3 up = cross(sd, rgt);
          vec2 uv = vec2(dot(vP, rgt), dot(vP, up)) / sunSize; float d = length(uv);
          float band = stripe * step(0.0, -uv.y) * step(0.5, fract((uv.y + time * 0.05) * 9.0)) * smoothstep(0.0, -0.9, uv.y);
          float disc = (1.0 - smoothstep(0.96, 1.0, d)) * (1.0 - band);
          vec3 scol = stripe > 0.5 ? mix(vec3(1.0,0.25,0.6), vec3(1.0,0.9,0.25), smoothstep(-1.0, 1.0, uv.y)) : sunCol;
          c = mix(c, scol * 1.6, disc);
          c += sunCol * 0.35 * exp(-max(d - 1.0, 0.0) * (stripe > 0.5 ? 3.0 : 1.2)) * (0.9 + beat * 0.2 * stripe);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // =====================================================================================================
  // 1. 霓虹网格: endless glowing grid (dissolving into moss toward the jungle), wireframe ranges, neon arches, palms
  // =====================================================================================================
  {
    const g = layer([...zoneRange('grid').map(([a, b]) => (a > 0 ? [a - 30, b, 20] : [a, b])), [jung[0], jung[0] + 500]], 250);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), new THREE.ShaderMaterial({
      uniforms: { time, beat, jb: { value: new THREE.Vector4(JB.x0, JB.z0, JB.x1, JB.z1) } }, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; uniform float beat; uniform vec4 jb; varying vec3 vW;
        void main(){
          vec2 g = abs(fract(vW.xz / 24.0 - 0.5) - 0.5) / fwidth(vW.xz / 24.0);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float dist = length(vW.xz - cameraPosition.xz);
          // distance outside the jungle's box: near it the lines turn green and break up into moss
          vec2 q = max(jb.xy - vW.xz, vW.xz - jb.zw); float out_ = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          if (out_ < -60.0) discard;   // well inside the jungle the forest floor takes over
          float jm = 1.0 - smoothstep(-40.0, 160.0, out_);
          float brk = step(jm * 1.1, fract(sin(dot(floor(vW.xz / 6.0), vec2(12.9, 78.2))) * 43758.5));
          vec3 lc = mix(vec3(1.0,0.2,0.85), vec3(0.3,0.8,1.0), 0.5 + 0.5 * sin(vW.x * 0.004 + time * 0.3));
          lc = mix(lc, vec3(0.35, 1.0, 0.4), jm);
          vec3 c = mix(vec3(0.04, 0.0, 0.08), vec3(0.05, 0.08, 0.03), jm) + lc * line * brk * exp(-dist * 0.0009) * (0.9 + beat * 0.8);
          c = mix(c, mix(vec3(0.6,0.12,0.4), vec3(0.25,0.35,0.2), jm), 1.0 - exp(-dist * 0.00035));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    grid.rotation.x = -Math.PI / 2; grid.position.set(400, -2, 600); g.add(grid);
    // wireframe mountain ranges: ridged heightfields standing well back from the road
    const rangeFill = new THREE.MeshBasicMaterial({ color: 0x0d0420 });
    const rangeWire = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.3, 2.1), wireframe: true, toneMapped: false, transparent: true, opacity: 0.8 });
    const ranges = [[650, -650, 0.25, 1500, 240], [-650, -250, 1.35, 1100, 180], [1650, -350, -0.6, 1000, 200], [-900, 700, 1.6, 900, 160], [300, -1050, 0.05, 1800, 300]];
    for (const [x, z, rot, W, Hm] of ranges) {
      const geo = new THREE.PlaneGeometry(W, W * 0.28, Math.round(W / 22), 14); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const px = p.getX(k), pz = p.getZ(k), across = 1 - Math.abs(pz) / (W * 0.14), along = 1 - Math.pow(Math.abs(px) / (W / 2), 4);
        const ridge = 1 - Math.abs(fbm(px * 0.004 + x, pz * 0.01 + z, 4) * 2 - 1);
        p.setY(k, Math.max(0, across) * Math.max(0, along) * (ridge * ridge * Hm + fbm(px * 0.02, pz * 0.02, 2) * Hm * 0.25));
      }
      geo.computeVertexNormals();
      const fill = new THREE.Mesh(geo, rangeFill), wire = new THREE.Mesh(geo, rangeWire);
      for (const o of [fill, wire]) { o.position.set(x, -2, z); o.rotation.y = rot; g.add(o); }
      wire.position.y = -1.6;
    }
    // neon arches over the road, pink and cyan, pulsing with the music
    const archI = [];
    for (const [a, b] of zoneRange('grid')) for (let s = a + 60; s < b - 40; s += 130) archI.push(idx(s));
    const archGeo = new THREE.TorusGeometry(E + 2.5, 0.35, 8, 40, Math.PI);
    for (const [k, mat] of [[0, neon(2.6, 0.35, 1.6)], [1, neon(0.35, 2.0, 2.6)]]) {
      const list = archI.filter((_, n) => n % 2 === k);
      g.add(instanced(archGeo, mat, list, (m, i) => m.compose(new THREE.Vector3(track.px[i], track.py[i], track.pz[i]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(track.tx[i], track.tz[i]), 0)), new THREE.Vector3(1, 0.9, 1))));
    }
    // neon palms
    const trunk = [], frond = [];
    for (let t = 0; t < 4000 && trunk.length < 8 * 6 * 70 * Q; t++) {
      const zr = zoneRange('grid'), [m0, m1] = zr[Math.floor(r() * zr.length)], i = idx(m0 + r() * (m1 - m0)), sd = r() < 0.5 ? -1 : 1, off = sd * (E + 14 + r() * 80);
      const x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
      if (!far(x, z, E + 10) || (x > JB.x0 && x < JB.x1 && z > JB.z0 && z < JB.z1)) continue;
      const H = 14 + r() * 10, lean = (r() - 0.5) * 0.4; let px = x, py = -2, pz = z;
      for (let k = 1; k <= 8; k++) { const u = k / 8, nx = x + Math.sin(lean) * H * u * u, ny = -2 + H * u; trunk.push(px, py, pz, nx, ny, z); px = nx; py = ny; pz = z; }
      for (let f = 0; f < 7; f++) { const a = (f / 7) * Math.PI * 2 + r() * 0.3; let fx = px, fy = py, fz = pz;
        for (let k = 1; k <= 5; k++) { const u = k / 5, nx = px + Math.cos(a) * 7 * u, ny = py + 2.5 * Math.sin(u * 2.5) - 4 * u * u, nz = pz + Math.sin(a) * 7 * u; frond.push(fx, fy, fz, nx, ny, nz); fx = nx; fy = ny; fz = nz; } }
    }
    const lines = (pts, c) => { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: c, toneMapped: false }))); };
    lines(trunk, new THREE.Color(2.4, 0.45, 1.7)); lines(frond, new THREE.Color(0.35, 2.2, 1.6));
  }

  // =====================================================================================================
  // 2. 雨林: a rolling jungle floor, giant buttressed trees arching over the road, palms, ferns, vines,
  //    a river with a waterfall under the bridge, light shafts and fireflies
  // =====================================================================================================
  {
    const g = layer([jung], 450);
    const ri = idx(track.cfg.river), RP = new THREE.Vector2(track.px[ri], track.pz[ri]);
    const Rd = new THREE.Vector2(track.nx[ri], track.nz[ri]), Rt = new THREE.Vector2(track.tx[ri], track.tz[ri]);
    // river: across the road at the bridge, meandering a little; u along the river, v across it
    const riverUV = (x, z) => { const dx = x - RP.x, dz = z - RP.y; const u = dx * Rd.x + dz * Rd.y; const v = dx * Rt.x + dz * Rt.y - Math.sin(u * 0.018) * 14; return [u, v]; };
    const FALL_U = 135, LOW_W = -3.4, HIGH_W = 13.5;
    const ground = (x, z) => {
      // rolling forest floor, kept above the dream grid (y = -2) so nothing sinks under it
      let h = Math.max(0.5, fbm(x * 0.006, z * 0.006, 4) * 26 - 7 + fbm(x * 0.03, z * 0.03, 2) * 3);
      // the river: a channel, and upstream of the falls a shelf with cliffs either side — only close to the river
      const [u, v] = riverUV(x, z), av = Math.abs(v);
      if (Math.abs(u) < 420 && av < 90) {
        const high = u > FALL_U, near = 1 - THREE.MathUtils.smoothstep(av, 60, 90);
        const bed = (high ? HIGH_W - 3 : LOW_W - 3.5) + Math.min(1, av / 14) ** 2 * 6;
        const bank = THREE.MathUtils.smoothstep(av, 10, 34);
        let rv = bed * (1 - bank) + Math.max(h, high ? HIGH_W + 4 : bed) * bank;
        if (high && av > 16) rv += THREE.MathUtils.smoothstep(u, FALL_U, FALL_U + 25) * 10;
        h = h * (1 - near) + rv * near;
      }
      // the road always wins: the ground comes up (or down) to just under the deck, except in the river under the bridge
      const q = nearRoad(x, z, 120);
      if (q.i >= 0) {
        const ry = track.py[q.i] - 1.4, k = THREE.MathUtils.smoothstep(q.d, E + 4, E + 45);
        const inChannel = Math.abs(u) < 60 && av < 22;
        if (!inChannel) h = ry * (1 - k) + h * k; else h = Math.min(h, ry * (1 - k) + h * k);
      }
      // only at the very edge does the floor dip away under the grid
      const ex = Math.min(x - JB.x0, JB.x1 - x, z - JB.z0, JB.z1 - z);
      return h - (1 - THREE.MathUtils.smoothstep(ex, 0, 120)) * 12;
    };
    const W = JB.x1 - JB.x0, D = JB.z1 - JB.z0, res = 5.5 / Math.min(1, Q + 0.3);
    const tg = new THREE.PlaneGeometry(W, D, Math.round(W / res), Math.round(D / res)); tg.rotateX(-Math.PI / 2); tg.translate((JB.x0 + JB.x1) / 2, 0, (JB.z0 + JB.z1) / 2);
    const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), moss = new THREE.Color(0x3d5a22), mud = new THREE.Color(0x5a4a30), dark = new THREE.Color(0x1e3012), tmpc = new THREE.Color();
    for (let k = 0; k < tp.count; k++) {
      const x = tp.getX(k), z = tp.getZ(k), h = ground(x, z); tp.setY(k, h);
      const [u, v] = riverUV(x, z), nearW = Math.abs(u) < 420 ? 1 - THREE.MathUtils.smoothstep(Math.abs(v), 10, 26) : 0;
      tmpc.copy(moss).lerp(dark, fbm(x * 0.05, z * 0.05, 2)).lerp(mud, nearW * 0.8);
      tc.set([tmpc.r, tmpc.g, tmpc.b], k * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.computeVertexNormals();
    g.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));
    // river water (two levels) and the waterfall between them
    const waterMat = new THREE.ShaderMaterial({
      uniforms: { ...fogU(), time }, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: WORLD_V.replace('varying vec3 vW;', 'varying vec3 vW; varying vec2 vU; attribute vec2 flow;').replace('vW = w.xyz;', 'vW = w.xyz; vU = flow;'),
      fragmentShader: `${FOG_F} uniform float time; varying vec3 vW; varying vec2 vU;
        void main(){ float f = sin(vU.x * 0.6 - time * 4.0 + sin(vU.y * 0.8) * 2.0) * 0.5 + 0.5; float foam = smoothstep(0.82, 1.0, f) * 0.6 + smoothstep(0.7, 1.0, abs(vU.y) / 12.0) * 0.4;
          vec3 c = mix(vec3(0.12, 0.32, 0.26), vec3(0.75, 0.9, 0.85), foam); gl_FragColor = vec4(c, 0.85);
          #include <fog_fragment>
        }`,
    });
    const ribbon = (u0, u1, y, Wd) => {
      const pos = [], fl = [], ind = []; let n = 0;
      for (let u = u0; u <= u1; u += 6) { for (const v of [-Wd, Wd]) { const vv = v + Math.sin(u * 0.018) * 14; pos.push(RP.x + Rd.x * u + Rt.x * vv, y, RP.y + Rd.y * u + Rt.y * vv); fl.push(u, v); } if (n) ind.push(2 * n - 2, 2 * n - 1, 2 * n, 2 * n - 1, 2 * n + 1, 2 * n); n++; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('flow', new THREE.Float32BufferAttribute(fl, 2)); geo.setIndex(ind); geo.computeVertexNormals();
      return new THREE.Mesh(geo, waterMat);
    };
    g.add(ribbon(-420, FALL_U + 2, LOW_W, 13), ribbon(FALL_U - 1, 420, HIGH_W, 11));
    {
      const fu = FALL_U, cx = RP.x + Rd.x * fu + Rt.x * Math.sin(fu * 0.018) * 14, cz = RP.y + Rd.y * fu + Rt.y * Math.sin(fu * 0.018) * 14;
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(24, HIGH_W - LOW_W + 1, 1, 1), new THREE.ShaderMaterial({
        uniforms: { ...fogU(), time }, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `${FOG_V} varying vec2 vU; void main(){ vU = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
        fragmentShader: `${FOG_F} uniform float time; varying vec2 vU;
          void main(){ float s = fract(vU.y * 3.0 + time * 1.6 + sin(vU.x * 31.0) * 0.3); float streak = 0.55 + 0.45 * sin(vU.x * 80.0 + sin(vU.x * 13.0) * 4.0);
            vec3 c = mix(vec3(0.55, 0.75, 0.75), vec3(1.0), streak * smoothstep(0.2, 1.0, s)); gl_FragColor = vec4(c, 0.75 + 0.2 * streak);
            #include <fog_fragment>
          }`,
      }));
      fall.position.set(cx, (HIGH_W + LOW_W) / 2, cz); fall.lookAt(cx - Rd.x, (HIGH_W + LOW_W) / 2, cz - Rd.y); g.add(fall);
      // spray at the foot of the falls
      const sp = [...Array(16)].map(() => [r(), r(), r()]);
      g.add(instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xe8f4f0, transparent: true, opacity: 0.35, depthWrite: false }), sp,
        (m, [a, b, c]) => m.compose(new THREE.Vector3(cx - Rd.x * (3 + a * 8) + Rt.x * (b - 0.5) * 18, LOW_W + 1 + c * 3, cz - Rd.y * (3 + a * 8) + Rt.y * (b - 0.5) * 18), new THREE.Quaternion(), new THREE.Vector3(3 + a * 3, 2 + c * 2, 3 + b * 3))));
    }
    // a stone arch under the road where it crosses the river
    {
      const i = ri, yaw = Math.atan2(track.tx[i], track.tz[i]), y = track.py[i];
      const arch = new THREE.Mesh(new THREE.TorusGeometry(15, 2.2, 8, 24, Math.PI), new THREE.MeshLambertMaterial({ color: 0x8a8070 }));
      arch.position.set(track.px[i], y - 1.3 - 15 * 0.45, track.pz[i]); arch.rotation.set(0, yaw + Math.PI / 2, 0); arch.scale.set(1.25, 0.45, 5.4); g.add(arch);
    }
    // ---- trees ----
    const bark = new THREE.MeshLambertMaterial({ vertexColors: true });
    const leaves = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // giant tree (unit height): tapered trunk with buttress fins, big branches, a broad layered crown
    const giantTrunk = (() => { const P = [part(new THREE.CylinderGeometry(0.018, 0.045, 1, 9, 4).translate(0, 0.5, 0), 0x6e6250, null, 0.2, r)];
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + r() * 0.4; P.push(part(new THREE.BoxGeometry(0.008, 1, 1).translate(0, 0.5, 0.5), 0x5e5444, TRS(0, 0, 0, 0, a, 0, 1, 0.16, 0.09), 0.2, r)); }
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + r(); P.push(part(new THREE.CylinderGeometry(0.006, 0.012, 1, 6).translate(0, 0.5, 0), 0x6e6250, TRS(0, 0.72, 0, 0.9, a, 0, 1, 0.32, 1), 0.2, r)); }
      return mergeGeometries(P); })();
    const giantCrown = (() => { const P = [];
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, d = k === 0 ? 0 : 0.28 + r() * 0.12; P.push(part(new THREE.IcosahedronGeometry(1, 1), [0x2e5a22, 0x3b6e2a, 0x24481c, 0x4a7a30][k % 4], TRS(Math.cos(a) * d, 0.94 + r() * 0.08, Math.sin(a) * d, 0, r() * 6, 0, 0.22 + r() * 0.08, 0.1 + r() * 0.04, 0.22 + r() * 0.08), 0.25, r)); }
      return mergeGeometries(P); })();
    const midTree = (() => { const P = [part(new THREE.CylinderGeometry(0.02, 0.035, 0.75, 7).translate(0, 0.375, 0), 0x5a503f, null, 0.2, r)];
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; P.push(part(new THREE.IcosahedronGeometry(1, 0), [0x305e24, 0x3e7230, 0x27501d][k % 3], TRS(Math.cos(a) * 0.15, 0.78 + (k % 2) * 0.1, Math.sin(a) * 0.15, 0, r() * 6, 0, 0.2, 0.16, 0.2), 0.25, r)); }
      return mergeGeometries(P); })();
    const giants = [], mids = [], palmsL = [], ferns = [], bigLeaf = [], vines = [], flowers = [];
    const inRiver = (x, z) => { const [u, v] = riverUV(x, z); return Math.abs(u) < 430 && Math.abs(v) < 26; };
    const jS = () => idx(jung[0] + 40 + r() * (jung[1] - jung[0] - 60));
    // the green tunnel: giants right beside the road, leaning in so their crowns meet overhead
    for (let s = jung[0] + 60; s < jung[1] - 40; s += 30 + r() * 18) for (const sd of [-1, 1]) {
      if (r() < 0.2) continue;
      const i = idx(s + r() * 10), off = sd * (E + 6 + r() * 10), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
      if (inRiver(x, z) || !far(x, z, E + 5)) continue;
      giants.push([x, ground(x, z), z, 30 + r() * 14, Math.atan2(-track.nx[i] * sd, -track.nz[i] * sd), 0.12 + r() * 0.1]);
    }
    const jbox = pad => [JB.x0 + pad + r() * (W - 2 * pad), JB.z0 + pad + r() * (D - 2 * pad)];
    for (let t = 0; t < 6000 && giants.length < 260 * Q + 40; t++) { const [x, z] = jbox(120); if (inRiver(x, z) || !far(x, z, E + 14)) continue; giants.push([x, ground(x, z), z, 28 + r() * 16, r() * 6, r() * 0.06]); }
    for (let t = 0; t < 9000 && mids.length < 700 * Q + 80; t++) { const [x, z] = jbox(100); if (inRiver(x, z) || !far(x, z, E + 6)) continue; mids.push([x, ground(x, z), z, 12 + r() * 10]); }
    for (let t = 0; t < 6000 && palmsL.length < 260 * Q + 30; t++) { const [x, z] = jbox(100); if (inRiver(x, z) || !far(x, z, E + 4)) continue; palmsL.push([x, ground(x, z), z, 7 + r() * 7, r() * 6]); }
    // undergrowth: thickest just outside the barriers
    for (let t = 0; t < 30000 && ferns.length < 2600 * Q + 200; t++) {
      let x, z; if (r() < 0.6) { const i = jS(), sd = r() < 0.5 ? -1 : 1, off = sd * (E + 2 + Math.pow(r(), 2) * 50); x = track.px[i] + track.nx[i] * off; z = track.pz[i] + track.nz[i] * off; } else [x, z] = jbox(80);
      if (!far(x, z, E + 1.5) || inRiver(x, z)) continue; ferns.push([x, ground(x, z), z, 1.4 + r() * 1.8, r() * 6]);
    }
    for (let t = 0; t < 12000 && bigLeaf.length < 900 * Q + 80; t++) {
      const i = jS(), sd = r() < 0.5 ? -1 : 1, off = sd * (E + 2 + r() * 35), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
      if (!far(x, z, E + 1.5) || inRiver(x, z)) continue; bigLeaf.push([x, ground(x, z), z, 1 + r() * 1.5, r() * 6]);
    }
    const lean = (m, x, y, z, h, a, l, sxz) => m.compose(new THREE.Vector3(x, y - 0.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(l, a, 0, 'YXZ')), new THREE.Vector3(h * sxz, h, h * sxz));
    g.add(chunked(giantTrunk, bark, giants, (m, [x, y, z, h, a, l]) => lean(m, x, y, z, h, a, l, 1), 200, 520));
    g.add(chunked(giantCrown, leaves, giants, (m, [x, y, z, h, a, l]) => lean(m, x, y, z, h, a, l, 1.05), 200, 520));
    g.add(chunked(midTree, leaves, mids, (m, [x, y, z, h]) => lean(m, x, y + 0.2, z, h, x * 0.37, 0, 0.9), 160, 420));
    // vines hanging from the giants' crowns
    for (const [x, y, z, h, a, l] of giants) { if (r() < 0.4) continue; for (let k = 0; k < 4; k++) {
      const ang = r() * 6.28, d = h * (0.1 + r() * 0.22), top = new THREE.Vector3(Math.cos(ang) * d, h * 0.9, Math.sin(ang) * d).applyEuler(new THREE.Euler(l, a, 0, 'YXZ')).add(new THREE.Vector3(x, y, z)), len = 6 + r() * h * 0.5;
      let px = top.x, py = top.y, pz = top.z; for (let q = 1; q <= 5; q++) { const nx = top.x + Math.sin(q * 0.9 + ang) * 0.6, ny = top.y - len * q / 5, nz = top.z + Math.cos(q * 0.7 + ang) * 0.6; vines.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz; } } }
    { const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vines, 3)); g.add(new THREE.LineSegments(vg, new THREE.LineBasicMaterial({ color: 0x2a4a1a }))); }
    // palms: curved trunk + textured fronds
    const palmTex = leafTex('palm'), fernTex = leafTex('fern'), broadTex = leafTex('broad');
    const leafMat = tex => new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
    const palmTrunk = (() => { const pts = []; for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3(Math.pow(k / 6, 2) * 0.25, k / 6, 0)); return part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.035, 6), 0x7a6a4a, null, 0.3, r); })();
    const upright = (m, [x, y, z, h, a]) => m.compose(new THREE.Vector3(x, y - 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(h, h, h));
    g.add(chunked(palmTrunk, bark, palmsL, upright, 160, 400));
    const palmFronds = (() => { const P = []; for (let k = 0; k < 9; k++) { const geo = frondGeo(0.55, 0.16, 0.9); geo.applyMatrix4(TRS(0.25, 1, 0, -0.15, k / 9 * Math.PI * 2, 0)); P.push(geo); } return mergeGeometries(P); })();
    g.add(chunked(palmFronds, leafMat(palmTex), palmsL, upright, 160, 400));
    const fernGeo = (() => { const P = []; for (let k = 0; k < 7; k++) { const geo = frondGeo(1, 0.4, 0.7); geo.applyMatrix4(TRS(0, 0, 0, -0.5 - r() * 0.4, k / 7 * Math.PI * 2 + r() * 0.3, 0)); P.push(geo); } return mergeGeometries(P); })();
    g.add(chunked(fernGeo, leafMat(fernTex), ferns, (m, [x, y, z, s, a]) => m.compose(new THREE.Vector3(x, y - 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(s, s, s)), 120, 260));
    const broadGeo = (() => { const P = []; for (let k = 0; k < 5; k++) { const geo = frondGeo(1.3, 0.7, 0.5); geo.applyMatrix4(TRS(0, 0.4 + k * 0.08, 0, -0.9 + k * 0.1, k / 5 * Math.PI * 2, 0)); P.push(geo); } return mergeGeometries(P); })();
    g.add(chunked(broadGeo, leafMat(broadTex), bigLeaf, (m, [x, y, z, s, a]) => m.compose(new THREE.Vector3(x, y - 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(s * 1.6, s * 1.6, s * 1.6)), 120, 260));
    // flowers in the undergrowth
    for (let k = 0; k < ferns.length; k += 3) { const [x, y, z, s] = ferns[k]; flowers.push([x + (r() - 0.5) * 2, y + s * 0.5, z + (r() - 0.5) * 2]); }
    const flowerCols = [new THREE.Color(2.2, 0.4, 0.9), new THREE.Color(2.4, 1.6, 0.3), new THREE.Color(1.8, 0.3, 0.3), new THREE.Color(0.9, 0.6, 2.2)];
    g.add(chunked(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), flowers, (m, [x, y, z], k, im) => { m.makeTranslation(x, y, z); im.setColorAt(k, flowerCols[k % 4]); }, 120, 220));
    // light shafts slanting down through gaps in the canopy
    const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.85, 0.55), transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const shafts = []; for (let k = 0; k < 40 * Q + 10; k++) { const i = jS(), off = (r() < 0.5 ? -1 : 1) * (16 + r() * 40); shafts.push([track.px[i] + track.nx[i] * off, track.py[i], track.pz[i] + track.nz[i] * off, r() * 6]); }
    g.add(instanced(new THREE.CylinderGeometry(1.5, 5, 1, 6, 1, true).translate(0, 0.5, 0), shaftMat, shafts, (m, [x, y, z, a]) => m.compose(new THREE.Vector3(x, y - 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, a, 0, 'YXZ')), new THREE.Vector3(1, 45, 1))));
    // fireflies drifting in the gloom
    const ffN = Math.round(900 * Q + 100), fp = new Float32Array(ffN * 3);
    for (let k = 0; k < ffN; k++) { const i = jS(), off = (r() - 0.5) * 90; fp.set([track.px[i] + track.nx[i] * off, track.py[i] + 0.5 + r() * 8, track.pz[i] + track.nz[i] * off], k * 3); }
    const ffg = new THREE.BufferGeometry(); ffg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    g.add(new THREE.Points(ffg, new THREE.ShaderMaterial({ uniforms: { time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float time; varying float vA; void main(){ vec3 p = position; float ph = p.x * 0.31 + p.z * 0.17;
        p += vec3(sin(time * 0.6 + ph), sin(time * 0.9 + ph * 1.3) * 0.6, cos(time * 0.5 + ph)) * 1.5;
        vA = 0.5 + 0.5 * sin(time * 2.5 + ph * 3.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 140.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.95, 0.4) * vA * 2.0, smoothstep(0.5, 0.0, d)); }` })));
  }

  // =====================================================================================================
  // 3. 云海之上: a golden sea of cloud, cumulus towers, floating islands with waterfalls, ruins and birds
  // =====================================================================================================
  const CLOUD_Y = 45;
  let birds = null;
  {
    const [[c0, c1]] = zoneRange('cloud'), g = layer([[c0, c1]], 700), B = bbox(c0, c1, 1400);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0, 1, 1), new THREE.ShaderMaterial({
      uniforms: { ...fogU(), time, jb: { value: new THREE.Vector4(JB.x0, JB.z0, JB.x1, JB.z1) } }, fog: true, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      vertexShader: WORLD_V,
      fragmentShader: `${FOG_F} uniform float time; uniform vec4 jb; varying vec3 vW;
        float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vW.xz * 0.006 + vec2(time * 0.01, 0.0);
          float n = vn(p) * 0.55 + vn(p * 2.3) * 0.28 + vn(p * 5.1) * 0.17;
          vec2 q = max(jb.xy - vW.xz, vW.xz - jb.zw); float out_ = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float a = (0.75 + n * 0.25) * smoothstep(-60.0, 220.0, out_ + n * 120.0);   // breaks up over the jungle
          vec3 c = gl_FrontFacing ? mix(vec3(0.95,0.62,0.45), vec3(1.0,0.95,0.85), smoothstep(0.35, 0.8, n)) : vec3(0.55,0.56,0.6) * (0.6 + n * 0.5);
          gl_FragColor = vec4(c, a);
          #include <fog_fragment>
        }`,
    }));
    sea.rotation.x = -Math.PI / 2; sea.position.set((B.x0 + B.x1) / 2, CLOUD_Y, (B.z0 + B.z1) / 2); sea.renderOrder = 1; g.add(sea);
    // cumulus towers, darker underneath
    const puffGeo = new THREE.IcosahedronGeometry(1, 1); { const p = puffGeo.attributes.position, c = new Float32Array(p.count * 3); for (let k = 0; k < p.count; k++) { const f = 0.62 + 0.38 * THREE.MathUtils.smoothstep(p.getY(k), -1, 0.6); c.set([f, f * 0.97, f * 0.95], k * 3); } puffGeo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    const puffs = [];
    for (let t = 0; t < 5000 && puffs.length < 640 * Q + 60; t++) {
      const x = B.x0 + r() * (B.x1 - B.x0), z = B.z0 + r() * (B.z1 - B.z0);
      if (!far(x, z, 120) || (x > JB.x0 - 100 && x < JB.x1 + 100 && z > JB.z0 - 100 && z < JB.z1 + 100)) continue;
      const S = 25 + r() * 45, n = 3 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) puffs.push([x + (r() - 0.5) * S * 1.6, CLOUD_Y + S * (0.2 + k * 0.42) + r() * 10, z + (r() - 0.5) * S * 1.6, S * (1 - k * 0.13) * (0.6 + r() * 0.5)]);
    }
    g.add(chunked(puffGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a3020, flatShading: false }), puffs, (m, [x, y, z, s]) => { m.makeScale(s, s * 0.7, s); m.setPosition(x, y, z); }, 500));
    // floating islands: lumpy rock with strata, a grass cap, trees; the two big ones carry the decks either side of the gap
    const isl = [];
    for (const [a, b] of track.cfg.gaps) if (a > c0 && b < c1) for (const s of [a - 14, b + 16]) { const i = idx(s); isl.push([track.px[i], track.py[i] - 1.6, track.pz[i], 26, true]); }
    for (let t = 0; t < 3000 && isl.length < 60 * Q + 8; t++) {
      const x = B.x0 + 600 + r() * (B.x1 - B.x0 - 1200), z = B.z0 + 600 + r() * (B.z1 - B.z0 - 1200);
      if (!far(x, z, 60)) continue;
      isl.push([x, CLOUD_Y + 20 + r() * 120, z, 8 + r() * 28, r() < 0.35]);
    }
    const rockG = (() => { const geo = new THREE.ConeGeometry(1, 1.6, 12, 6); geo.rotateX(Math.PI); geo.translate(0, -0.8, 0); const g2 = lumpy(geo, 0.5, 2.2, 3);
      const p = g2.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
      for (let k = 0; k < p.count; k++) { const y = p.getY(k), band = 0.5 + 0.5 * Math.sin(y * 9 + p.getX(k) * 2); col.set(0x9a7a64).lerp(new THREE.Color(0x6a5446), band * 0.7).lerp(new THREE.Color(0x4a3a34), THREE.MathUtils.smoothstep(-y, 0.6, 1.6)); c.set([col.r, col.g, col.b], k * 3); }
      g2.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g2; })();
    const grassG = lumpy(new THREE.CylinderGeometry(1.04, 0.98, 0.12, 14, 1), 0.12, 3, 5);
    const islTrees = [];
    isl.forEach(([x, y, z, R], k) => { if (k >= 2) for (let n = 0; n < 3 + R / 5; n++) { const a = r() * 6.28, d = r() * R * 0.75; islTrees.push([x + Math.cos(a) * d, y, z + Math.sin(a) * d, 4 + r() * 6]); } });
    g.add(instanced(rockG, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), isl, (m, [x, y, z, R]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x * 0.1, 0)), new THREE.Vector3(R, R * 1.1, R))));
    g.add(instanced(grassG, new THREE.MeshLambertMaterial({ color: 0x7fb24a, flatShading: true }), isl, (m, [x, y, z, R]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(R, R * 0.6, R))));
    const tree2 = (() => { const P = [part(new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6).translate(0, 0.25, 0), 0x5a4632, null, 0.2, r)];
      for (let k = 0; k < 3; k++) P.push(part(new THREE.IcosahedronGeometry(1, 1), [0x3f7a3a, 0x4c8a40, 0x2f6a30][k], TRS((r() - 0.5) * 0.2, 0.55 + k * 0.14, (r() - 0.5) * 0.2, 0, 0, 0, 0.32 - k * 0.06, 0.24, 0.32 - k * 0.06), 0.25, r));
      return mergeGeometries(P); })();
    g.add(instanced(tree2, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), islTrees, (m, [x, y, z, h]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x, 0)), new THREE.Vector3(h, h, h))));
    // waterfalls pouring off the big islands into the clouds
    const fallMat = new THREE.ShaderMaterial({ uniforms: { ...fogU(), time }, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `${FOG_V} varying vec2 vU; void main(){ vU = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `${FOG_F} uniform float time; varying vec2 vU; void main(){ float s = 0.55 + 0.45 * sin(vU.x * 50.0 + sin(vU.x * 9.0) * 3.0); float fall = fract(vU.y * 4.0 + time * 1.2);
        gl_FragColor = vec4(mix(vec3(0.75, 0.85, 0.95), vec3(1.0), s * fall), (0.55 + 0.35 * s) * smoothstep(0.0, 0.35, vU.y));
        #include <fog_fragment>
      }` });
    for (const [x, y, z, R, big] of isl) if (big && y > CLOUD_Y + 5) { const a = r() * 6.28, f = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.25, y - CLOUD_Y + 4), fallMat); f.position.set(x + Math.cos(a) * R * 0.95, (y + CLOUD_Y) / 2, z + Math.sin(a) * R * 0.95); f.rotation.y = -a + Math.PI / 2; g.add(f); }
    // ruins: rings of white columns on some islands
    const cols = [], lintels = [];
    isl.slice(2).forEach(([x, y, z, R], k) => { if (k % 4 || R < 14) return; const n = 8, rr = R * 0.5; for (let q = 0; q < n; q++) { const a = q / n * Math.PI * 2; if (r() < 0.25) continue; cols.push([x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, 6 + (r() < 0.3 ? -r() * 4 : 0)]); if (q % 2 === 0) lintels.push([x + Math.cos(a + Math.PI / n) * rr, y + 6.3, z + Math.sin(a + Math.PI / n) * rr, a + Math.PI / n, rr]); } });
    const marble = new THREE.MeshLambertMaterial({ color: 0xf0e8dc });
    g.add(instanced(new THREE.CylinderGeometry(0.55, 0.65, 1, 10).translate(0, 0.5, 0), marble, cols, (m, [x, y, z, h]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1))));
    g.add(instanced(new THREE.BoxGeometry(1, 0.6, 1.4), marble, lintels, (m, [x, y, z, a, rr]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(1.3, 1, rr * 0.8))));
    // birds: flocks circling, wings flapping in the vertex shader
    const birdGeo = new THREE.BufferGeometry(); birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.4, -1.2, 0, -0.2, 0, 0, -0.3, 0, 0, 0.4, 0, 0, -0.3, 1.2, 0, -0.2], 3)); birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x3a2a30, side: THREE.DoubleSide });
    birdMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += abs(position.x) * sin(time * 9.0 + instanceMatrix[3].x * 0.7) * 0.6;'); };
    const flocks = []; for (let k = 0; k < 7; k++) { const i = idx(c0 + 150 + r() * (c1 - c0 - 300)), sd = r() < 0.5 ? -1 : 1; flocks.push([track.px[i] + track.nx[i] * sd * (60 + r() * 120), CLOUD_Y + 30 + r() * 50, track.pz[i] + track.nz[i] * sd * (60 + r() * 120), 30 + r() * 40, r() * 6]); }
    const birdData = []; for (let k = 0; k < flocks.length * 9; k++) birdData.push([k % flocks.length, (r() - 0.5) * 0.5, (r() - 0.5) * 8, (r() - 0.5) * 10]);
    const bird = new THREE.InstancedMesh(birdGeo, birdMat, birdData.length); g.add(bird);
    birds = { bird, birdData, flocks, g };
  }

  // =====================================================================================================
  // 4. 倒悬之城: towers hanging from a city in the sky (with setbacks, spires, neon signs, sky bridges),
  //    more rising from the haze below, and streams of flying traffic
  // =====================================================================================================
  const winMat = new THREE.ShaderMaterial({
    uniforms: { ...fogU(), time, key: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() } }, fog: true,
    vertexShader: `${FOG_V} varying vec3 vW; varying vec3 vN; varying float vId;
      void main(){
        #ifdef USE_INSTANCING
          mat4 im = instanceMatrix;
        #else
          mat4 im = mat4(1.0);
        #endif
        vec4 w = modelMatrix * im * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        vId = im[3].x * 0.37 + im[3].z * 0.11;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `${FOG_F} uniform float time; uniform vec3 key; varying vec3 vW; varying vec3 vN; varying float vId;
      float hs(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        float style = hs(vec3(floor(vId), 1.0, 2.0));
        vec3 wall = style < 0.33 ? vec3(0.07, 0.07, 0.11) : style < 0.66 ? vec3(0.1, 0.08, 0.07) : vec3(0.05, 0.08, 0.1);
        vec3 c = wall * (0.45 + 0.55 * max(dot(n, key), 0.0));
        if (abs(n.y) < 0.5) {
          float u = vW.x * n.z - vW.z * n.x;
          float cw = style < 0.5 ? 3.2 : 2.2, ch = style < 0.5 ? 3.6 : 3.0;
          vec2 cell = vec2(u / cw, vW.y / ch), f = fract(cell);
          float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.82);
          float on = step(0.45, hs(vec3(floor(cell), floor(vId))));
          float tint = hs(vec3(floor(cell) * 1.7, 3.0));
          vec3 lc = tint < 0.6 ? vec3(0.95, 0.62, 0.32) : tint < 0.85 ? vec3(0.7, 0.75, 0.85) : vec3(0.25, 0.8, 1.0);
          c += win * on * lc * (0.85 + 0.15 * sin(time * 0.7 + vId));
          c *= 1.0 - 0.35 * step(0.9, fract(vW.y / (ch * 4.0)));   // a darker band every few floors
        } else c += vec3(0.02, 0.02, 0.03);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  let traffic = null;
  {
    const [[c0, c1]] = zoneRange('city'), g = layer([[c0, c1]], 700), B = bbox(c0, c1, 500);
    const roadY = 70, CEIL = 420, boxes = [], spires = [], blink = [], signs = [];
    const seaI = []; for (const [a, b] of [...zoneRange('seaTop'), ...zoneRange('sea')]) for (const i of samples(a + 150, b, 6)) seaI.push(i);
    for (const [a, b] of zoneRange('cloud')) for (const i of samples(a, b - 250, 6)) seaI.push(i);   // (and of the cloud stretch)
    const nearSea = (x, z) => seaI.some(i => (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2 < 330 * 330);
    const hanging = [];
    for (let x = B.x0; x < B.x1; x += 34) for (let z = B.z0; z < B.z1; z += 34) {
      const jx = x + (r() - 0.5) * 14, jz = z + (r() - 0.5) * 14, w = 12 + r() * 14, d = 12 + r() * 14;
      if (nearSea(jx, jz)) continue;
      const clear = far(jx, jz, Math.max(w, d) * 0.75 + E + 4);
      if (r() < 0.8) {   // hanging from the sky city: main block, a narrower setback below it, sometimes an inverted spire
        const bottom = roadY + (clear ? 24 + r() * 90 : 45 + r() * 90), sb = 10 + r() * 30;
        boxes.push([jx, jz, w, d, bottom + sb, CEIL]); boxes.push([jx, jz, w * 0.7, d * 0.7, bottom, bottom + sb]);
        hanging.push([jx, jz, w, d, bottom + sb]);
        if (r() < 0.35) { spires.push([jx, bottom, jz, -14]); blink.push([jx, bottom - 14, jz]); }
        for (let q = 0; q < 2; q++) if (r() < 0.45) signs.push([jx, jz, w, d, bottom + sb + 4 + r() * 60, Math.floor(r() * 4)]);
      }
      if (clear && r() < 0.65) {   // rising from the haze
        const top = roadY - 12 - r() * 60, sb = 8 + r() * 20;
        boxes.push([jx, jz, w, d, -260, top - sb]); boxes.push([jx, jz, w * 0.72, d * 0.72, top - sb, top]);
        if (r() < 0.4) { const h = 10 + r() * 10; spires.push([jx, top, jz, h]); blink.push([jx, top + h, jz]); }
        if (r() < 0.4) signs.push([jx, jz, w, d, top - sb - 6 - r() * 40, Math.floor(r() * 4)]);
      }
    }
    // sky bridges between neighbouring hanging towers
    for (let k = 0; k < hanging.length; k++) for (let q = k + 1; q < Math.min(hanging.length, k + 6); q++) {
      const [x1, z1, , , b1] = hanging[k], [x2, z2, , , b2] = hanging[q], d = Math.hypot(x2 - x1, z2 - z1);
      if (d > 30 && d < 60 && r() < 0.35) { const y = Math.max(b1, b2) + 10 + r() * 50; boxes.push([(x1 + x2) / 2, (z1 + z2) / 2, d, 4, y, y + 4, Math.atan2(z2 - z1, x2 - x1)]); }
    }
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), winMat, boxes, (m, [x, z, w, d, y0, y1, rot = 0]) => m.compose(new THREE.Vector3(x, (y0 + y1) / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -rot, 0)), new THREE.Vector3(w, y1 - y0, d))));
    g.add(instanced(new THREE.ConeGeometry(0.8, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x22222a }), spires, (m, [x, y, z, h]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1))));
    const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2), toneMapped: false });
    blinkMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.fragmentShader = 'uniform float time;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= step(0.0, sin(time * 3.0));'); };
    g.add(instanced(new THREE.SphereGeometry(0.6, 8, 6), blinkMat, blink, (m, [x, y, z]) => m.makeTranslation(x, y, z)));
    // neon signs on tower faces
    const SIGN = [new THREE.Color(2.6, 0.3, 1.4), new THREE.Color(0.3, 2.2, 2.6), new THREE.Color(2.6, 1.8, 0.3), new THREE.Color(0.6, 2.6, 0.8)];
    g.add(instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), signs, (m, [x, z, w, d, y, c], k, im) => {
      const face = k % 4, ang = face * Math.PI / 2, vertical = k % 3 === 0, out = (face % 2 ? w : d) / 2 + 0.25;
      m.compose(new THREE.Vector3(x + Math.sin(ang) * out, y, z + Math.cos(ang) * out), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)), new THREE.Vector3(vertical ? 2.2 : 6 + (k % 5), vertical ? 9 + (k % 4) * 2 : 2.2, 1));
      im.setColorAt(k, SIGN[c]); }));
    // the underside of the sky city, with its street lights
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 + 800, B.z1 - B.z0 + 800), new THREE.ShaderMaterial({ uniforms: { ...fogU() }, fog: true, side: THREE.DoubleSide, vertexShader: WORLD_V,
      fragmentShader: `${FOG_F} varying vec3 vW; void main(){ vec2 g = abs(fract(vW.xz / 34.0) - 0.5); float street = smoothstep(0.47, 0.5, max(g.x, g.y)); vec2 l = fract(vW.xz / 8.5) - 0.5; float lamp = street * smoothstep(0.12, 0.0, length(l));
        gl_FragColor = vec4(vec3(0.045, 0.035, 0.07) + vec3(1.2, 0.8, 0.4) * lamp, 1.0);
        #include <fog_fragment>
      }` }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((B.x0 + B.x1) / 2, CEIL, (B.z0 + B.z1) / 2); g.add(ceil);
    // flying traffic: lanes of lights circling the city at a few heights
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, lanes = [];
    for (let k = 0; k < 6; k++) lanes.push([cx + (r() - 0.5) * 200, cz + (r() - 0.5) * 200, 180 + r() * 260, 120 + r() * 160, roadY + 25 + k * 22, (k % 2 ? 1 : -1) * (0.03 + r() * 0.02), r() * 6]);
    const carsT = []; for (let k = 0; k < 220 * Q + 40; k++) carsT.push([k % lanes.length, r() * 6.28]);
    const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 2.6), new THREE.MeshBasicMaterial({ toneMapped: false }), carsT.length);
    carsT.forEach((c, k) => tm.setColorAt(k, k % 2 ? new THREE.Color(2.6, 2.4, 2.0) : new THREE.Color(2.6, 0.3, 0.3)));
    g.add(tm); traffic = { tm, carsT, lanes, g };
    // the tunnel: the road runs through the lowest floors of one hanging tower
    const [t0, t1] = track.cfg.tunnel, a = idx(t0), b = idx(t1);
    const yaw = Math.atan2(track.tx[a], track.tz[a]), len = Math.hypot(track.px[b] - track.px[a], track.pz[b] - track.pz[a]);
    const tcx = (track.px[a] + track.px[b]) / 2, tcz = (track.pz[a] + track.pz[b]) / 2, ry = (track.py[a] + track.py[b]) / 2;
    const T = new THREE.Group(); T.position.set(tcx, ry, tcz); T.rotation.y = yaw; g.add(T);
    const Wt = 46, side = (Wt - 2 * (E + 0.6)) / 2;
    { const o = new THREE.Mesh(new THREE.BoxGeometry(Wt, CEIL - ry - 9, len), winMat); o.position.set(0, (CEIL - ry - 9) / 2 + 9, 0); T.add(o); }
    for (const sd of [-1, 1]) { const o = new THREE.Mesh(new THREE.BoxGeometry(side, 18, len), winMat); o.position.set(sd * (E + 0.6 + side / 2), 0, 0); T.add(o); }
    { const o = new THREE.Mesh(new THREE.BoxGeometry(Wt, 8, len), winMat); o.position.set(0, -5.3, 0); T.add(o); }
    const lamps = []; for (let k = 0; k < Math.floor(len / 10); k++) lamps.push(k);
    T.add(instanced(new THREE.BoxGeometry(5, 0.15, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.5, 1.0), toneMapped: false }), lamps, (m, k) => m.makeTranslation(0, 8.85, -len / 2 + 5 + k * 10)));
    // glowing frames at both tunnel mouths
    for (const zEnd of [-len / 2, len / 2]) { const f = new THREE.Mesh(new THREE.TorusGeometry(E + 1.2, 0.3, 6, 24, Math.PI), neon(2.6, 1.2, 0.3)); f.position.set(0, 0, zEnd); f.scale.set(1, 1.1, 1); T.add(f); }
  }

  // =====================================================================================================
  // 5. 深海: the sea seen from above, then a glass tunnel along a rolling sea floor with coral, rocks,
  //    sunken ruins, kelp, jellyfish, fish, a whale and rising bubbles
  // =====================================================================================================
  const SEA_Y = 40, BED_Y = -12;
  let seaFx = null, wallX = 0, seaBox = null;
  {
    const zr = [...zoneRange('seaTop'), ...zoneRange('sea')], s0 = Math.min(...zr.map(z => z[0])), s1 = Math.max(...zr.map(z => z[1]));
    const g = layer([[s0, s1]], 420), B = bbox(s0, s1, 900);
    wallX = track.px[idx(s1)];
    B.x0 = Math.max(B.x0, wallX); seaBox = B;
    const W = B.x1 - B.x0, D = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.ShaderMaterial({
      uniforms: { ...fogU(), time }, fog: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, vertexShader: WORLD_V,
      fragmentShader: `${FOG_F} uniform float time; varying vec3 vW;
        void main(){
          float w = sin(vW.x * 0.08 + time * 1.1) * sin(vW.z * 0.07 - time * 0.9) + 0.5 * sin((vW.x + vW.z) * 0.21 + time * 1.7);
          vec3 c; float a;
          if (gl_FrontFacing) { c = mix(vec3(0.03,0.2,0.28), vec3(0.2,0.5,0.55), 0.5 + 0.25 * w); a = 0.92; }
          else { c = mix(vec3(0.15,0.55,0.62), vec3(0.75,1.0,1.0), smoothstep(0.6, 1.3, w)); a = 0.85; }
          gl_FragColor = vec4(c, a);
          #include <fog_fragment>
        }`,
    }));
    surf.rotation.x = -Math.PI / 2; surf.position.set(cx, SEA_Y, cz); surf.renderOrder = 3; g.add(surf);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, SEA_Y - BED_Y + 24), new THREE.ShaderMaterial({
      uniforms: { time }, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time; varying vec2 vU;
        void main(){ float r = sin(vU.x * 60.0 + time * 2.0) * sin(vU.y * 40.0 - time * 1.5); gl_FragColor = vec4(vec3(0.1, 0.5, 0.9) * (0.35 + 0.25 * r) + vec3(0.6,0.3,1.0) * smoothstep(0.85, 1.0, vU.y), 1.0); }`,
    }));
    wall.rotation.y = Math.PI / 2; wall.position.set(wallX, (SEA_Y + BED_Y - 20) / 2, cz); g.add(wall);
    // rolling sea floor (dunes and ridges) with moving caustics
    const res = 12 / Math.min(1, Q + 0.3);
    const bedH = (x, z) => { let h = (fbm(x * 0.01, z * 0.01, 4) - 0.5) * 16 + Math.sin(x * 0.05 + fbm(x * 0.02, z * 0.02) * 6) * 1.2; const q = nearRoad(x, z, 80); if (q.i >= 0) h *= THREE.MathUtils.smoothstep(q.d, E + 2, E + 30); return BED_Y + h; };
    const bedG = new THREE.PlaneGeometry(W, D, Math.round(W / res), Math.round(D / res)); bedG.rotateX(-Math.PI / 2); bedG.translate(cx, 0, cz);
    { const p = bedG.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, bedH(p.getX(k), p.getZ(k))); bedG.computeVertexNormals(); }
    g.add(new THREE.Mesh(bedG, new THREE.ShaderMaterial({
      uniforms: { ...fogU(), time }, fog: true,
      vertexShader: WORLD_V.replace('varying vec3 vW;', 'varying vec3 vW; varying vec3 vNn;').replace('vW = w.xyz;', 'vW = w.xyz; vNn = normal;'),
      fragmentShader: `${FOG_F} uniform float time; varying vec3 vW; varying vec3 vNn;
        void main(){
          vec2 p = vW.xz * 0.12;
          float c1 = abs(sin(p.x + sin(p.y * 1.3 + time) + time * 0.6)) * abs(sin(p.y * 0.9 + sin(p.x * 1.1 - time * 0.8)));
          float caus = pow(1.0 - c1, 6.0);
          float lit = 0.55 + 0.45 * max(normalize(vNn).y, 0.0);
          vec3 sand = mix(vec3(0.34, 0.36, 0.3), vec3(0.22, 0.26, 0.24), smoothstep(-16.0, -4.0, -vW.y));
          vec3 c = sand * lit * (0.85 + 0.15 * sin(vW.x * 0.6 + sin(vW.z * 0.4) * 2.0)) + vec3(0.4, 0.9, 1.0) * caus * 0.45;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    })));
    // the glass tube: an arch over the road with glowing ribs
    const [u0, u1] = track.cfg.tube, a = idx(u0), b = idx(u1), R = E + 1.4, segs = 14;
    const pos = [], ind = [];
    for (let i = a; i <= b; i++) for (let k = 0; k <= segs; k++) {
      const th = Math.PI * k / segs, off = -Math.cos(th) * R, hy = Math.sin(th) * (R * 0.85) + 0.9;
      pos.push(track.px[i] + track.nx[i] * off, track.py[i] + hy, track.pz[i] + track.nz[i] * off);
      if (i < b && k < segs) { const p = (i - a) * (segs + 1) + k, q = p + segs + 1; ind.push(p, q, p + 1, q, q + 1, p + 1); }
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(ind); tg.computeVertexNormals();
    const tube = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      uniforms: { beat }, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float beat; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(vec3(0.45, 0.85, 1.0), 0.04 + min(f, 0.6) * 0.2); }`,
    }));
    tube.renderOrder = 4; g.add(tube);
    const ribs = []; for (let i = a; i <= b; i += Math.round(12 / step)) ribs.push(i);
    g.add(instanced(new THREE.TorusGeometry(R, 0.18, 6, 24, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.0, 2.6), toneMapped: false }), ribs,
      (m, i) => m.compose(new THREE.Vector3(track.px[i], track.py[i] + 0.9, track.pz[i]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(track.tx[i], track.tz[i]), 0)), new THREE.Vector3(1, 0.85, 1))));
    const pick = minD => { for (let t = 0; t < 50; t++) { const x = B.x0 + r() * W, z = B.z0 + r() * D; if (far(x, z, minD)) return [x, z]; } return null; };
    const pickNear = (minD, maxD) => { for (let t = 0; t < 50; t++) { const i = idx(u0 + r() * (u1 - u0)), sd = r() < 0.5 ? -1 : 1, off = sd * (minD + r() * (maxD - minD)), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off; if (x > B.x0 && far(x, z, minD)) return [x, z]; } return null; };
    // kelp forests swaying
    const kelpL = []; for (let t = 0; t < 1100 * Q + 100; t++) { const p = r() < 0.6 ? pickNear(E + 4, 90) : pick(E + 4); if (p) kelpL.push([p[0], bedH(p[0], p[1]), p[1], 6 + r() * 24, r() * 6]); }
    const kelpMat = new THREE.MeshLambertMaterial({ color: 0x2f7a4a, side: THREE.DoubleSide, emissive: 0x0a2a18 });
    kelpMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07; transformed.x += sin(time * 0.9 + ph + position.y * 2.0) * position.y * 0.35;'); };
    g.add(instanced(new THREE.PlaneGeometry(1.2, 1, 1, 8).translate(0, 0.5, 0), kelpMat, kelpL, (m, [x, y, z, h, a2]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a2, 0)), new THREE.Vector3(1, h, 1))));
    // coral: branching, brain and fan corals in bright colours, gathered near the tube
    const CORAL = [0xff5a7a, 0xff9a3a, 0xc85aff, 0xffd84a, 0x4ad8ff, 0xff6ad0].map(c => new THREE.Color(c));
    const branchG = (() => { const P = [part(new THREE.CylinderGeometry(0.08, 0.14, 1, 5).translate(0, 0.5, 0), 0xffffff, null, 0, r)];
      for (let k = 0; k < 6; k++) P.push(part(new THREE.CylinderGeometry(0.04, 0.09, 0.7, 5).translate(0, 0.35, 0), 0xffffff, TRS(0, 0.3 + r() * 0.5, 0, (r() - 0.5) * 1.6, r() * 6, (r() - 0.5) * 1.6), 0, r));
      return mergeGeometries(P); })();
    const brainG = lumpy(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.25, 4, 9);
    const corals = []; for (let t = 0; t < 900 * Q + 80; t++) { const p = r() < 0.75 ? pickNear(E + 2.5, 45) : pick(E + 3); if (p) corals.push([p[0], bedH(p[0], p[1]), p[1], 0.8 + r() * 2.2, r() * 6, Math.floor(r() * 6)]); }
    const coralSet = (dy, sx = 1, sy = 1, sz = 1) => (m, it, k, im) => { m.compose(new THREE.Vector3(it[0], it[1] + dy * it[3], it[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it[4], 0)), new THREE.Vector3(it[3] * sx, it[3] * sy, it[3] * sz)); im.setColorAt(k, CORAL[it[5]]); };
    const coralMat = new THREE.MeshLambertMaterial({ emissive: 0x220a18, flatShading: true });
    g.add(instanced(branchG, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x220a18 }), corals.filter((_, k) => k % 3 === 0), coralSet(-0.1)));
    g.add(instanced(brainG, coralMat, corals.filter((_, k) => k % 3 === 1), coralSet(-0.15)));
    g.add(instanced(new THREE.CircleGeometry(1, 12, 0, Math.PI), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0x220a18 }), corals.filter((_, k) => k % 3 === 2), coralSet(0, 1.4, 1.6, 1)));
    // rocks
    const rockL = []; for (let t = 0; t < 300 * Q + 40; t++) { const p = pick(E + 6); if (p) rockL.push([p[0], bedH(p[0], p[1]), p[1], 2 + Math.pow(r(), 2) * 10, r() * 6]); }
    g.add(chunked(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.6, 1.4, 7), new THREE.MeshLambertMaterial({ color: 0x4a5a5a, flatShading: true }), rockL, (m, [x, y, z, s, a2]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(a2 * 0.3, a2, 0)), new THREE.Vector3(s, s * 0.6, s))));
    // a sunken temple beside the tube: columns (some broken), a toppled one, an arch and a slipped roof slab
    {
      const i = idx(u0 + (u1 - u0) * 0.55), off = E + 26, x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off, yaw = Math.atan2(track.tx[i], track.tz[i]);
      const stone = new THREE.MeshLambertMaterial({ color: 0x8a9a8a }), Tm = new THREE.Group(); Tm.position.set(x, bedH(x, z), z); Tm.rotation.y = yaw; g.add(Tm);
      for (let k = 0; k < 10; k++) { const h = k % 3 === 1 ? 4 + r() * 4 : 12 + r() * 3, c = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, h, 12), stone); c.position.set((k % 2 ? 7 : -7), h / 2, (Math.floor(k / 2) - 2) * 9); Tm.add(c); }
      const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 13, 12), stone); fallen.rotation.set(Math.PI / 2, 0, 0.4); fallen.position.set(2, 1, 6); Tm.add(fallen);
      const archS = new THREE.Mesh(new THREE.TorusGeometry(7, 1, 8, 16, Math.PI), stone); archS.position.set(0, 13, -22); Tm.add(archS);
      const roofB = new THREE.Mesh(new THREE.BoxGeometry(17, 1.4, 12), stone); roofB.position.set(0, 15.5, -14); roofB.rotation.z = 0.08; Tm.add(roofB);
    }
    // jellyfish with trailing tentacles
    const jel = []; for (let t = 0; t < 2000 && jel.length < 80 * Q + 20; t++) { const x = B.x0 + r() * W, z = B.z0 + r() * D; if (!far(x, z, E + 6)) continue; jel.push([x, BED_Y + 6 + r() * 40, z, 1 + r() * 2.5, r() * 6]); }
    const jelly = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 2.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), jel.length); g.add(jelly);
    const tent = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 1, 8, 1, true).rotateX(Math.PI).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.5, 1.6), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), jel.length); g.add(tent);
    // fish schools circling
    const fishGeo = mergeGeometries([part(new THREE.SphereGeometry(0.35, 8, 6), 0xffffff, TRS(0, 0, 0, 0, 0, 0, 0.6, 0.8, 1.6)), part(new THREE.ConeGeometry(0.3, 0.5, 4), 0xffffff, TRS(0, 0, -0.65, -Math.PI / 2, 0, 0, 0.3, 1, 1))]);
    const fishN = Math.round(320 * Q + 40), fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x204050 }), fishN);
    const FISH = [0xbfe8ff, 0xffc04a, 0xff7a5a, 0x9affc8].map(c => new THREE.Color(c));
    const schools = []; for (let k = 0; k < 10; k++) { const p = pickNear(18, 50); if (p) schools.push([p[0], BED_Y + 10 + r() * 18, p[1], 8 + r() * 10]); }
    const fishData = []; for (let k = 0; k < fishN; k++) { fishData.push([k % Math.max(1, schools.length), r() * 6.28, (r() - 0.5) * 6, 0.8 + r() * 0.4, (r() - 0.5) * 4]); fish.setColorAt(k, FISH[(k % Math.max(1, schools.length)) % 4]); }
    g.add(fish);
    // a whale gliding overhead
    const whale = new THREE.Group();
    { const skin = new THREE.MeshLambertMaterial({ color: 0x3a4e60 }), belly = new THREE.MeshLambertMaterial({ color: 0x9aaab0 });
      const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - t * 0.55) * 3.2 + 0.05, t * 22 - 11)); }
      const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), skin); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.8); whale.add(body);
      const bel = new THREE.Mesh(new THREE.LatheGeometry(pts, 18, Math.PI * 0.75, Math.PI * 0.5), belly); bel.rotation.x = Math.PI / 2; bel.scale.set(1.01, 1.01, 0.81); whale.add(bel);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 3), skin); tail.position.set(0, 0, -11.5); whale.add(tail); whale.userData.tail = tail;
      for (const sd of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 1.6), skin); fin.position.set(sd * 4, -1.2, 3); fin.rotation.set(0, sd * 0.5, sd * -0.4); whale.add(fin); }
      whale.scale.setScalar(1.6); g.add(whale); }
    const wi = idx(u0 + (u1 - u0) * 0.3), wC = new THREE.Vector3(track.px[wi] + track.nx[wi] * 60, SEA_Y - 14, track.pz[wi] + track.nz[wi] * 60);
    // bubbles rising from vents
    const vents = []; for (let k = 0; k < 24; k++) { const p = pickNear(E + 3, 40); if (p) vents.push([p[0], bedH(p[0], p[1]), p[1]]); }
    const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.5 }), Math.max(1, vents.length * 10)); g.add(bub);
    const shafts = []; for (let k = 0; k < 30 * Q + 8; k++) { const i = idx(u0 + r() * (u1 - u0)), off = (r() - 0.5) * 120; shafts.push([track.px[i] + track.nx[i] * off, track.pz[i] + track.nz[i] * off]); }
    g.add(instanced(new THREE.CylinderGeometry(2, 9, 1, 8, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.5, 0.55), transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), shafts,
      (m, [x, z]) => m.compose(new THREE.Vector3(x, SEA_Y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.3)), new THREE.Vector3(1, SEA_Y - BED_Y, 1))));
    seaFx = { g, jelly, tent, jel, fish, fishData, schools, whale, wC, bub, vents };
  }

  // =====================================================================================================
  // 6. 星空尽头: lumpy asteroids, a ringed gas giant, the Earth, a turning space station, and the moon gate
  // =====================================================================================================
  let portal = null, station = null;
  {
    const [[c0, c1]] = zoneRange('space'), g = layer([[c0, c1]], 250), B = bbox(c0, c1, 700);
    const rocks = [];
    for (let t = 0; t < 5000 && rocks.length < 320 * Q + 40; t++) {
      const x = B.x0 + r() * (B.x1 - B.x0), z = B.z0 + r() * (B.z1 - B.z0), y = -120 + r() * 300;
      if (!far(x, z, 30 + Math.abs(y - 30) * 0.2)) continue;
      rocks.push([x, y, z, 2 + Math.pow(r(), 3) * 30, r() * 6, r() * 6]);
    }
    const ag = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.7, 1.6, 11);
    { const p = ag.attributes.position, c = new Float32Array(p.count * 3); for (let k = 0; k < p.count; k++) { const f = 0.45 + fbm(p.getX(k) * 3 + 5, p.getZ(k) * 3 + p.getY(k) * 2, 3) * 0.6; c.set([f * 0.95, f * 0.9, f], k * 3); } ag.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    g.add(chunked(ag, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), rocks, (m, [x, y, z, s, a1, a2]) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(a1, a2, a1 * 0.5)), new THREE.Vector3(s, s * 0.75, s))));
    // gas giant with rings (and a gap in them), far to the west
    const P = new THREE.Vector3((B.x0 + B.x1) / 2 - 1500, 250, (B.z0 + B.z1) / 2 + 300);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(420, 64, 40), new THREE.ShaderMaterial({
      fog: false, uniforms: { time, L: { value: new THREE.Vector3(0.6, 0.35, 0.2).normalize() } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; uniform vec3 L; varying vec3 vN; varying vec3 vP; varying vec3 vV;
        void main(){ float b = vP.y / 420.0; float sw = sin(b * 40.0 + vP.x * 0.01 + time * 0.05) * 0.6;
          float band = sin(b * 18.0 + sw);
          vec3 c = mix(vec3(0.85,0.55,0.35), vec3(0.95,0.85,0.7), 0.5 + 0.5 * band); c = mix(c, vec3(0.6,0.3,0.25), smoothstep(0.7, 1.0, sin(b * 7.0 + 1.0)));
          float storm = smoothstep(0.12, 0.0, length(vec2(atan(vP.z, vP.x) - 0.8, b + 0.25) * vec2(1.0, 3.0))); c = mix(c, vec3(0.75, 0.35, 0.25), storm);
          float lit = max(dot(normalize(vN), L), 0.0); float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
          gl_FragColor = vec4(c * (0.06 + lit * 1.1) + vec3(1.0, 0.7, 0.4) * rim * lit * 0.6, 1.0); }`,
    }));
    planet.position.copy(P); g.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(520, 820, 128, 1), new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float d = length(vP.xy); float t = (d - 520.0) / 300.0; float a = (0.4 + 0.4 * sin(t * 60.0) * sin(t * 13.0)) * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t) * (1.0 - 0.8 * smoothstep(0.55, 0.58, t) * smoothstep(0.63, 0.6, t)); gl_FragColor = vec4(vec3(0.9,0.78,0.6) * 0.9, a * 0.8); }`,
    }));
    ring.position.copy(P); ring.rotation.set(-Math.PI / 2 + 0.35, 0.2, 0); g.add(ring);
    // the Earth, small and blue, with a glowing atmosphere
    const EP = new THREE.Vector3((B.x0 + B.x1) / 2 + 900, 420, B.z1 + 600);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({ fog: false, uniforms: { time, L: { value: new THREE.Vector3(0.6, 0.35, 0.2).normalize() } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time; uniform vec3 L; varying vec3 vN; varying vec3 vP;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y), mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){ float land = n3(vP * 3.0) * 0.6 + n3(vP * 7.0) * 0.4; vec3 c = land > 0.55 ? mix(vec3(0.2, 0.45, 0.18), vec3(0.6, 0.5, 0.3), smoothstep(0.6, 0.8, land)) : vec3(0.05, 0.18, 0.5);
          float cl = smoothstep(0.55, 0.75, n3(vP * 5.0 + vec3(time * 0.02, 0.0, 0.0))); c = mix(c, vec3(1.0), cl * 0.8);
          float lit = max(dot(normalize(vN), L), 0.0); gl_FragColor = vec4(c * (0.04 + lit), 1.0); }` }));
    earth.position.copy(EP); g.add(earth);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(162, 48, 32), new THREE.ShaderMaterial({ fog: false, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * f * 1.2, 1.0); }` }));
    atmo.position.copy(EP); g.add(atmo);
    // a space station: hub, spokes, a turning habitat ring with lit windows, solar wings
    { const S = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.6, roughness: 0.4 });
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(60, 5, 12, 64), metal); S.add(ringM);
      const win = new THREE.Mesh(new THREE.TorusGeometry(60, 5.05, 12, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vU; void main(){ vec2 g = fract(vU * vec2(6.0, 160.0)); float w = step(0.3, g.y) * step(g.y, 0.7) * step(0.35, g.x) * step(g.x, 0.65); gl_FragColor = vec4(vec3(1.0, 0.85, 0.55) * w * 1.6, 1.0); }` }));
      S.add(win);
      for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 8), metal); sp.rotation.z = k * Math.PI / 4; ringM.add(sp); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 30, 16), metal); hub.rotation.x = Math.PI / 2; S.add(hub);
      const panelM = new THREE.MeshStandardMaterial({ color: 0x1a2a6a, metalness: 0.8, roughness: 0.3, emissive: 0x0a1030 });
      for (const sd of [-1, 1]) { const pn = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 18), panelM); pn.position.set(0, 0, sd * 50); S.add(pn); }
      const si = idx(c0 + (c1 - c0) * 0.45), S0 = new THREE.Vector3(track.px[si] - track.nx[si] * 320, 120, track.pz[si] - track.nz[si] * 320);
      S.position.copy(S0); S.rotation.set(0.5, 0.3, 0); g.add(S); station = { S, ringM, win, g };
    }
    // the gate and the moon, straddling the last jump
    const [ga, gb] = track.cfg.gaps.find(([a]) => a > c0) || track.cfg.gaps[track.cfg.gaps.length - 1];
    const i0 = idx((ga + gb) / 2), dir = new THREE.Vector3(track.tx[i0], 0, track.tz[i0]).normalize();
    const center = new THREE.Vector3(track.px[i0], track.up[idx(ga)] + 12, track.pz[i0]);
    const gate = new THREE.Group(); gate.position.copy(center); gate.lookAt(center.clone().add(dir)); g.add(gate);
    gate.add(new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 12, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 2.8), toneMapped: false })));
    const runeMat = neon(1.6, 0.8, 2.6);
    for (let k = 0; k < 12; k++) { const rune = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), runeMat); const a = k / 12 * Math.PI * 2; rune.position.set(Math.cos(a) * 27, Math.sin(a) * 27, 0); gate.add(rune); }
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(23.5, 64), new THREE.ShaderMaterial({
      uniforms: { time, beat }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vU; void main(){ vU = position.xy / 23.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time; uniform float beat; varying vec2 vU;
        void main(){ float r = length(vU), a = atan(vU.y, vU.x); float s = sin(a * 5.0 + r * 12.0 - time * 3.0) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.5,0.2,1.0), vec3(1.0,0.4,0.8), s) * (0.25 + 0.55 * smoothstep(0.3, 1.0, r)) + vec3(1.0) * pow(1.0 - r, 3.0) * 0.4;
          gl_FragColor = vec4(c * (0.8 + beat * 0.3), 1.0); }`,
    }));
    swirl.renderOrder = 5; gate.add(swirl);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(170, 64, 40), new THREE.ShaderMaterial({
      fog: false, vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){ vec3 p = vP / 170.0; float cr = 0.0; for (int k = 0; k < 3; k++) { vec3 q = p * (4.0 + float(k) * 5.0); vec3 c = floor(q); vec3 f = fract(q) - 0.5; cr += smoothstep(0.3, 0.2, length(f)) * step(0.6, h(c)) * 0.12; }
          float mare = smoothstep(0.55, 0.75, sin(p.x * 3.0 + 1.0) * sin(p.y * 2.5) * 0.5 + 0.5) * 0.25;
          vec3 c = vec3(0.92, 0.9, 0.86) * (1.0 - cr - mare) * (0.75 + 0.25 * max(dot(normalize(vN), normalize(vec3(0.5, 0.4, -0.6))), 0.0)); gl_FragColor = vec4(c * 0.85, 1.0); }`,
    }));
    moon.position.copy(center).addScaledVector(dir, 650).add(new THREE.Vector3(0, 60, 0)); g.add(moon);
    portal = { gate, swirl, center, moon, dir };
  }

  // ---------- bubbles around the camera (diving in, bursting out of the sea) ----------
  const BUBN = 90, bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe0faff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), BUBN);
  bubbles.frustumCulled = false; bubbles.count = 0; scene.add(bubbles);
  const bubState = []; let bubT = 0;
  function burst(cam, n, f) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, d = 2.5 + Math.random() * 5; bubState[k % BUBN] = [cam.x + Math.cos(a) * d + f.x * 6, cam.y - 1.5 + Math.random() * 3, cam.z + Math.sin(a) * d + f.z * 6, 1 + Math.random() * 3, 0.5 + Math.random() * 1.5]; } bubT = 2.5; }

  // ---------- per-frame ----------
  const look = {};
  const cur = { top: new THREE.Color(), hor: new THREE.Color(), below: new THREE.Color(), sunCol: new THREE.Color(), fog: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), key: new THREE.Color(), sun: new THREE.Vector3() };
  const COLS = ['top', 'hor', 'below', 'sunCol', 'fog', 'hemiS', 'hemiG', 'key'], NUMS = ['stars', 'neb', 'sunSize', 'stripe', 'dens', 'hemiI', 'keyI', 'exp'];
  const tmpA = new THREE.Color(), tmpB = new THREE.Color(), v4 = new THREE.Vector3(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), birdS = new THREE.Vector3(1.6, 1.6, 1.6), fw = new THREE.Vector3();
  const mixLook = (A, B, w, out) => { for (const k of COLS) out[k] = [0, 1, 2].map(n => A[k][n] + (B[k][n] - A[k][n]) * w); for (const k of NUMS) out[k] = A[k] + (B[k] - A[k]) * w; out.sun = [0, 1, 2].map(n => A.sun[n] + (B.sun[n] - A.sun[n]) * w); return out; };
  const scratch = [{}, {}];
  const zoneIndex = s => { let k = 0; for (let n = 0; n < Z.length; n++) if (s >= Z[n][1]) k = n; return k; };
  // the look for a distance along the lap and a camera position (under the sea, the camera's depth decides)
  function lookAt(s, camY = 100, camX = 0, camZ = 0) {
    const k = zoneIndex(s), name = Z[k][0], prevName = Z[(k - 1 + Z.length) % Z.length][0];
    const inSea = seaBox && camX >= wallX - 2 && camX <= seaBox.x1 && camZ >= seaBox.z0 && camZ <= seaBox.z1;
    const under = inSea ? THREE.MathUtils.clamp((SEA_Y + 0.5 - camY) / 3, 0, 1) : 0;
    const resolve = (nm, slot) => (nm === 'seaTop' || nm === 'sea') ? mixLook(LOOKS.seaTop, LOOKS.sea, under, scratch[slot]) : LOOKS[nm];
    const Bk = resolve(name, 0), Ak = resolve(prevName, 1);
    let w = Math.min(1, (s - Z[k][1]) / (FADE[name] || 160)); w = w * w * (3 - 2 * w);
    if (name === 'sea') w = 1;
    for (const key of COLS) cur[key].setRGB(...Ak[key]).lerp(tmpB.setRGB(...Bk[key]), w);
    cur.sun.set(...Ak.sun).normalize().lerp(v4.set(...Bk.sun).normalize(), w).normalize();
    for (const key of NUMS) look[key] = Ak[key] + (Bk[key] - Ak[key]) * w;
    // climbing up through the cloud layer: a band of thick golden mist
    if (name === 'cloud' || name === 'jungle') { const m = Math.exp(-(((camY - CLOUD_Y) / 7) ** 2)); if (m > 0.01) { cur.fog.lerp(tmpA.setRGB(1.0, 0.9, 0.78), m); look.dens += (0.016 - look.dens) * m; } }
    look.zone = under > 0.5 ? 'sea' : name === 'sea' ? 'seaTop' : name; look.under = under; look.w = w;
    return look;
  }

  let prevUnder = 0, prevK = -1, prevCamX = 0;
  function update(t, dt, camera, s) {
    time.value = t;
    sky.position.copy(camera.position);
    const cp = camera.position, L = lookAt(s, cp.y, cp.x, cp.z);
    U.top.value.copy(cur.top); U.hor.value.copy(cur.hor); U.below.value.copy(cur.below); U.sunCol.value.copy(cur.sunCol); U.sun.value.copy(cur.sun);
    U.stars.value = L.stars; U.neb.value = L.neb; U.sunSize.value = L.sunSize; U.stripe.value = L.stripe;
    // moments: diving in, bursting out into space, the moon gate
    L.event = null;
    camera.getWorldDirection(fw);
    if (prevUnder < 0.5 && L.under >= 0.5) { L.event = 'splash'; burst(cp, 60, fw); }
    const k = zoneIndex(s);
    if (prevK >= 0 && k === prevK + 1) {
      if (Z[k][0] === 'space' && prevCamX >= wallX - 5) { L.event = 'breach'; burst(cp, 90, fw); }
      if (Z[k][0] === 'grid') L.event = 'portal';
    }
    prevUnder = L.under; prevK = k; prevCamX = cp.x;
    // show only the layers near the player
    const len = track.length;
    for (const G of groups) {
      let on = false;
      for (const [a, b, mg = G.margin] of G.ranges) { const d = s < a ? Math.min(a - s, s + len - b) : s > b ? Math.min(s - b, a + len - s) : 0; if (d < mg) on = true; }
      G.g.visible = on;
    }
    for (const [im, md] of culled) if (im.parent.parent.visible) { const bs = im.boundingSphere; im.visible = bs.center.distanceTo(cp) - bs.radius < md; }
    if (seaFx && seaFx.g.visible) {
      const { jelly, tent, jel, fish, fishData, schools, whale, wC, bub, vents } = seaFx;
      jel.forEach(([x, y, z, sc, ph], k2) => { const p = Math.sin(t * 0.8 + ph), yy = y + Math.sin(t * 0.3 + ph) * 3;
        m4.makeScale(sc, sc * (1 + 0.15 * p), sc); m4.setPosition(x, yy, z); jelly.setMatrixAt(k2, m4);
        m4.makeScale(sc * (1 - 0.1 * p), sc * 3.5, sc * (1 - 0.1 * p)); m4.setPosition(x, yy, z); tent.setMatrixAt(k2, m4); });
      jelly.instanceMatrix.needsUpdate = true; tent.instanceMatrix.needsUpdate = true;
      if (schools.length) { fishData.forEach(([si, ph, dy, sp, dr], k2) => { const [x, y, z, R] = schools[si], a = ph + t * 0.5 * sp, rr = R + dr;
        e4.set(0, -a, 0); q4.setFromEuler(e4); m4.compose(v4.set(x + Math.cos(a) * rr, y + dy + Math.sin(t + ph) * 0.5, z + Math.sin(a) * rr), q4, one); fish.setMatrixAt(k2, m4); });
        fish.instanceMatrix.needsUpdate = true; }
      const wa = t * 0.025; whale.position.set(wC.x + Math.cos(wa) * 140, wC.y + Math.sin(t * 0.2) * 3, wC.z + Math.sin(wa) * 140); whale.rotation.y = -wa + Math.PI; whale.userData.tail.rotation.x = Math.sin(t * 1.2) * 0.35; whale.userData.tail.position.y = Math.sin(t * 1.2) * 0.8;
      vents.forEach(([x, y, z], v) => { for (let q = 0; q < 10; q++) { const ph = (t * 0.25 + q / 10 + v * 0.13) % 1; m4.makeTranslation(x + Math.sin(ph * 20 + q) * 0.6, y + ph * (SEA_Y - y), z + Math.cos(ph * 17 + q) * 0.6); bub.setMatrixAt(v * 10 + q, m4); } });
      bub.instanceMatrix.needsUpdate = true;
    }
    if (birds && birds.g.visible) { const { bird, birdData, flocks } = birds; birdData.forEach(([fi, da, dy, dr], k2) => { const [x, y, z, R, ph] = flocks[fi], a = ph + t * 0.12 + da, rr = R + dr;
      e4.set(0, -a, 0); q4.setFromEuler(e4); m4.compose(v4.set(x + Math.cos(a) * rr, y + dy, z + Math.sin(a) * rr), q4, birdS); bird.setMatrixAt(k2, m4); }); bird.instanceMatrix.needsUpdate = true; }
    if (traffic && traffic.g.visible) { const { tm, carsT, lanes } = traffic; carsT.forEach(([li, ph], k2) => { const [cx, cz, rx, rz, y, sp, rot] = lanes[li], a = ph + t * sp * 6, cr = Math.cos(rot), sr = Math.sin(rot);
      const ex = Math.cos(a) * rx, ez = Math.sin(a) * rz, dx = -Math.sin(a) * rx * Math.sign(sp), dz = Math.cos(a) * rz * Math.sign(sp);
      e4.set(0, Math.atan2(dx * cr - dz * sr, dx * sr + dz * cr), 0); q4.setFromEuler(e4); m4.compose(v4.set(cx + ex * cr - ez * sr, y, cz + ex * sr + ez * cr), q4, one); tm.setMatrixAt(k2, m4); }); tm.instanceMatrix.needsUpdate = true; }
    if (station && station.g.visible) station.ringM.rotation.z = station.win.rotation.z = t * 0.05;
    // camera bubbles
    if (bubT > 0) {
      bubT -= dt; let n = 0;
      for (const b of bubState) { if (!b) continue; b[1] += b[3] * dt; b[4] -= dt; if (b[4] > 0) { m4.makeTranslation(b[0] + Math.sin(t * 6 + b[3]) * 0.1, b[1], b[2]); bubbles.setMatrixAt(n++, m4); } }
      bubbles.count = n; bubbles.instanceMatrix.needsUpdate = true;
    } else bubbles.count = 0;
    return L;
  }

  // compile every layer's shaders up front (and upload textures) so nothing stalls when a layer first appears
  function precompile(renderer, camera) {
    const was = groups.map(G => G.g.visible); groups.forEach(G => { G.g.visible = true; });
    renderer.compile(scene, camera);
    scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m.map) renderer.initTexture(m.map); });
    groups.forEach((G, k) => { G.g.visible = was[k]; });
  }
  return { update, lookAt, cur, winMat, sky, portal, seaFx, groups, precompile, SEA_Y };
}
