import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 赤岩峡谷 — a desert at sunset: sand flats and dunes, a red-rock plateau the road cuts a canyon through,
// a ravine to jump, a cliff ledge above a dry riverbed, a natural stone arch, mesas on the horizon,
// saguaros, a gas station at the start, tumbleweeds and vultures.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += vnoise(x * f, z * f) * a; f *= 2.03; a *= 0.5; } return s; };
const ss = THREE.MathUtils.smoothstep;
const TRS = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
// one-colour part for merged, vertex-coloured models
function part(geo, color, m, r, jitter = 0.15) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv'); if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let k = 0; k < n; k += 3) { const f = 1 - jitter / 2 + r() * jitter; for (let q = 0; q < 3; q++) c.set([col.r * f, col.g * f, col.b * f], (k + q) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function lumpy(geo, amt, freq, seed = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); v.multiplyScalar(1 + (fbm(v.x * freq + seed, v.z * freq + v.y * freq * 0.7, 3) - 0.5) * amt); p.setXYZ(k, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
// red sandstone colours with horizontal strata by height
const SAND = new THREE.Color(0xd9a46a), ROCK = new THREE.Color(0xa64a2a), ROCK2 = new THREE.Color(0xc8703e), DARK = new THREE.Color(0x6a3020), PALE = new THREE.Color(0xe8c49a);
function strata(col, y, x, z, steep) {
  const band = 0.5 + 0.5 * Math.sin(y * 0.9 + fbm(x * 0.02, z * 0.02, 2) * 4);
  col.copy(ROCK).lerp(ROCK2, band * 0.8).lerp(PALE, ss(Math.sin(y * 0.35 + 1.3), 0.85, 1) * 0.6).lerp(DARK, (1 - band) * 0.25);
  return col.lerp(SAND, 1 - steep);
}

export function buildDesertSky(scene, sunDir) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: sunDir.clone().normalize() }, time: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; uniform float time; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float y = vP.y; float d = max(dot(vP, normalize(sun)), 0.0);
        vec3 zen = vec3(0.16,0.24,0.5), mid = vec3(0.55,0.5,0.6), hor = vec3(1.0,0.62,0.34), low = vec3(0.75,0.5,0.36);
        vec3 c = y > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.2, y)) : mix(hor, low, smoothstep(0.0, -0.1, y));
        c = mix(c, zen, smoothstep(0.2, 0.8, y));
        c = mix(c, vec3(1.0, 0.55, 0.25), pow(d, 4.0) * 0.45 * smoothstep(-0.05, 0.3, 0.4 - y));
        // thin streaks of high cloud, lit from below by the low sun
        vec2 cp = vP.xz / max(y + 0.08, 0.05) * 1.4 + vec2(time * 0.004, 0.0);
        float cl = smoothstep(0.55, 0.85, n2(cp * vec2(0.6, 3.0)) * 0.7 + n2(cp * 2.1) * 0.3) * smoothstep(0.02, 0.15, y) * (1.0 - smoothstep(0.4, 0.8, y));
        c = mix(c, mix(vec3(1.0, 0.7, 0.5), vec3(1.0, 0.45, 0.3), 1.0 - d), cl * 0.75);
        c += vec3(1.0,0.75,0.45) * pow(d, 900.0) * 6.0 + vec3(1.0, 0.6, 0.3) * pow(d, 40.0) * 0.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky); return sky;
}

