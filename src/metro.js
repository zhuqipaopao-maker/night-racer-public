import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 云港城区 — a city at golden hour, built to real street proportions: 3.5–4 m lanes, kerbs and 5 m
// sidewalks, zebra crossings and signals at every junction, street trees and lamps, buildings with
// shopfronts at street level and floors above, a park and a riverside promenade. The drivable network is
// the main loop plus the side roads in track.paths.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const ss = THREE.MathUtils.smoothstep;
const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
const T = (c, { rep = true, srgb = true } = {}) => { const t = new THREE.CanvasTexture(c); if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const TRS = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(sx, sy, sz));
function part(geo, color, m, r, jit = 0.12) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv'); if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let k = 0; k < n; k += 3) { const f = 1 - jit / 2 + r() * jit; for (let q = 0; q < 3; q++) c.set([col.r * f, col.g * f, col.b * f], (k + q) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

// ---------- textures ----------
// asphalt for a road `w` metres wide (512 px across, 1024 px = 32 m along) with its lane markings
function streetTex(w, kind) {
  return T(cv(512, 1024, (g, W, H) => {
    const r = rng(kind.length * 7 + 3), px = W / w;
    g.fillStyle = kind === 'park' ? '#3a3734' : '#2d2e31'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30000; i++) { const v = 30 + r() * 45; g.fillStyle = `rgba(${v},${v},${v + 3},${0.3 + r() * 0.4})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    // patched repairs and oil darkening down the middle of each lane
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(20,20,22,${0.15 + r() * 0.15})`; g.fillRect(r() * W, r() * H, 40 + r() * 120, 30 + r() * 90); }
    const lanes = kind === 'avenue' ? [-5.75, -2.0, 2.0, 5.75] : [-2.2, 2.2];
    g.fillStyle = 'rgba(8,8,10,0.16)'; for (const l of lanes) g.fillRect((w / 2 + l) * px - 0.6 * px, 0, 1.2 * px, H);
    if (kind === 'plain') return;
    const white = '#dcd8cc', yellow = '#d9a62a';
    g.fillStyle = white; g.fillRect(0.3 * px, 0, 0.15 * px, H); g.fillRect(W - 0.45 * px, 0, 0.15 * px, H);   // edge lines
    if (kind === 'avenue') {
      for (const l of [-3.9, 3.9]) for (let y = 0; y < H; y += 9 * px) g.fillRect((w / 2 + l) * px - 0.075 * px, y, 0.15 * px, 4.5 * px);   // lane lines (6 m dash, 3 m gap scaled)
      g.fillStyle = yellow; g.fillRect((w / 2 - 0.25) * px, 0, 0.13 * px, H); g.fillRect((w / 2 + 0.12) * px, 0, 0.13 * px, H);
    } else if (kind === 'alley') { g.fillStyle = yellow; for (let y = 0; y < H; y += 8 * px) g.fillRect((w / 2 - 0.07) * px, y, 0.14 * px, 4 * px); }
    else { g.fillStyle = white; for (let y = 0; y < H; y += 6 * px) g.fillRect((w / 2 - 0.07) * px, y, 0.14 * px, 3 * px); }
    // fine cracks
    g.strokeStyle = 'rgba(10,10,12,0.55)'; g.lineWidth = 1;
    for (let i = 0; i < 16; i++) { g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 24; y += r() * 22; g.lineTo(x, y); } g.stroke(); }
  }));
}
// sidewalk paving: 0.6 m square slabs (256 px = 3 m)
const pavingTex = () => T(cv(256, 256, (g, W) => {
  const r = rng(11); g.fillStyle = '#9d9a94'; g.fillRect(0, 0, W, W); const s = W / 5;
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) { const v = 150 + r() * 26; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(a * s + 1.5, b * s + 1.5, s - 3, s - 3);
    for (let i = 0; i < 40; i++) { const q = 120 + r() * 60; g.fillStyle = `rgba(${q},${q},${q},0.35)`; g.fillRect(a * s + r() * s, b * s + r() * s, 1.5, 1.5); } }
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(60,55,50,0.12)'; g.beginPath(); g.arc(r() * W, r() * W, 6 + r() * 14, 0, 7); g.fill(); }
}));
const grassTex = () => T(cv(256, 256, (g, W) => { const r = rng(5); g.fillStyle = '#4f6a2c'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) { const h = 70 + r() * 30, l = 22 + r() * 22; g.fillStyle = `hsla(${h},45%,${l}%,0.6)`; g.fillRect(r() * W, r() * W, 1, 2 + r() * 3); } }));

// Facade atlas: bottom quarter = the ground-floor shopfronts (one 12 m bay), top three quarters = three
// floors × four window bays. `lit` draws the emissive version (window glass / shop interiors only).
const SHOPS = ['便利店', '咖啡', '面馆', '药房', '书店', '花店', '银行', '烘焙', '眼镜', '茶饮', '五金', '超市', '酒店', '火锅'];
function facade(style, lit) {
  return T(cv(512, 512, (g, W, H) => {
    const r = rng(style.length * 31 + 9);
    const pal = { glass: ['#8fa6ad', '#5d7480'], office: ['#c9c3b8', '#7d8a94'], brick: ['#8e4a36', '#3a3f45'], resi: ['#d9cdb6', '#56636e'] }[style];
    const up = H * 0.75;   // canvas y < up: upper floors (three rows); y >= up: shopfront
    g.fillStyle = lit ? '#000' : pal[0]; g.fillRect(0, 0, W, H);
    if (!lit && style === 'brick') { for (let y = 0; y < up; y += 6) for (let x = (y / 6) % 2 ? -10 : 0; x < W; x += 20) { const v = 120 + r() * 40; g.fillStyle = `rgb(${v},${v * 0.52},${v * 0.38})`; g.fillRect(x + 1, y + 1, 18, 4); } }
    if (!lit && style !== 'brick') for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * W, r() * up, 2, 2); }
    const fh = up / 3, bw = W / 4;
    for (let f = 0; f < 3; f++) for (let b = 0; b < 4; b++) {
      const x0 = b * bw, y0 = f * fh;
      if (style === 'glass') {   // curtain wall: big panes, thin mullions, a spandrel band per floor
        if (lit) { g.fillStyle = r() < 0.35 ? '#ffd7a0' : r() < 0.3 ? '#cfe2ff' : '#111'; g.fillRect(x0 + 3, y0 + 3, bw - 6, fh * 0.8 - 6); continue; }
        const grd = g.createLinearGradient(x0, y0, x0 + bw, y0 + fh); grd.addColorStop(0, '#6f8fa0'); grd.addColorStop(0.5, '#a9c4cf'); grd.addColorStop(1, '#4d6878');
        g.fillStyle = grd; g.fillRect(x0 + 2, y0 + 2, bw - 4, fh * 0.8 - 4);
        g.fillStyle = '#3c4a52'; g.fillRect(x0, y0 + fh * 0.8, bw, fh * 0.2); g.fillStyle = '#2a3238'; g.fillRect(x0 + bw / 2 - 1, y0, 2, fh * 0.8);
      } else {
        const wx = x0 + bw * (style === 'office' ? 0.06 : 0.22), ww = bw * (style === 'office' ? 0.88 : 0.56), wy = y0 + fh * 0.22, wh = fh * (style === 'office' ? 0.5 : 0.58);
        if (lit) { g.fillStyle = r() < 0.4 ? (r() < 0.7 ? '#ffcf8a' : '#e8f0ff') : '#111'; g.fillRect(wx + 3, wy + 3, ww - 6, wh - 6); continue; }
        if (style === 'office') { g.fillStyle = '#b5ada2'; g.fillRect(x0, y0 + fh * 0.76, bw, fh * 0.24); }
        g.fillStyle = '#e8e2d6'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 8);   // frame + sill
        const grd = g.createLinearGradient(wx, wy, wx, wy + wh); grd.addColorStop(0, '#9fb3bf'); grd.addColorStop(1, '#3b4a56');
        g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = '#e8e2d6'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        if (style === 'resi' && f % 1 === 0) { g.fillStyle = '#8a8f94'; g.fillRect(wx - 6, wy + wh * 0.62, ww + 12, 3); for (let x = wx - 6; x < wx + ww + 6; x += 6) g.fillRect(x, wy + wh * 0.62, 1.5, wh * 0.38 + 6); g.fillRect(wx - 6, wy + wh + 6, ww + 12, 4); }
        if (style === 'resi' && r() < 0.4) { g.fillStyle = '#e8e0d0'; g.fillRect(wx + 4, wy + 4, ww * 0.4, wh - 8); }   // curtain
      }
    }
    // shopfront: a signboard band above glazing with a door
    const sy = up, sh = H - up;
    if (!lit) { g.fillStyle = '#2b2b2e'; g.fillRect(0, sy, W, sh); }
    const n = 2;
    for (let s = 0; s < n; s++) {
      const x0 = s * W / n, sw = W / n, col = ['#b0322a', '#1f5f8f', '#2f7a43', '#c98a1c', '#5a3b7a'][(s + style.length) % 5];
      if (lit) { g.fillStyle = '#ffd9a0'; g.fillRect(x0 + 10, sy + sh * 0.36, sw - 20, sh * 0.6); g.fillStyle = 'rgba(90,60,30,0.55)'; for (let q = 0; q < 4; q++) g.fillRect(x0 + 16 + q * (sw - 32) / 4, sy + sh * 0.5, (sw - 32) / 4 - 10, sh * 0.06); for (let q = 0; q < 3; q++) { const px = x0 + 20 + r() * (sw - 40); g.fillRect(px, sy + sh * 0.62, 8, sh * 0.34); g.beginPath(); g.arc(px + 4, sy + sh * 0.6, 6, 0, 7); g.fill(); } g.fillStyle = '#1c1c1e'; g.fillRect(x0 + sw * 0.42, sy + sh * 0.36, sw * 0.16, sh * 0.62); g.fillStyle = '#fff2cf'; g.font = `bold ${sh * 0.2}px sans-serif`; g.textAlign = 'center'; g.fillText(SHOPS[(s * 5 + style.length * 3) % SHOPS.length], x0 + sw / 2, sy + sh * 0.27); continue; }
      g.fillStyle = col; g.fillRect(x0 + 6, sy + 6, sw - 12, sh * 0.28);
      g.fillStyle = '#f4ead2'; g.font = `bold ${sh * 0.2}px sans-serif`; g.textAlign = 'center'; g.fillText(SHOPS[(s * 5 + style.length * 3) % SHOPS.length], x0 + sw / 2, sy + sh * 0.27);
      const grd = g.createLinearGradient(0, sy + sh * 0.36, 0, H); grd.addColorStop(0, '#7f94a0'); grd.addColorStop(1, '#2a3238');
      g.fillStyle = grd; g.fillRect(x0 + 10, sy + sh * 0.36, sw - 20, sh * 0.6);
      g.fillStyle = '#1c1c1e'; g.fillRect(x0 + sw * 0.42, sy + sh * 0.36, sw * 0.16, sh * 0.62); g.fillStyle = '#b8b8b8'; g.fillRect(x0 + sw * 0.5 - 1, sy + sh * 0.36, 2, sh * 0.62);
    }
  }));
}