export function buildCanyon(scene, track, opts = {}) {
  const Q = opts.quality ?? 1, r = rng(1849), cfg = track.cfg, N = track.N, step = track.step, E = track.edge;
  const group = new THREE.Group(); scene.add(group);
  const idx = m => Math.max(0, Math.min(N - 1, Math.round(m / step)));
  const time = { value: 0 };
  // spatial hash of the centreline → nearest sample, signed lateral offset
  const CELL = 40, hashT = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(track.px[i] / CELL) + ',' + Math.floor(track.pz[i] / CELL); if (!hashT.has(k)) hashT.set(k, []); hashT.get(k).push(i); }
  // search outward ring by ring and stop one ring after the first hit (cells are 40 m, so that's exact enough)
  const nearRoad = (x, z, R = 160) => {
    let best = 1e18, bi = -1, hitRing = -1; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), n = Math.ceil(R / CELL);
    for (let ring = 0; ring <= n; ring++) {
      for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== ring) continue;
        const L = hashT.get((cx + a) + ',' + (cz + b)); if (L) for (const i of L) { const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
      }
      if (bi >= 0 && hitRing < 0) hitRing = ring;
      if (hitRing >= 0 && ring >= hitRing + 1) break;
    }
    if (bi < 0) return { d: 1e9, i: -1, off: 0, s: -1 };
    return { d: Math.sqrt(best), i: bi, off: (x - track.px[bi]) * track.nx[bi] + (z - track.pz[bi]) * track.nz[bi], s: bi * step };
  };
  const inR = (s, [a, b], pad = 0) => s >= a - pad && s <= b + pad;
  const [cw0, cw1] = cfg.canyonWalls, rav = cfg.ravine, led = cfg.ledge;

  // ---------- terrain ----------
  const ground = (x, z) => {
    let h = fbm(x * 0.004, z * 0.004, 4) * 9 - 3 + Math.sin(x * 0.02 + fbm(x * 0.01, z * 0.01) * 5) * 1.5;   // flats and low dunes
    const q = nearRoad(x, z, 320);
    if (q.i < 0) return h;
    const ry = track.py[q.i], d = q.d, s = q.s;
    // the plateau the canyon and ledge are cut into
    const plat = 34 + fbm(x * 0.01, z * 0.01, 3) * 22;
    let P = 0;
    if (inR(s, [cw0, led[1]], 60)) P = (1 - ss(d, 230, 300)) * ss(s, cw0 - 60, cw0 + 40) * (1 - ss(s, led[1], led[1] + 80));
    h = h * (1 - P) + plat * P;
    // canyon walls: steep, right beside the road
    // (cut all the way from the canyon mouth to the ledge, across the ravine, so the road never runs into the plateau)
    if (inR(s, [cw0, led[0]], 40)) { const w = ss(d, E + 6, E + 22) * ss(s, cw0 - 40, cw0 + 20) * (1 - ss(s, led[0], led[0] + 40)); const k = ss(s, cw0 - 40, cw0) * (1 - ss(s, led[0] + 20, led[0] + 50));
      h = (ry - 0.6) * (1 - w) * k + h * (1 - k + w * k); }
    // ledge: wall on the left, a sheer drop to the dry riverbed on the right
    if (inR(s, led, 30)) {
      const k = ss(s, led[0] - 30, led[0] + 30) * (1 - ss(s, led[1] - 30, led[1] + 30));
      if (q.off > 0) { const drop = ss(d, E + 4, E + 16); h = h * (1 - k) + ((ry - 0.6) * (1 - drop) + (-14 + fbm(x * 0.03, z * 0.03, 2) * 3) * drop) * k; }
      else h = Math.max(h, ry + ss(d, E + 8, E + 24) * 30 * k);
    }
    // the ravine across the road under the jump
    if (inR(s, rav, 20)) { const k = ss(s, rav[0] - 20, rav[0] + 10) * (1 - ss(s, rav[1] - 10, rav[1] + 20)) * (1 - ss(d, 250, 300)); h = h * (1 - k) + (-38 + fbm(x * 0.05, z * 0.05, 2) * 6) * k;
      if (d < E + 6 && !inR(s, cfg.gaps[0], 2)) h = Math.min(h, ry - 0.6);   // the ramp and landing decks stay clear
      return h; }
    // the road always sits on the ground
    if (d < E + 40 && !inR(s, rav, 0)) { if (!inR(s, [cw0 - 40, led[1] + 30], 0)) { const k = ss(d, E + 1, E + 40); h = (ry - 0.6) * (1 - k) + h * k; } else if (d < E + 6) h = ry - 0.6; }
    return h;
  };
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, track.px[i]); maxx = Math.max(maxx, track.px[i]); minz = Math.min(minz, track.pz[i]); maxz = Math.max(maxz, track.pz[i]); }
  const PAD = 450, W = maxx - minx + 2 * PAD, D = maxz - minz + 2 * PAD, res = 9 / Math.min(1, Q + 0.3);
  // a fine patch over the canyon, ravine and ledge (steep walls right beside the road need small triangles)
  let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9;
  for (let i = idx(cw0 - 80); i <= idx(led[1] + 60); i++) { fx0 = Math.min(fx0, track.px[i]); fx1 = Math.max(fx1, track.px[i]); fz0 = Math.min(fz0, track.pz[i]); fz1 = Math.max(fz1, track.pz[i]); }
  fx0 -= 80; fx1 += 80; fz0 -= 80; fz1 += 80;
  const inFine = (x, z, m = 0) => x > fx0 + m && x < fx1 - m && z > fz0 + m && z < fz1 - m;
  const grid = (cx, cz, w, d, r0, heightFn) => {
    const g = new THREE.PlaneGeometry(w, d, Math.round(w / r0), Math.round(d / r0)); g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, heightFn(p.getX(k), p.getZ(k))); g.computeVertexNormals();
    const nrm = g.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), steep = ss(1 - nrm.getY(k), 0.08, 0.3);
      strata(col, y, x, z, Math.max(steep, ss(y, 8, 20)));
      if (y < -9) col.lerp(new THREE.Color(0xcfae86), 0.6 * (1 - steep));   // pale dry riverbed / ravine floor
      col.multiplyScalar(0.92 + fbm(x * 0.08, z * 0.08, 2) * 0.16); c.set([col.r, col.g, col.b], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.receiveShadow = true; group.add(m);
    return g;
  };
  const fine = grid((fx0 + fx1) / 2, (fz0 + fz1) / 2, fx1 - fx0, fz1 - fz0, 4 / Math.min(1, Q + 0.5), ground);
  // the coarse terrain everywhere else; tucked well under the fine patch inside it
  const tg = grid((minx + maxx) / 2, (minz + maxz) / 2, W, D, res, (x, z) => {
    if (inFine(x, z, res + 1)) return -20;   // hidden under the fine patch: don't bother computing it
    const ex = Math.min(x - minx + PAD, maxx + PAD - x, z - minz + PAD, maxz + PAD - z);
    return ground(x, z) * ss(ex, 0, 150) - 0.5 * (1 - ss(ex, 0, 150));
  });
  const sampler = (g, x0, z0, w, d) => { const GX = g.parameters.widthSegments, GZ = g.parameters.heightSegments, p = g.attributes.position;
    return (x, z) => { const fx = THREE.MathUtils.clamp((x - x0) / w * GX, 0, GX - 1e-4), fz = THREE.MathUtils.clamp((z - z0) / d * GZ, 0, GZ - 1e-4), ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, H = (a, b) => p.getY(b * (GX + 1) + a);
      return H(ix, iz) * (1 - u) * (1 - v) + H(ix + 1, iz) * u * (1 - v) + H(ix, iz + 1) * (1 - u) * v + H(ix + 1, iz + 1) * u * v; }; };
  const hFine = sampler(fine, fx0, fz0, fx1 - fx0, fz1 - fz0), hCoarse = sampler(tg, (minx + maxx) / 2 - W / 2, (minz + maxz) / 2 - D / 2, W, D);
  // height of the ground you actually see, for placing things on it
  const hAt = (x, z) => (inFine(x, z) ? hFine(x, z) : hCoarse(x, z));
  const slopeAt = (x, z) => Math.max(Math.abs(hAt(x + 5, z) - hAt(x - 5, z)), Math.abs(hAt(x, z + 5) - hAt(x, z - 5))) / 10;
  // endless sand beyond
  const flat = new THREE.Mesh(new THREE.RingGeometry(Math.hypot(W, D) * 0.45, 5000, 64, 1), new THREE.MeshLambertMaterial({ color: 0xc89060 }));
  flat.rotation.x = -Math.PI / 2; flat.position.set((minx + maxx) / 2, -0.6, (minz + maxz) / 2); group.add(flat);
  const flat2 = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, D + 400), flat.material); flat2.rotation.x = -Math.PI / 2; flat2.position.set((minx + maxx) / 2, -0.7, (minz + maxz) / 2); group.add(flat2);

  const m4 = new THREE.Matrix4();
  const inst = (geo, mat, list, setter, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length; list.forEach((it, k) => { setter(m4, it, k); im.setMatrixAt(k, m4); }); im.castShadow = shadow; im.receiveShadow = true; group.add(im); return im; };
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  const vcFlat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const far = (x, z, m) => nearRoad(x, z, m + CELL).d >= m;
  const rand = (pad = 0) => [minx - pad + r() * (maxx - minx + 2 * pad), minz - pad + r() * (maxz - minz + 2 * pad)];

  // ---------- mesas and buttes on the horizon ----------
  const mesaGeo = (() => { const g = lumpy(new THREE.CylinderGeometry(1, 1.25, 1, 18, 8).translate(0, 0.5, 0), 0.22, 2.5, 4); const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let k = 0; k < p.count; k++) { const y = p.getY(k); strata(col, y * 60, p.getX(k) * 50, p.getZ(k) * 50, y > 0.98 ? 0.3 : 1); c.set([col.r, col.g, col.b], k * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; })();
  const mesas = [];
  for (let t = 0; t < 400 && mesas.length < 40; t++) { const a = r() * Math.PI * 2, R = 900 + r() * 1500, cx = (minx + maxx) / 2 + Math.cos(a) * R, cz = (minz + maxz) / 2 + Math.sin(a) * R; if (!far(cx, cz, 350)) continue; const w = 40 + r() * 160; mesas.push([cx, cz, w, w * (0.4 + r() * 0.5), 40 + r() * 110]); }
  inst(mesaGeo, vcFlat, mesas, (m, [x, z, w, d2, h]) => m.copy(TRS(x, -2, z, 0, r() * 6, 0, w, h, d2)), false);

  // ---------- saguaros, barrel cacti, dead trees, boulders ----------
  const saguaro = (() => { const P = [], G = 0x587a3c;
    P.push(part(new THREE.CylinderGeometry(0.32, 0.38, 1, 10).translate(0, 0.5, 0), G, null, r), part(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), G, TRS(0, 1, 0), r));
    for (const [sd, y, h] of [[-1, 0.42, 0.28], [1, 0.55, 0.22]]) { P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8).rotateZ(Math.PI / 2), G, TRS(sd * 0.42, y, 0), r)); P.push(part(new THREE.CylinderGeometry(0.2, 0.22, h, 8).translate(0, h / 2, 0), G, TRS(sd * 0.58, y, 0), r)); P.push(part(new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), G, TRS(sd * 0.58, y + h, 0), r)); }
    return mergeGeometries(P); })();
  const deadTree = (() => { const P = [part(new THREE.CylinderGeometry(0.05, 0.1, 1, 6).translate(0, 0.5, 0), 0x6a5240, null, r)];
    for (let k = 0; k < 5; k++) P.push(part(new THREE.CylinderGeometry(0.015, 0.04, 0.6, 5).translate(0, 0.3, 0), 0x6a5240, TRS(0, 0.5 + r() * 0.4, 0, 0.6 + r() * 0.5, r() * 6, 0), r));
    return mergeGeometries(P); })();
  const boulder = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.6, 1.2, 7);
  { const p = boulder.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color(); for (let k = 0; k < p.count; k++) { col.copy(ROCK2).lerp(DARK, fbm(p.getX(k) * 3, p.getZ(k) * 3 + p.getY(k), 2) * 0.6); c.set([col.r, col.g, col.b], k * 3); } boulder.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const sag = [], dead = [], rocks = [], brush = [];
  const flatAt = (x, z) => (slopeAt(x, z) < 0.25 ? hAt(x, z) : null);
  for (let t = 0; t < 6000 && sag.length < 420 * Q + 40; t++) { const i = Math.floor(r() * N), sd = r() < 0.5 ? -1 : 1, off = sd * (E + 5 + Math.pow(r(), 1.5) * 160), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
    if (!far(x, z, E + 4)) continue; const y = flatAt(x, z); if (y === null) continue; sag.push([x, y, z, 4 + r() * 7, r() * 6]); }
  for (let t = 0; t < 3000 && dead.length < 120 * Q + 10; t++) { const [x, z] = rand(200); if (!far(x, z, E + 6)) continue; const y = flatAt(x, z); if (y === null) continue; dead.push([x, y, z, 3 + r() * 4, r() * 6]); }
  for (let t = 0; t < 6000 && rocks.length < 500 * Q + 50; t++) { const [x, z] = rand(200); if (!far(x, z, E + 5)) continue; const y = flatAt(x, z); if (y === null) continue; rocks.push([x, y, z, 0.6 + Math.pow(r(), 3) * 7, r() * 6]); }
  for (let t = 0; t < 8000 && brush.length < 1400 * Q + 100; t++) { const i = Math.floor(r() * N), sd = r() < 0.5 ? -1 : 1, off = sd * (E + 3 + r() * 90), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
    if (!far(x, z, E + 2.5)) continue; const y = flatAt(x, z); if (y === null) continue; brush.push([x, y, z, 0.5 + r() * 0.9, r() * 6]); }
  const up = (m, [x, y, z, s, a]) => m.copy(TRS(x, y - 0.15, z, 0, a, 0, s, s, s));
  inst(saguaro, vc, sag, (m, [x, y, z, s, a]) => m.copy(TRS(x, y - 0.15, z, 0, a, 0, s * 0.5, s, s * 0.5)));
  inst(deadTree, vc, dead, up);
  inst(boulder, vcFlat, rocks, (m, [x, y, z, s, a]) => m.copy(TRS(x, y + s * 0.2, z, a * 0.3, a, 0, s, s * 0.7, s)));
  inst(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.5, 3, 2), new THREE.MeshLambertMaterial({ color: 0x8a8a4a, flatShading: true }), brush, (m, [x, y, z, s, a]) => m.copy(TRS(x, y + s * 0.3, z, 0, a, 0, s, s * 0.6, s)), false);

  // ---------- gas station at the start ----------
  {
    const i = idx(cfg.ctrl ? 40 : 40), side = -1, off = side * (E + 18), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off, yaw = Math.atan2(track.tx[i], track.tz[i]);
    const G = new THREE.Group(); G.position.set(x, track.py[i] - 0.3, z); G.rotation.y = yaw; group.add(G);
    const box = (w, h, d, c, px, py, pz, mat) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || new THREE.MeshLambertMaterial({ color: c })); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; G.add(o); return o; };
    box(26, 0.3, 22, 0x8a8478, 0, 0.15, 0);                                     // forecourt
    box(10, 5, 9, 0xe8dcc6, -8, 2.5, -2); box(10.4, 0.5, 9.4, 0xb03a2a, -8, 5.2, -2);   // shop, red trim
    box(1.6, 2.4, 0.15, 0x3a5a6a, -8, 1.4, 2.6); box(5, 1.8, 0.15, 0x6a8aa0, -10.5, 2.6, 2.6);   // door, window
    box(13, 0.6, 9, 0xf2f0ea, 4, 5.4, 0); box(13.2, 0.25, 9.2, 0xb03a2a, 4, 5.0, 0);   // canopy
    for (const [px, pz] of [[-1.5, -3.5], [9.5, -3.5], [-1.5, 3.5], [9.5, 3.5]]) box(0.4, 5, 0.4, 0xd8d0c0, px, 2.6, pz);
    for (const px of [1.5, 6.5]) { box(1, 1.8, 0.7, 0xb03a2a, px, 1.2, 0); box(0.8, 0.5, 0.75, 0xf2f0ea, px, 1.6, 0); }
    // tall sign with a glowing panel
    box(0.5, 12, 0.5, 0x5a5a5a, 13, 6, 6);
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 128; const g = sc.getContext('2d');
    g.fillStyle = '#b03a2a'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#ffe8b0'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.fillText('加 油', 128, 70); g.font = 'bold 22px sans-serif'; g.fillText('LAST GAS · 120 KM', 128, 108);
    const tex = new THREE.CanvasTexture(sc); tex.colorSpace = THREE.SRGBColorSpace;
    box(6, 3, 0.4, 0xffffff, 13, 12.5, 6, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
    // an old pickup and some barrels
    box(2, 1.2, 4.6, 0x4a7a8a, -14, 1.0, 6); box(1.9, 1, 2, 0x4a7a8a, -14, 2.0, 5);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 12), new THREE.MeshLambertMaterial({ color: [0x8a3a2a, 0x3a5a7a, 0x8a7a3a][k % 3] })); b.position.set(-3 + k * 1.0, 0.9, -9); b.castShadow = true; G.add(b); }
  }

  // ---------- wooden fences and old road signs along the open highway ----------
  { const posts = [], rails = [];
    const fenceRuns = [[60, cw0 - 80], [led[1] + 300, track.length - 80]];
    for (const [a, b] of fenceRuns) for (let s = a; s < b; s += 6) for (const sd of [-1, 1]) { if (hash2(s, sd) < 0.12) continue; const i = idx(s), off = sd * (E + 9), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off; posts.push([x, hAt(x, z), z, s * 0.7]); }
    inst(new THREE.BoxGeometry(0.18, 1.4, 0.18).translate(0, 0.7, 0), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), posts, (m, [x, y, z, a]) => m.copy(TRS(x, y, z, 0.05 * Math.sin(a), a, 0)));
    for (let k = 1; k < posts.length; k++) { const [x0, y0, z0] = posts[k - 1], [x1, y1, z1] = posts[k]; if (Math.hypot(x1 - x0, z1 - z0) > 14) continue; for (const h of [0.6, 1.15]) rails.push(x0, y0 + h, z0, x1, y1 + h, z1); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(rails, 3)); group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a3e28 })));
    const signs = []; for (const s of [400, 700, cw0 - 120, led[1] + 400, 3900, 4800, 5600]) { const i = idx(s), off = E + 4, x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off; signs.push([x, hAt(x, z), z, Math.atan2(track.tx[i], track.tz[i])]); }
    inst(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: 0x8a8a8a }), signs, (m, [x, y, z, a]) => m.copy(TRS(x, y, z, 0, a, 0)));
    inst(new THREE.BoxGeometry(1.3, 1.3, 0.06), new THREE.MeshLambertMaterial({ color: 0xe8b830 }), signs, (m, [x, y, z, a]) => m.copy(TRS(x, y + 2.6, z, 0, a + Math.PI, Math.PI / 4)));
  }

  // ---------- the natural stone arch over the road ----------
  {
    const i = idx(cfg.arch), yaw = Math.atan2(track.tx[i], track.tz[i]), R = E + 10;
    const g = lumpy(new THREE.TorusGeometry(R, 5, 12, 40, Math.PI), 0.35, 0.12, 3);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let k = 0; k < p.count; k++) { strata(col, p.getY(k) * 1.4, p.getX(k), p.getZ(k), 1); c.set([col.r, col.g, col.b], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const arch = new THREE.Mesh(g, vcFlat); arch.position.set(track.px[i], track.py[i] - 3, track.pz[i]); arch.rotation.y = yaw; arch.scale.set(1, 1.35, 1.3); arch.castShadow = arch.receiveShadow = true; group.add(arch);
    for (const sd of [-1, 1]) { const foot = new THREE.Mesh(boulder, vcFlat); foot.position.set(track.px[i] + track.nx[i] * sd * (R + 2), track.py[i], track.pz[i] + track.nz[i] * sd * (R + 2)); foot.scale.set(9, 6, 9); group.add(foot); }
  }

  // ---------- tumbleweeds rolling across the road, vultures circling over the canyon ----------
  const twGeo = (() => { const pts = []; const rr = rng(5); for (let k = 0; k < 90; k++) { const a = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize(), b = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize(); pts.push(a.x, a.y, a.z, b.x * 0.9, b.y * 0.9, b.z * 0.9); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g; })();
  const tumble = []; for (let k = 0; k < 5; k++) { const tw = new THREE.LineSegments(twGeo, new THREE.LineBasicMaterial({ color: 0x9a7a4a })); tw.scale.setScalar(0.9 + r() * 0.5); group.add(tw); tumble.push({ o: tw, s: -1, t: 0 }); }
  const birdGeo = new THREE.BufferGeometry(); birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.6, -2.2, 0.2, -0.3, 0, 0, -0.5, 0, 0, 0.6, 0, 0, -0.5, 2.2, 0.2, -0.3], 3)); birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a1a18, side: THREE.DoubleSide });
  birdMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += abs(position.x) * sin(time * 2.0 + instanceMatrix[3].x) * 0.25;'); };
  const flocks = []; for (const s of [(cw0 + cw1) / 2, (led[0] + led[1]) / 2, 3300, 4800]) { const i = idx(s); flocks.push([track.px[i], track.py[i] + 60 + r() * 30, track.pz[i], 40 + r() * 30]); }
  const birdData = []; for (let k = 0; k < flocks.length * 3; k++) birdData.push([k % flocks.length, r() * 6.28, (r() - 0.5) * 12, (r() - 0.5) * 20]);
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, birdData.length); group.add(birds);

  const q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), sc4 = new THREE.Vector3(1.4, 1.4, 1.4);
  function update(t, dt, car) {
    time.value = t;
    birdData.forEach(([fi, ph, dy, dr], k) => { const [x, y, z, R] = flocks[fi], a = ph + t * 0.15; e4.set(0, -a, -0.35); q4.setFromEuler(e4); m4.compose(v4.set(x + Math.cos(a) * (R + dr), y + dy, z + Math.sin(a) * (R + dr)), q4, sc4); birds.setMatrixAt(k, m4); });
    birds.instanceMatrix.needsUpdate = true;
    // tumbleweeds: start a little ahead of the car beside the road, roll across it with the wind
    if (car && car.trackI != null) for (const w of tumble) {
      if (w.s < 0 || w.t > 9) { const i = (car.trackI + Math.round((60 + Math.random() * 160) / step)) % N, sd = Math.random() < 0.5 ? -1 : 1;
        if (inR(i * step, [cw0, led[1]], 150) || inR(i * step, [cfg.arch - 60, cfg.arch + 60], 0)) { w.o.visible = false; w.s = -1; continue; }
        w.o.visible = true;
        w.s = i; w.t = 0; w.sd = sd; w.v = 4 + Math.random() * 4; w.x0 = track.px[i] - track.nx[i] * sd * 30; w.z0 = track.pz[i] - track.nz[i] * sd * 30; }
      w.t += dt; const i = w.s, d = w.t * w.v, x = w.x0 + track.nx[i] * w.sd * d, z = w.z0 + track.nz[i] * w.sd * d;
      const onRoad = Math.abs((x - track.px[i]) * track.nx[i] + (z - track.pz[i]) * track.nz[i]) < E + 1, gy = onRoad ? track.py[i] : hAt(x, z);
      w.o.position.set(x, gy + w.o.scale.x * (1 + Math.abs(Math.sin(w.t * 2.5)) * 0.25), z); w.o.rotation.x += w.v * dt * w.sd * 0.8; w.o.rotation.z += dt * 0.7;
    }
  }
  return { update, ground };
}