// Buildings use world-space texture coordinates, so every instance (any size) gets 12 m bays and
// 3.3 m floors, with the shop level at the bottom; flat roofs are gravel; lit windows vary per building.
function buildingMaterial(style, opts) {
  const m = new THREE.MeshStandardMaterial({ map: facade(style, false), emissiveMap: facade(style, true), emissive: 0xffffff, emissiveIntensity: opts.glow,
    roughness: style === 'glass' ? 0.12 : style === 'brick' ? 0.85 : 0.7, metalness: style === 'glass' ? 0.55 : 0.0, envMapIntensity: style === 'glass' ? 1.4 : 0.6 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN; varying float vBid;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
        mat4 mm = modelMatrix * instanceMatrix; vBid = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.711;
      #else
        mat4 mm = modelMatrix; vBid = 0.0;
      #endif
      vWP = (mm * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(mm) * objectNormal);`);
    sh.fragmentShader = 'varying vec3 vWP; varying vec3 vWN; varying float vBid;\nfloat bh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWN); float roof = step(0.6, wn.y);
        float u = (abs(wn.x) > abs(wn.z) ? -vWP.z * sign(wn.x) : vWP.x * sign(wn.z)) / 12.0 + vBid;
        float shopH = 4.6, fl = 3.3;
        vec2 fuv = vWP.y < shopH ? vec2(fract(u), clamp(vWP.y / shopH, 0.0, 1.0) * 0.25) : vec2(fract(u), 0.25 + fract((vWP.y - shopH) / (fl * 3.0)) * 0.75);
        vec4 tc = texture2D(map, fuv);
        diffuseColor *= roof > 0.5 ? vec4(0.36, 0.35, 0.34, 1.0) : tc;
        diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 2.5, vWP.y));   // grime / contact shadow at the base
      `)
      .replace('#include <emissivemap_fragment>', `
        float cellOn = step(0.78, bh(vec3(floor(u * 4.0), floor((vWP.y - shopH) / fl), floor(vBid * 7.0))));
        vec3 em = texture2D(emissiveMap, fuv).rgb * (vWP.y < shopH ? 0.5 : cellOn) * (1.0 - roof);
        totalEmissiveRadiance *= em;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = roof > 0.5 ? 0.95 : roughnessFactor;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = roof > 0.5 || vWP.y < 4.6 ? 0.0 : metalnessFactor;');
  };
  return m;
}

export function buildMetro(scene, track, opts = {}) {
  const Q = opts.quality ?? 1, r = rng(2046), group = new THREE.Group(); scene.add(group);
  const time = { value: 0 };
  // all drivable roads as uniform records (the main loop is closed)
  const main = { id: 0, kind: 'avenue', closed: true, K: track.N, px: track.px, pz: track.pz, nx: track.nx, nz: track.nz, tx: track.tx, tz: track.tz, half: track.half, edge: track.edge };
  const roads = [main, ...(track.paths || []).map(P => ({ ...P, closed: false, kind: P.kind === 'river' ? 'avenue' : P.kind }))];
  // spatial hash of every road sample → distance to each road nearby
  const CELL = 30, H = new Map();
  roads.forEach((R, ri) => { for (let k = 0; k < R.K; k++) { const key = Math.floor(R.px[k] / CELL) + ',' + Math.floor(R.pz[k] / CELL); if (!H.has(key)) H.set(key, []); H.get(key).push(ri, k); } });
  const near = (x, z, rad = 60) => {   // per road: nearest distance; plus overall nearest {d, road}
    const out = new Map(); const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), n = Math.ceil(rad / CELL);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { const L = H.get((cx + a) + ',' + (cz + b)); if (!L) continue;
      for (let q = 0; q < L.length; q += 2) { const R = roads[L[q]], k = L[q + 1], d = Math.hypot(R.px[k] - x, R.pz[k] - z); if (!out.has(L[q]) || d < out.get(L[q])) out.set(L[q], d); } }
    return out;
  };
  // how far a point is outside the nearest road's tarmac (negative = on a road)
  const clear = (x, z, rad = 60) => { let m = 1e9; for (const [ri, d] of near(x, z, rad)) m = Math.min(m, d - roads[ri].edge); return m; };
  const onOtherRoad = (x, z, self, pad = 0.3) => { for (const [ri, d] of near(x, z, 30)) if (ri !== self && d < roads[ri].edge + pad) return true; return false; };

  // ---------- strip meshes along a road ----------
  const strip = (R, k0, k1, a, b, ya, yb, tile) => {
    const n = k1 - k0, pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
    const val = (v, k) => (typeof v === 'function' ? v(k) : v);
    for (let q = 0; q <= n; q++) { const k = (k0 + q) % R.K, A = val(a, k), B = val(b, k);
      pos.set([R.px[k] + R.nx[k] * A, val(ya, k), R.pz[k] + R.nz[k] * A, R.px[k] + R.nx[k] * B, val(yb, k), R.pz[k] + R.nz[k] * B], q * 6);
      uv.set([0, q * track.step / tile, 1, q * track.step / tile], q * 4); if (q < n) { const j = q * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const runs = (R, pred) => { const out = []; let st = -1; const n = R.closed ? R.K + 1 : R.K; for (let k = 0; k <= n; k++) { const on = k < n && pred(k % R.K); if (on && st < 0) st = k; if (!on && st >= 0) { if (k - 1 > st) out.push([st, k - 1]); st = -1; } } return out; };
  const add = (g, m, recv = true) => { const o = new THREE.Mesh(g, m); o.receiveShadow = recv; group.add(o); return o; };

  // ---------- tarmac ----------
  const road = kind => new THREE.MeshStandardMaterial({ map: streetTex(kind === 'avenue' ? 16 : kind === 'alley' ? 10.4 : 11.2, kind), roughness: 0.82, metalness: 0, envMapIntensity: 0.5 });
  const plainRoad = new THREE.MeshStandardMaterial({ map: streetTex(16, 'plain'), roughness: 0.85, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const gutter = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 });
  for (const R of roads) {
    const mat = road(R.kind);
    if (R.id) { mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2; }
    // side roads: no markings where they share tarmac with the main road
    const junction = k => R.id && (onOtherRoad(R.px[k], R.pz[k], R.id ? roads.indexOf(R) : 0, -R.edge * 0.4) || onOtherRoad(R.px[k] + R.nx[k] * R.half, R.pz[k] + R.nz[k] * R.half, roads.indexOf(R), -0.5) || onOtherRoad(R.px[k] - R.nx[k] * R.half, R.pz[k] - R.nz[k] * R.half, roads.indexOf(R), -0.5));
    const ry = R.kind === 'park' ? 0.09 : 0;   // (the park road sits above the lawn)
    for (const [a, b] of runs(R, k => !junction(k))) add(strip(R, a, b, -R.half, R.half, ry + 0.012 * (R.id ? 1 : 0), ry + 0.012 * (R.id ? 1 : 0), 32), mat);
    for (const [a, b] of runs(R, junction)) add(strip(R, a, b, -R.edge, R.edge, 0.014, 0.014, 32), plainRoad);
    for (const sd of [-1, 1]) add(strip(R, 0, R.closed ? R.K : R.K - 1, sd * R.half, sd * R.edge, ry + 0.005, ry + 0.005, 4), gutter);
  }
  // ---------- kerbs and sidewalks (cut where another road crosses) ----------
  const paving = pavingTex(); paving.repeat.set(5 / 3, 1);
  const walkMat = new THREE.MeshStandardMaterial({ map: paving, roughness: 0.8, envMapIntensity: 0.5 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.7 });
  const WALK = 5, KH = 0.15;
  roads.forEach((R, ri) => { for (const sd of [-1, 1]) {
    const ok = k => !onOtherRoad(R.px[k] + R.nx[k] * sd * (R.edge + 1.2), R.pz[k] + R.nz[k] * sd * (R.edge + 1.2), ri, 0.2) && !onOtherRoad(R.px[k] + R.nx[k] * sd * (R.edge + WALK - 0.5), R.pz[k] + R.nz[k] * sd * (R.edge + WALK - 0.5), ri, 0.2);
    for (const [a, b] of runs(R, ok)) {
      add(strip(R, a, b, sd * R.edge, sd * R.edge, 0, KH, 2), kerbMat);
      add(strip(R, a, b, sd * R.edge, sd * (R.edge + 0.3), KH, KH, 2), kerbMat);
      add(strip(R, a, b, sd * (R.edge + 0.3), sd * (R.edge + WALK), KH + 0.001 * ri, KH + 0.001 * ri, 3), walkMat);
    }
  } });

  // ---------- park and river areas ----------
  const park = roads.find(R => R.kind === 'park'), riverRoad = roads.find(R => R.id === 3);
  let parkBox = null;
  if (park) {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let k = 0; k < park.K; k++) { a = Math.min(a, park.px[k]); b = Math.max(b, park.px[k]); c = Math.min(c, park.pz[k]); d = Math.max(d, park.pz[k]); }
    // the block the park road runs through, out to the main road sidewalks around it
    parkBox = { x0: 500 + track.edge + WALK, x1: 800 - track.edge - WALK, z0: 300 + track.edge + WALK, z1: 700 - track.edge - WALK };
  }
  const RZ0 = 700 + track.edge + WALK + 6, RZ1 = RZ0 + 120;   // the river, south of the riverside roads
  const inPark = (x, z, pad = 0) => parkBox && x > parkBox.x0 - pad && x < parkBox.x1 + pad && z > parkBox.z0 - pad && z < parkBox.z1 + pad;
  const inRiver = (x, z, pad = 0) => z > RZ0 - pad && z < RZ1 + pad;

  // ground: plazas / courtyards between buildings
  const B = track.bounds, cx = (B.minx + B.maxx) / 2, cz = (B.minz + B.maxz) / 2;
  const groundTex = pavingTex(); groundTex.repeat.set(600, 600);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), new THREE.MeshStandardMaterial({ map: groundTex, color: 0x8a8782, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.02, cz); ground.receiveShadow = true; group.add(ground);
  if (parkBox) {
    const gt = grassTex(); gt.repeat.set((parkBox.x1 - parkBox.x0) / 6, (parkBox.z1 - parkBox.z0) / 6);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(parkBox.x1 - parkBox.x0, parkBox.z1 - parkBox.z0), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set((parkBox.x0 + parkBox.x1) / 2, 0.06, (parkBox.z0 + parkBox.z1) / 2); grass.receiveShadow = true; group.add(grass);
    // a pond with a stone rim
    const px = parkBox.x0 + (parkBox.x1 - parkBox.x0) * 0.72, pz = parkBox.z0 + (parkBox.z1 - parkBox.z0) * 0.3;
    if (clear(px, pz, 90) > 40) {
      const pond = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshStandardMaterial({ color: 0x2d4a52, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.2 }));
      pond.rotation.x = -Math.PI / 2; pond.position.set(px, 0.08, pz); group.add(pond);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(26.3, 0.5, 6, 64), new THREE.MeshStandardMaterial({ color: 0xbab3a6, roughness: 0.8 })); rim.rotation.x = -Math.PI / 2; rim.position.set(px, 0.1, pz); group.add(rim);
    }
  }
  // river: embankment wall, railing, water with a moving sheen, a bridge downstream
  {
    const W = 3600, water = new THREE.Mesh(new THREE.PlaneGeometry(W, RZ1 - RZ0, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3d5660, roughness: 0.08, metalness: 0.7, envMapIntensity: 1.3 }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, -2.2, (RZ0 + RZ1) / 2); group.add(water);
    const stone = new THREE.MeshStandardMaterial({ color: 0x9c968b, roughness: 0.85 });
    for (const [z, sd] of [[RZ0, 1], [RZ1, -1]]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 2.4, 1.2), stone); wall.position.set(cx, -1.0, z + sd * -0.6); wall.receiveShadow = true; group.add(wall); }
    const rail = []; for (let x = cx - 1800; x < cx + 1800; x += 2.2) rail.push(x);
    const railM = new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.6, roughness: 0.4 });
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), railM, rail.length); rail.forEach((x, k) => posts.setMatrixAt(k, TRS(x, 0.55, RZ0 - 0.4))); group.add(posts);
    for (const y of [1.05, 0.55]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.06), railM); bar.position.set(cx, y, RZ0 - 0.4); group.add(bar); }
    // promenade paving between road sidewalk and river wall
    const prom = new THREE.Mesh(new THREE.PlaneGeometry(W, 6), walkMat); prom.rotation.x = -Math.PI / 2; prom.position.set(cx, 0.14, RZ0 - 3); prom.receiveShadow = true; group.add(prom);
    // a bridge across the river to the west
    const bx = -260, deck = new THREE.Mesh(new THREE.BoxGeometry(22, 1.4, RZ1 - RZ0 + 10), stone); deck.position.set(bx, 3.5, (RZ0 + RZ1) / 2); deck.castShadow = deck.receiveShadow = true; group.add(deck);
    for (let k = 0; k < 4; k++) { const z = RZ0 + (k + 0.5) * (RZ1 - RZ0) / 4, arch = new THREE.Mesh(new THREE.TorusGeometry(12, 1.6, 8, 24, Math.PI), stone); arch.position.set(bx, -2.2, z); arch.rotation.y = Math.PI / 2; arch.scale.set(1, 0.5, 6.5); group.add(arch); }
  }

  // ---------- buildings ----------
  const styles = ['glass', 'office', 'brick', 'resi'], mats = Object.fromEntries(styles.map(s => [s, buildingMaterial(s, { glow: 0.3 })]));
  const lists = Object.fromEntries(styles.map(s => [s, []])), roofBits = [], tanks = [];
  const center = new THREE.Vector2(500, 350);
  const occupied = [];
  const free = (x, z, rad) => { for (const [ox, oz, orad] of occupied) if ((ox - x) ** 2 + (oz - z) ** 2 < (orad + rad) ** 2) return false; return true; };
  const place = (x, z, w, d, rot) => {
    const rad = Math.hypot(w, d) / 2;
    if (inPark(x, z, rad + 4) || inRiver(x, z, rad + 8)) return false;
    if (clear(x, z, 90) < WALK + 2 + rad) return false;
    if (!free(x, z, rad * 0.8)) return false;
    occupied.push([x, z, rad * 0.8]);
    const dc = new THREE.Vector2(x, z).distanceTo(center), tall = Math.max(0, 1 - dc / 900);
    let h = 12 + Math.pow(r(), 2.2) * 50 + tall * tall * (40 + r() * 120);
    const style = h > 60 ? (r() < 0.6 ? 'glass' : 'office') : h > 30 ? ['office', 'glass', 'resi', 'brick'][Math.floor(r() * 4)] : (r() < 0.5 ? 'brick' : 'resi');
    h = Math.max(9, Math.round((h - 4.6) / 3.3) * 3.3 + 4.6);
    const tint = new THREE.Color().setHSL(0.08 + r() * 0.06, 0.1, 0.85 + r() * 0.15);
    if (h > 50) {   // podium + tower
      const ph = 4.6 + 3.3 * 2; lists[style === 'glass' ? 'office' : style].push([x, z, w, d, 0, ph, rot, tint]);
      lists[style].push([x, z, w * 0.72, d * 0.72, ph, h, rot, tint]);
      if (r() < 0.6) { roofBits.push([x, h, z, w * 0.25, d * 0.25, 3, rot]); }
    } else {
      lists[style].push([x, z, w, d, 0, h, rot, tint]);
      for (let k = 0; k < 2 + Math.floor(r() * 3); k++) roofBits.push([x + (r() - 0.5) * w * 0.6, h, z + (r() - 0.5) * d * 0.6, 1.5 + r() * 2.5, 1.5 + r() * 2, 1 + r() * 1.5, rot]);
      if (style === 'brick' && r() < 0.5) tanks.push([x + (r() - 0.5) * w * 0.4, h, z + (r() - 0.5) * d * 0.4]);
    }
    return true;
  };
  // first a row of buildings right behind every sidewalk, facing the street; then fill the blocks
  for (const R of roads) for (const sd of [-1, 1]) {
    for (let k = 0; k < R.K; k += 2) {
      const w = 14 + r() * 16, d = 14 + r() * 14, off = sd * (R.edge + WALK + 1.5 + d / 2), x = R.px[k] + R.nx[k] * off, z = R.pz[k] + R.nz[k] * off;
      if (place(x, z, w, d, Math.atan2(R.tx[k], R.tz[k]))) k += Math.round((w + 1) / track.step / 2);
    }
  }
  for (let t = 0; t < 6000 * Q + 1500; t++) {
    const x = cx + (r() - 0.5) * 2600, z = cz + (r() - 0.5) * 2600, w = 16 + r() * 22, d = 16 + r() * 22;
    place(x, z, w, d, Math.round(r()) * Math.PI / 2 * 0);
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const s of styles) {
    const L = lists[s], im = new THREE.InstancedMesh(box, mats[s], Math.max(1, L.length)); im.count = L.length;
    L.forEach(([x, z, w, d, y0, y1, rot, tint], k) => { im.setMatrixAt(k, TRS(x, (y0 + y1) / 2, z, rot, w, y1 - y0, d)); im.setColorAt(k, tint); });
    im.castShadow = im.receiveShadow = true; group.add(im);
  }
  const grey = new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.7, metalness: 0.2 });
  const rb = new THREE.InstancedMesh(box, grey, Math.max(1, roofBits.length)); rb.count = roofBits.length;
  roofBits.forEach(([x, y, z, w, d, h, rot], k) => rb.setMatrixAt(k, TRS(x, y + h / 2, z, rot, w, h, d))); rb.castShadow = true; group.add(rb);
  const tk = new THREE.InstancedMesh(mergeGeometries([part(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 14).translate(0, 3.4, 0), 0x7a5a3a, null, r, 0.05), part(new THREE.ConeGeometry(1.5, 0.9, 14).translate(0, 5.05, 0), 0x5a4a3a, null, r, 0.05),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => part(new THREE.CylinderGeometry(0.08, 0.08, 2.2).translate(a * 1, 1.1, b * 1), 0x333333, null, r, 0))]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), Math.max(1, tanks.length));
  tk.count = tanks.length; tanks.forEach(([x, y, z], k) => tk.setMatrixAt(k, TRS(x, y, z))); tk.castShadow = true; group.add(tk);

  // ---------- street furniture ----------
  const inst = (geo, mat, list, setter, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length; const m = new THREE.Matrix4(); list.forEach((it, k) => { setter(m, it, k, im); im.setMatrixAt(k, m); }); im.castShadow = shadow; im.receiveShadow = true; group.add(im); return im; };
  const lamps = [], trees = [], signals = [], benches = [];
  roads.forEach((R, ri) => {
    const sp = R.kind === 'alley' ? 22 : 30, every = Math.round(sp / track.step);
    for (let k = 0; k < R.K; k += every) for (const sd of [-1, 1]) {
      if (((k / every) + (sd > 0 ? 1 : 0)) % 2) continue;
      const off = sd * (R.edge + 0.7), x = R.px[k] + R.nx[k] * off, z = R.pz[k] + R.nz[k] * off;
      if (onOtherRoad(x, z, ri, 1.5)) continue;
      lamps.push([x, z, Math.atan2(-R.nx[k] * sd, -R.nz[k] * sd)]);
    }
    if (R.kind === 'avenue') for (let k = Math.round(7 / track.step); k < R.K; k += Math.round(13 / track.step)) for (const sd of [-1, 1]) {
      const off = sd * (R.edge + 3.4), x = R.px[k] + R.nx[k] * off, z = R.pz[k] + R.nz[k] * off;
      if (onOtherRoad(x, z, ri, 4) || inRiver(x, z, 2)) continue;
      trees.push([x, z, 7 + r() * 3, r() * 6]);
    }
  });
  // traffic signals where each side road meets the main road
  for (const P of track.paths || []) for (const end of [0, P.K - 1]) {
    // walk in from the end until the side road leaves the main road
    const dir = end ? -1 : 1; let k = end; while (k > 0 && k < P.K - 1 && onOtherRoad(P.px[k] + P.nx[k] * P.half, P.pz[k] + P.nz[k] * P.half, roads.findIndex(R => R.id === P.id), 0) && onOtherRoad(P.px[k] - P.nx[k] * P.half, P.pz[k] - P.nz[k] * P.half, roads.findIndex(R => R.id === P.id), 0)) k += dir;
    k += dir * Math.round(4 / track.step);
    if (k < 0 || k >= P.K) continue;
    for (const sd of [-1, 1]) signals.push([P.px[k] + P.nx[k] * sd * (P.edge + 0.8), P.pz[k] + P.nz[k] * sd * (P.edge + 0.8), Math.atan2(P.tx[k], P.tz[k]) + (end ? Math.PI : 0), sd]);
    // zebra crossing across the side road
    P.zebra = (P.zebra || []).concat([k + dir * Math.round(3 / track.step)]);
  }
  const metal = new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: 0.7, roughness: 0.4 });
  const lampGeo = mergeGeometries([new THREE.CylinderGeometry(0.09, 0.14, 8.5, 8).translate(0, 4.25, 0), new THREE.BoxGeometry(0.1, 0.1, 2.2).translate(0, 8.4, 1.0), new THREE.BoxGeometry(0.35, 0.16, 0.8).translate(0, 8.33, 2.0)]);
  inst(lampGeo, metal, lamps, (m, [x, z, a]) => m.copy(TRS(x, 0.15, z, a)));
  inst(new THREE.BoxGeometry(0.3, 0.04, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.2), toneMapped: false }), lamps, (m, [x, z, a]) => m.copy(TRS(x + Math.sin(a) * 2, 8.4, z + Math.cos(a) * 2, a)), false);
  const treeGeo = (() => { const P = [part(new THREE.CylinderGeometry(0.022, 0.035, 0.5, 7).translate(0, 0.25, 0), 0x5a4a3c, null, r)];
    for (let q = 0; q < 4; q++) P.push(part(new THREE.CylinderGeometry(0.008, 0.016, 0.3, 5).translate(0, 0.15, 0), 0x5a4a3c, TRS(0, 0.42, 0, q * 1.6, 1, 1, 1, 0.55), r));
    const blobs = [[0, 0.68, 0, 0.26], [0.17, 0.62, 0.06, 0.18], [-0.16, 0.63, -0.05, 0.19], [0.05, 0.62, -0.17, 0.18], [-0.04, 0.64, 0.17, 0.18], [0.1, 0.8, 0.08, 0.17], [-0.09, 0.79, -0.08, 0.17], [0, 0.9, 0, 0.13]];
    blobs.forEach(([x, y, z, s], q) => P.push(part(new THREE.IcosahedronGeometry(1, 2), [0x4f7a34, 0x5d8a3c, 0x456e2e, 0x678f42][q % 4], TRS(x, y, z, q, s, s * 0.8, s), r, 0.18)));
    return mergeGeometries(P); })();
  inst(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), trees, (m, [x, z, h, a]) => m.copy(TRS(x, 0.15, z, a, h, h, h)));
  inst(new THREE.BoxGeometry(1.4, 0.05, 1.4), new THREE.MeshStandardMaterial({ color: 0x2e2e2e, metalness: 0.5, roughness: 0.6 }), trees, (m, [x, z]) => m.copy(TRS(x, 0.17, z)), false);
  // signal: pole, mast arm over the road, three-lamp heads (red lit on one side, green the other)
  const sigGeo = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.15, 6.2, 8).translate(0, 3.1, 0), new THREE.BoxGeometry(0.12, 0.12, 5.5).translate(0, 6.0, 2.7), new THREE.BoxGeometry(0.4, 1.2, 0.35).translate(0, 5.4, 4.8), new THREE.BoxGeometry(0.35, 0.9, 0.3).translate(0, 2.8, 0.2)]);
  inst(sigGeo, new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.5, roughness: 0.5 }), signals, (m, [x, z, a, sd]) => m.copy(TRS(x, 0.15, z, a + (sd > 0 ? -Math.PI / 2 : Math.PI / 2))));
  inst(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.8), toneMapped: false }), signals, (m, [x, z, a, sd]) => { const b = a + (sd > 0 ? -Math.PI / 2 : Math.PI / 2); m.copy(TRS(x + Math.sin(b) * 4.8 - Math.sin(a) * 0.2, 5.0, z + Math.cos(b) * 4.8 - Math.cos(a) * 0.2)); }, false);
  // zebra crossings: on the side roads at both ends, and on the main road beside each junction
  const zeb = [];
  const zebraAt = (R, k) => { if (k < 0 || k >= R.K) return; for (let o = -R.half + 0.6; o <= R.half - 0.6; o += 1.0) zeb.push([R.px[k] + R.nx[k] * o, R.pz[k] + R.nz[k] * o, Math.atan2(R.tx[k], R.tz[k])]); };
  for (const P of track.paths || []) { for (const k of P.zebra || []) zebraAt(P, k); for (const i of [P.i0, P.i1]) zebraAt(main, (i + (i === P.i0 ? -1 : 1) * Math.round(9 / track.step) + track.N) % track.N); }
  inst(new THREE.BoxGeometry(0.5, 0.02, 3.2), new THREE.MeshStandardMaterial({ color: 0xe2ded2, roughness: 0.6 }), zeb, (m, [x, z, a]) => m.copy(TRS(x, 0.025, z, a)), false);
  // park: trees, paths of benches
  if (parkBox) {
    const pt = [];
    for (let t = 0; t < 2500 && pt.length < 260 * Q + 40; t++) { const x = parkBox.x0 + r() * (parkBox.x1 - parkBox.x0), z = parkBox.z0 + r() * (parkBox.z1 - parkBox.z0); if (clear(x, z, 60) < WALK + 3) continue; pt.push([x, z, 6 + r() * 8, r() * 6]); }
    inst(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), pt, (m, [x, z, h, a]) => m.copy(TRS(x, 0.05, z, a, h * 1.2, h, h * 1.2)));
    const P = park; for (let k = 10; k < P.K - 10; k += Math.round(25 / track.step)) for (const sd of [-1, 1]) benches.push([P.px[k] + P.nx[k] * sd * (P.edge + 2.5), P.pz[k] + P.nz[k] * sd * (P.edge + 2.5), Math.atan2(P.tx[k], P.tz[k]) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2)]);
    const benchGeo = mergeGeometries([part(new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0), 0x8a5a36, null, r), part(new THREE.BoxGeometry(1.8, 0.45, 0.06).translate(0, 0.7, -0.22), 0x8a5a36, null, r), part(new THREE.BoxGeometry(0.06, 0.45, 0.45).translate(-0.8, 0.22, 0), 0x333333, null, r), part(new THREE.BoxGeometry(0.06, 0.45, 0.45).translate(0.8, 0.22, 0), 0x333333, null, r)]);
    inst(benchGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), benches, (m, [x, z, a]) => m.copy(TRS(x, 0.15, z, a)));
  }
  return { update(t) { time.value = t; } };
}
