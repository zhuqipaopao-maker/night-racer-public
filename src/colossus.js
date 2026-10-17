import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { radialTexture, forestDirt, DIRT_GLSL } from './textures.js';

// 巨像遗迹 · 苔藓古林 — one lap through a mossy old-growth forest (after the user's reference photos of Białowieża and
// Washington's cedar groves): crowded slender trunks fading into green haze, a bright fresh leaf canopy with light
// falling through, a dark forest floor carpeted in moss and low plants, puddles reflecting the sky, mossy fallen logs.
// The Tripo props (models/forest.glb: fallen log, giant cedar stump, broadleaf tree, mossy boulder, fern) dress the
// road edges; everything that is needed by the thousand (trunks, leaves, ground cover, puddles, light shafts) is built
// here so it stays cheap.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += vnoise(x * f, z * f) * a; f *= 2.03; a *= 0.5; } return s; };
const ss = THREE.MathUtils.smoothstep;
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), E3 = new THREE.Euler();
const mat = (x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => M4.compose(V.set(x, y, z), Q.setFromEuler(E3.set(rx, ry, rz, 'YXZ')), S3.set(sx, sy, sz));

// a canvas full of leaves, for the canopy and the undergrowth cards (alpha-tested)
function leafTexture(seed, palette, count, size) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = rng(seed);
  for (let k = 0; k < count; k++) {
    const rr = Math.sqrt(r()) * 112, th = r() * Math.PI * 2; if (r() > 1.15 - rr / 112) continue;   // round, sparse at the rim
    const x = 128 + Math.cos(th) * rr, y = 128 + Math.sin(th) * rr, a = r() * Math.PI * 2, l = size * (0.6 + r() * 0.8);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -l * 0.35, l, 0); g.quadraticCurveTo(l * 0.5, l * 0.35, 0, 0); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildColossus(scene, track, opts = {}) {
  const Q1 = opts.quality ?? 1, r = rng(4242), cfg = track.cfg, N = track.N, step = track.step, E = track.edge;
  const group = new THREE.Group(); scene.add(group);
  const idx = m => ((Math.round(m / step) % N) + N) % N;
  const time = { value: 0 };
  const span = name => { const k = cfg.zones.findIndex(z => z[0] === name); return [cfg.zones[k][1], cfg.zones[k + 1] ? cfg.zones[k + 1][1] : track.length]; };
  const inR = (s, [a, b], pad = 0) => s >= a - pad && s <= b + pad;
  const river = span('river'), climb = [span('climb')[0], span('steps')[1]];
  // spatial hash of the centreline → nearest sample, signed lateral offset
  const CELL = 40, hashT = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(track.px[i] / CELL) + ',' + Math.floor(track.pz[i] / CELL); if (!hashT.has(k)) hashT.set(k, []); hashT.get(k).push(i); }
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
  const side = (s, off) => { const i = idx(s); return [track.px[i] + track.nx[i] * off, track.pz[i] + track.nz[i] * off, Math.atan2(track.tx[i], track.tz[i]), i]; };

  // ---------- terrain: gentle forest floor; the river valley; the hillside up to the temple ----------
  let lastQ = null;
  const ground = (x, z) => {
    let h = fbm(x * 0.006, z * 0.006, 4) * 8 - 2 + fbm(x * 0.05, z * 0.05, 2) * 0.8;
    const q = lastQ = nearRoad(x, z, 320);
    if (q.i < 0) return h;
    const ry = track.py[q.i], d = q.d, s = q.s;
    // the river: a valley across the road under the bridge, then winding away on both sides
    if (inR(s, river, 120)) { const k = ss(s, river[0] - 120, river[0] + 60) * (1 - ss(s, river[1] - 60, river[1] + 120)) * (1 - ss(d, 140, 260));
      h = h * (1 - k) + (-13 + fbm(x * 0.03, z * 0.03, 2) * 2) * k; }
    // the hill the temple stands on: the ground rises with the road and keeps going up away from it
    if (inR(s, climb, 80)) { const k = ss(s, climb[0] - 80, climb[0] + 60) * (1 - ss(s, climb[1] - 60, climb[1] + 80)); h = h * (1 - k) + Math.max(h, ry - 1 + Math.max(0, d - E - 10) * 0.25) * k; }
    // elevated stretches (the arm, the bridge) stand above the ground; elsewhere the road sits on it
    const raised = ry > 3 && !inR(s, climb, 0);
    if (!raised && !inR(s, river, 0) && d < E + 60) { const k = ss(d, E + 5, E + 60); h = (ry - 0.6) * (1 - k) + h * k; }   // under the verge ribbon
    if (raised && d < E + 4) h = Math.min(h, 0);
    return h;
  };
  const SOIL = new THREE.Color(0x3c3a1e), LITTER = new THREE.Color(0x5a4a28), MOSS = new THREE.Color(0x46661e), MOSS2 = new THREE.Color(0x6a8e2a), MUD = new THREE.Color(0x46661e);
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, track.px[i]); maxx = Math.max(maxx, track.px[i]); minz = Math.min(minz, track.pz[i]); maxz = Math.max(maxz, track.pz[i]); }
  const PAD = 420, W = maxx - minx + 2 * PAD, D = maxz - minz + 2 * PAD, res = 6 / Math.min(1, Q1 + 0.3);
  const tg = new THREE.PlaneGeometry(W, D, Math.round(W / res), Math.round(D / res)); tg.rotateX(-Math.PI / 2); tg.translate((minx + maxx) / 2, 0, (minz + maxz) / 2);
  { const p = tg.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k), y = ground(x, z); p.setY(k, y);
      const m = fbm(x * 0.07, z * 0.07, 3) * 0.7 + fbm(x * 0.4, z * 0.4, 2) * 0.3, lit = fbm(x * 0.15 + 9, z * 0.15, 2);
      col.copy(SOIL).lerp(LITTER, ss(lit, 0.45, 0.7) * 0.8).lerp(MOSS, ss(m, 0.45, 0.62)).lerp(MOSS2, ss(m, 0.66, 0.8) * 0.6);
      if (lastQ.d < E + 3) col.lerp(MUD, 0.7);   // trodden mud along the road edge
      if (y < -10) col.lerp(new THREE.Color(0x3a3a2a), 0.6);   // riverbed
      c.set([col.r, col.g, col.b], k * 3);
    }
    tg.computeVertexNormals(); tg.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const gm = new THREE.MeshLambertMaterial({ vertexColors: true }), gdirt = forestDirt();
  // the forest floor is mottled and bumpy with the same soil photo as the road, instead of a flat colour
  gm.onBeforeCompile = sh => {
    sh.uniforms.uDirt = { value: gdirt.diff }; sh.uniforms.uDirtN = { value: gdirt.nor };
    sh.vertexShader = 'varying vec3 vWorldP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWorldP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWorldP;\n' + DIRT_GLSL + '\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= (0.6 + 2.3 * dot(dirtAlbedo(vWorldP.xz * 1.9), vec3(0.3333))) * (0.8 + 0.5 * dn(vWorldP.xz * 0.11)) * vec3(1.14, 1.08, 0.86);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 d = dirtNormalW(vWorldP.xz * 1.9); normal = normalize(normal + (viewMatrix * vec4(d, 0.0)).xyz * 0.9); }`);
  };
  const groundMesh = new THREE.Mesh(tg, gm); groundMesh.receiveShadow = true; group.add(groundMesh);
  const GX = tg.parameters.widthSegments, GZ = tg.parameters.heightSegments, tp = tg.attributes.position, x0 = (minx + maxx) / 2 - W / 2, z0 = (minz + maxz) / 2 - D / 2;
  const hAt = (x, z) => { const fx = THREE.MathUtils.clamp((x - x0) / W * GX, 0, GX - 1e-4), fz = THREE.MathUtils.clamp((z - z0) / D * GZ, 0, GZ - 1e-4), ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, H = (a, b) => tp.getY(b * (GX + 1) + a);
    // the mesh splits each cell along the (ix,iz+1)-(ix+1,iz) diagonal, so interpolate on the same two triangles (bilinear floats up to ~0.3 m off the surface)
    return u + v <= 1 ? H(ix, iz) + u * (H(ix + 1, iz) - H(ix, iz)) + v * (H(ix, iz + 1) - H(ix, iz)) : H(ix + 1, iz + 1) + (1 - u) * (H(ix, iz + 1) - H(ix + 1, iz + 1)) + (1 - v) * (H(ix + 1, iz) - H(ix + 1, iz + 1)); };
  const far = (x, z, m) => nearRoad(x, z, m + CELL).d >= m;
  // height of the verge at distance o from the road centre: a low bank just off the edge easing into the terrain
  const vergeY = (x, z, i, o) => { o -= E; if (o > 15) return hAt(x, z); const ry = track.py[i], n2 = fbm(x * 0.25, z * 0.25, 2), bank = ry - 0.05 + ss(o, -0.2, 2.2) * (0.25 + n2 * 0.35), k = ss(o, 3, 15); return bank * (1 - k) + (hAt(x, z) + (0.6 + fbm(x * 0.08, z * 0.08, 2) * 0.5) * (1 - ss(o, 5, 15))) * k; };   // lands exactly on the terrain at the ribbon's outer edge
  // lowest ground under a log lying along heading a (so a long log never hangs over a dip), sunk by a fraction of its thickness
  const logY = (x, z, a, len, thick, off, ti) => { let y = 1e9; for (let t = -0.5; t <= 0.5; t += 0.125) { const px = x + Math.sin(a) * len * t, pz = z + Math.cos(a) * len * t; y = Math.min(y, off === undefined ? hAt(px, pz) : vergeY(px, pz, ti, off + Math.abs(t) * 0)); } return y - thick * 0.12; };
  const rand = pad => [minx - pad + r() * (maxx - minx + 2 * pad), minz - pad + r() * (maxz - minz + 2 * pad)];
  // clearings round the colossus landmarks: no trees or boulders grow where the stone stands
  const CLEAR = [[80, 0, 0, 36], [2370, -1, 38, 52], [2490, -1, 38, 52], [3200, 0, 0, 36], [3420, -1, 26, 30], [5420, 1, 30, 36]].map(([s0, sd, off, rad]) => { const [x, z] = side(s0, sd * off); return [x, z, rad]; });
  const cleared = (x, z) => CLEAR.some(([cx, cz, rad]) => (x - cx) ** 2 + (z - cz) ** 2 < rad * rad);
  const roadside = (n, dmin, dmax, tries = 8, zone = [0, track.length]) => { const out = []; for (let t = 0; t < n * tries && out.length < n; t++) {
    const s = zone[0] + r() * (zone[1] - zone[0]), [x, z] = side(s, (r() < 0.5 ? -1 : 1) * (dmin + Math.pow(r(), 1.3) * (dmax - dmin)));
    if (!far(x, z, dmin - 1) || cleared(x, z)) continue; const ii = idx(s); out.push([x, vergeY(x, z, ii, Math.hypot(x - track.px[ii], z - track.pz[ii])), z, s]); } return out; };
  // one instanced mesh per 300 m cell, so whole cells behind or beside the camera are culled
  const cells = (geo, material, list, setter, shadow = false) => {
    const by = new Map(); for (const it of list) { const k = Math.floor(it[0] / 300) + ',' + Math.floor(it[2] / 300); if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
    for (const items of by.values()) { const im = new THREE.InstancedMesh(geo, material, items.length); items.forEach((it, k) => im.setMatrixAt(k, setter(it))); im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; group.add(im); }
  };

  // ---------- the verge: a fine ribbon either side of the road, so the track sits *in* the forest floor: the dirt of the
  // road edge runs out into moss, then a low bank (the road looks worn into the ground) easing into the terrain ----------
  {
    const OFF = [-1.6, -0.9, -0.3, 0.2, 0.6, 1.0, 1.5, 2.1, 2.9, 3.9, 5.2, 7, 9.5, 12.5, 16];   // metres outside the road edge
    const pos = [], col = [], idxs = [], c = new THREE.Color(), dirtC = new THREE.Color(0x585858), dampC = new THREE.Color(0x484848);
    const raisedR = i => track.py[i] - hAt(track.px[i], track.pz[i]) > 2.5 || inR(i * step, river, 10);
    for (const sd of [-1, 1]) {
      let run = [];
      const flush = () => { if (run.length > 1) { const cols = OFF.length;
          for (let r0 = 0; r0 < run.length - 1; r0++) for (let k = 0; k < cols - 1; k++) { const a0 = run[r0] + k, b0 = run[r0 + 1] + k; sd > 0 ? idxs.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1) : idxs.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); } }
        run = []; };
      for (let i = 0; i <= N; i++) {
        const j = i % N; if (raisedR(j)) { flush(); continue; }
        run.push(pos.length / 3);
        for (const o of OFF) {
          const x = track.px[j] + track.nx[j] * sd * (E + o), z = track.pz[j] + track.nz[j] * sd * (E + o);
          pos.push(x, o < 0 ? track.py[j] - 0.06 : vergeY(x, z, j, E + o), z);
          const n2 = fbm(x * 0.25, z * 0.25, 2), m = fbm(x * 0.09 + 4, z * 0.09, 3);
          c.copy(o < 0.4 ? dirtC : dampC).lerp(MOSS, ss(o, 0.0 + n2 * 0.5, 1.0 + n2 * 0.8)).lerp(MOSS2, ss(m, 0.55, 0.8) * ss(o, 1, 3) * 0.7).lerp(LITTER, ss(fbm(x * 0.2, z * 0.2 + 9, 2), 0.5, 0.75) * 0.8);
          c.multiplyScalar(0.85 + fbm(x * 0.6, z * 0.6, 2) * 0.3); col.push(c.r, c.g, c.b);
        }
      }
      flush();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idxs); g.computeVertexNormals();
    { const uv = new Float32Array(pos.length / 3 * 2); for (let k = 0; k < pos.length / 3; k++) { uv[k * 2] = pos[k * 3] * 0.33; uv[k * 2 + 1] = pos[k * 3 + 2] * 0.33; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
    const grassTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const gg = c.getContext('2d'), rr = rng(81);
      gg.fillStyle = '#8a9a70'; gg.fillRect(0, 0, 512, 512);
      for (let k = 0; k < 16000; k++) { const x = rr() * 512, y = rr() * 512, l = 5 + rr() * 16, a = -Math.PI / 2 + (rr() - 0.5) * 1.2, v = 0.7 + rr() * 0.6;
        gg.strokeStyle = `rgba(${Math.round(150 * v)},${Math.round(175 * v)},${Math.round(110 * v)},0.85)`; gg.lineWidth = 1 + rr();
        for (const dx of [0, -512, 512]) for (const dy of [0, -512, 512]) { gg.beginPath(); gg.moveTo(x + dx, y + dy); gg.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); gg.stroke(); } }
      for (let k = 0; k < 220; k++) { gg.fillStyle = 'rgba(255,255,240,0.9)'; const x = rr() * 512, y = rr() * 512; gg.beginPath(); gg.arc(x, y, 1.4, 0, 7); gg.fill(); }   // tiny white flowers
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const vm = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    // the soil photo shared with the road wherever the verge is dirt (the road's worn edge shows it), the grass blade
    // texture where it is green, with the same detail normals on the dirt
    const dirt = forestDirt();
    vm.onBeforeCompile = sh => {
      sh.uniforms.uDirt = { value: dirt.diff }; sh.uniforms.uDirtN = { value: dirt.nor };
      sh.vertexShader = 'varying vec3 vWorldP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWorldP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWorldP; float vergeGreen;\n' + DIRT_GLSL + '\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#ifdef USE_MAP
            vec4 gT = texture2D(map, vMapUv); vergeGreen = smoothstep(0.0, 0.06, vColor.g - vColor.r);
            float big = dn(vWorldP.xz * 0.045) * 0.6 + dn(vWorldP.xz * 0.17) * 0.4;
            vec3 soil = dirtAlbedo(vWorldP.xz) * vec3(1.42, 1.24, 1.0) * mix(0.7, 1.1, big) * 0.78;
            diffuseColor.rgb = mix(soil, mix(gT.rgb * 1.5, vec3(1.0), 0.35) * vColor.rgb * (0.6 + 2.3 * dot(dirtAlbedo(vWorldP.xz * 1.9), vec3(0.3333))) * (0.8 + 0.5 * dn(vWorldP.xz * 0.11)) * vec3(1.14, 1.08, 0.86), vergeGreen);
          #endif`)
        .replace('#include <color_fragment>', '')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec3 d = dirtNormalW(vWorldP.xz); vec3 dv = (viewMatrix * vec4(d, 0.0)).xyz; normal = normalize(normal + dv * (1.0 - vergeGreen) * 1.1); }`);
    };
    const verge = new THREE.Mesh(g, vm); verge.receiveShadow = true; group.add(verge);
  }

  // ---------- puddles in the wheel ruts, mirroring the sky ----------
  { const g = new THREE.CircleGeometry(1, 24); g.rotateX(-Math.PI / 2);
    { const p = g.attributes.position; for (let k = 1; k < p.count; k++) { const a = Math.atan2(p.getZ(k), p.getX(k)), f = 0.8 + 0.35 * vnoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2); p.setX(k, p.getX(k) * f); p.setZ(k, p.getZ(k) * f); } }
    // muddy water: dark looking down into it, the sky's reflection growing toward grazing angles (Fresnel), like the reference
    const pm = new THREE.MeshPhysicalMaterial({ color: 0x4a3e2c, roughness: 0.03, metalness: 0, ior: 1.33, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.78, polygonOffset: true, polygonOffsetFactor: -4 });
    const list = [];
    for (let s = 60; s < track.length; s += 30 + r() * 90) { if (inR(s, river, 40) || inR(s, cfg.walls ? cfg.walls[1] : [0, 0], 20)) continue; const i = idx(s), rut = (r() < 0.5 ? -1 : 1) * E * 0.4;
      list.push([track.px[i] + track.nx[i] * rut, track.py[i] + 0.035, track.pz[i] + track.nz[i] * rut, Math.atan2(track.tx[i], track.tz[i]), 0.4 + r() * 0.35, 0.9 + r() * 1.2]); }
    cells(g, pm, list, ([x, y, z, a, w, l]) => mat(x, y, z, a, w, 1, l)); }

  // ---------- the river water ----------
  { const [x, z] = side((river[0] + river[1]) / 2, 0);
    const water = new THREE.Mesh(new THREE.CircleGeometry(240, 48), new THREE.MeshStandardMaterial({ color: 0x24301e, roughness: 0.04, metalness: 0.7, envMapIntensity: 1.4 }));
    water.rotation.x = -Math.PI / 2; water.position.set(x, -10.5, z); group.add(water); }

  // ---------- puddles: dark mirrors in the low spots of the forest floor ----------
  { const pud = new THREE.MeshStandardMaterial({ color: 0x1a2416, roughness: 0.03, metalness: 0.85, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2);
    { const p = g.attributes.position; for (let k = 1; k < p.count; k++) { const a = Math.atan2(p.getZ(k), p.getX(k)), f = 0.7 + 0.5 * vnoise(Math.cos(a) * 2 + 7, Math.sin(a) * 2); p.setX(k, p.getX(k) * f); p.setZ(k, p.getZ(k) * f); } }
    const list = [];
    for (let t = 0; t < 9000 && list.length < 260 * Q1 + 60; t++) {
      const it = roadside(1, E + 2, E + 70)[0]; if (!it) continue; const [x, , z] = it;
      if (fbm(x * 0.05 + 3, z * 0.05, 2) < 0.52) continue;   // puddles gather in patches
      list.push([x, hAt(x, z) + 0.04, z, r() * 6, 1.2 + r() * 3.5, 1, 0.6 + r() * 0.8]);
    }
    cells(g, pud, list, ([x, y, z, a, sx, sy, sz]) => mat(x, y, z, a, sx, sy, sx * sz));
  }

  // ---------- the canopy: bright fresh leaf cards high up, broken by gaps where the light falls in ----------
  const leafA = leafTexture(1, ['#7fbf3a', '#9fd24a', '#5f9a2a', '#b6e06a', '#4f8a24', '#3f7020'], 900, 22);
  const leafB = leafTexture(2, ['#3f7a22', '#5a8f2c', '#2f6a1c', '#6fa83a', '#4a5a20', '#24461a'], 900, 20);
  const canopyMat = new THREE.MeshLambertMaterial({ map: leafA, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x1a3008 });
  const lowMat = new THREE.MeshLambertMaterial({ map: leafB, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x0e1c06 });
  canopyMat.onBeforeCompile = lowMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.x += sin(time * 1.1 + instanceMatrix[3].x * 0.15 + instanceMatrix[3].z * 0.11) * 0.08 * (position.y + 0.5);'); };
  const card = (() => { const a = new THREE.PlaneGeometry(1, 1), b = a.clone().rotateY(Math.PI / 2), c = a.clone().rotateX(Math.PI / 2);
    const g = new THREE.BufferGeometry(), parts = [a, b, c], pos = [], uv = [], nor = [], ind = []; let o = 0;
    for (const p of parts) { pos.push(...p.attributes.position.array); uv.push(...p.attributes.uv.array); nor.push(...p.attributes.normal.array); ind.push(...[...p.index.array].map(i => i + o)); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(ind); return g; })();
  // ---------- the pine forest (after the reference image): Scots pines everywhere, the Tripo pine as a crossed-card
  // impostor (a front-view bake, tools/bake-topdown.py side) for the thousands further out, the full model by the road ----------
  const loader = new THREE.TextureLoader();
  const imp = (file, aspect, shadow, root = 0) => {   // two crossed quads, base at y = 0, 1 wide, `aspect` tall
    const t = loader.load(`models/forest/${file}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const a = new THREE.PlaneGeometry(1, aspect); a.translate(0, aspect / 2, 0); const b = a.clone().rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry(), pos = [], uv = [], ind = []; let o = 0;
    for (const q of [a, b]) { pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array); ind.push(...[...q.index.array].map(i => i + o)); o += q.attributes.position.count; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind);
    const nrm = new Float32Array(pos.length); for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));   // lit like the ground around it
    const m = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, alphaToCoverage: true });   // soft, unbroken needle edges with MSAA
    // both faces lit the same (the back face would otherwise flip the normal down and go black)
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;');
      // roots in shade: the card darkens and warms towards its base, so the plant grows out of the soil instead of standing on it
      if (root > 0) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
 diffuseColor.rgb *= mix(vec3(0.34, 0.3, 0.22), vec3(1.0), smoothstep(0.0, ${root.toFixed(3)}, vMapUv.y));`); };
    m.userData.baseCompile = m.onBeforeCompile;
    return [g, m];
  };
  // ---------- pine crowns drawn in code: the Tripo pine's needles came out as broad leaf blobs, so its green is hidden
  // (in the model and its card) and these clusters of fine needles take its place ----------
  const needleTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), rr = rng(52);
    const greens = ['#3f6a22', '#55822c', '#6a9634', '#82a83e', '#9bb84a', '#355c1e', '#4d7426'];   // sunlit yellow-green, like the reference
    for (let tw = 0; tw < 30; tw++) {   // twigs radiating from the centre, each with needles both sides
      const a0 = rr() * Math.PI * 2, len = 120 + rr() * 110; let x = 256 + Math.cos(a0) * 20, y = 256 + Math.sin(a0) * 20; const dx = Math.cos(a0), dy = Math.sin(a0);
      g.strokeStyle = '#4a3020'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx * len, y + dy * len); g.stroke();
      for (let k = 0; k < 90; k++) { const t = rr(), px = x + dx * len * t, py = y + dy * len * t, side = rr() < 0.5 ? -1 : 1, na = a0 + side * (0.6 + rr() * 0.6), nl = 14 + rr() * 22 * (1 - t * 0.4);
        g.strokeStyle = greens[Math.floor(rr() * greens.length)]; g.lineWidth = 1.2 + rr() * 1.2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const needleMat = new THREE.MeshLambertMaterial({ map: needleTex, alphaTest: 0.4, side: THREE.DoubleSide });
  needleMat.onBeforeCompile = sh => {
    sh.uniforms.time = time; sh.uniforms.sunD = { value: new THREE.Vector3(-0.6, 0.35, -0.7).normalize() };
    sh.vertexShader = 'uniform float time; varying vec3 vWPn;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n \n #ifdef USE_INSTANCING\n transformed.x += sin(time * 0.9 + instanceMatrix[3].x * 0.07) * 0.06 * position.y;\n #endif')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n #ifdef USE_INSTANCING\n vWPn = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n #else\n vWPn = (modelMatrix * vec4(transformed, 1.0)).xyz;\n #endif');
    sh.fragmentShader = 'uniform vec3 sunD; varying vec3 vWPn;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
      // light through the needles: looking toward the sun, the thin edges glow warm
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 V = normalize(vWPn - cameraPosition); float back = pow(max(dot(V, sunD), 0.0), 6.0); totalEmissiveRadiance += vec3(0.9, 0.75, 0.35) * back * (1.0 - diffuseColor.a * 0.5) * 0.9 + diffuseColor.rgb * back * 0.6; }');
  };
  const needleGeo = (() => { const a = new THREE.PlaneGeometry(1, 1), b = a.clone().rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry(), pos = [], uv = [], ind = []; let o = 0;
    for (const q of [a, b]) { pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array); ind.push(...[...q.index.array].map(i => i + o)); o += q.attributes.position.count; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind);
    const nrm = new Float32Array(pos.length); for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); return g; })();
  // a Scots pine crown: clusters from 62% of the height to the top, widest a third of the way up, a flat-ish umbrella
  const crownLods = [];
  const crowns = (trees, per, cellSize) => { const out = [];
    for (const [x, y, z, h] of trees) { const n = per + Math.floor(hash2(x, z) * per * 0.5);
      for (let k = 0; k < n; k++) { const t = Math.pow((k + 0.5) / n, 0.8), cy = y + h * (0.58 + 0.4 * t), rad = h * 0.15 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (0.6 + hash2(x + k, z) * 0.5), a = hash2(z, x + k) * 6.283;
        out.push([x + Math.cos(a) * rad, cy, z + Math.sin(a) * rad, a, h * (0.14 + hash2(x, z + k) * 0.08)]); } }
    const setter = ([x, y, z, a, sc]) => mat(x, y, z, a, sc, sc * 0.8, sc, (hash2(x, y) - 0.5) * 0.6, (hash2(y, z) - 0.5) * 0.6);
    if (!cellSize) return cells(needleGeo, needleMat, out, setter, true);
    const by = new Map(); for (const it of out) { const key = Math.floor(it[0] / cellSize) + ',' + Math.floor(it[2] / cellSize); if (!by.has(key)) by.set(key, []); by.get(key).push(it); }
    for (const items of by.values()) { const im = new THREE.InstancedMesh(needleGeo, needleMat, items.length); items.forEach((it, q) => im.setMatrixAt(q, setter(it))); im.computeBoundingSphere(); im.castShadow = true; group.add(im); crownLods.push(im); } };
  // hide the Tripo pine's own green (needle blobs) in a material: keep bark and branches
  const hideGreen = m => { const prev = m.onBeforeCompile; m.onBeforeCompile = (sh, rd) => { if (prev) prev(sh, rd);
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n if (diffuseColor.g > diffuseColor.r * 1.02 && diffuseColor.g > diffuseColor.b * 1.1) discard;'); };
    m.customProgramCacheKey = () => 'pine-nogreen' + (m.uuid); m.needsUpdate = true; };

  let farPineMat = null, farPineGeo = null; const pineLods = [];
  const PINE_NEAR = E + 20;   // inside this the Tripo model stands (in the Tripo props below), outside it the impostor
  { const [g, m] = imp('pine', 2, true), pines = [];
    for (let t = 0; t < 120000 && pines.length < 9500 * Q1 + 1800; t++) {
      const [x, z] = rand(260), q = nearRoad(x, z, 300); if (q.d < PINE_NEAR || q.d > 320 || cleared(x, z)) continue;
      if (inR(q.s, river, 40) && q.d < 120) continue;
      const h = 22 + r() * 14; pines.push([x, hAt(x, z) - 0.3, z, r() * 6, h]);
    }
    hideGreen(m); farPineMat = m; farPineGeo = g;   // until the re-bake below swaps in a card of the new crown
    cells(g, m, pines, ([x, y, z, a, h]) => mat(x, y, z, a, h / 2 * 1.02, h * 1.02 / 2, h / 2 * 1.02), true); }
  { const [g, m] = imp('young_pine', 2, false), young = [];
    for (let t = 0; t < 30000 && young.length < 1500 * Q1 + 250; t++) {
      const [x, z] = rand(200), q = nearRoad(x, z, 240); if (q.d < E + 8 || q.d > 220 || cleared(x, z)) continue;
      const h = 2.5 + r() * 5; young.push([x, hAt(x, z) - 0.1, z, r() * 6, h]);
    }
    cells(g, m, young, ([x, y, z, a, h]) => mat(x, y, z, a, h / 2, h / 2, h / 2)); }
  // fallen logs are laid out first so no grass, ferns or tufts grow on top of them
  const LOGS = [], logCells = new Map(), LC = 24;
  { const rl = rng(555);
    for (let k = 0, n = Math.round(340 * Q1 + 90); k < n; k++) { const s = k < 14 ? 30 + k * 22 : rl() * track.length, i = idx(s), sd = k % 2 ? 1 : (rl() < 0.5 ? -1 : 1), off = E + 1.4 + rl() * 4.5;
      const x = track.px[i] + track.nx[i] * sd * off, z = track.pz[i] + track.nz[i] * sd * off, len = 9 + rl() * 10, hh = 1.0 + rl() * 0.6, a = Math.atan2(track.tx[i], track.tz[i]) + (rl() - 0.5) * 0.7;
      const L = { x, z, len, hh, a }; LOGS.push(L);
      for (let t = -0.5; t <= 0.5; t += 0.1) { const key = Math.floor((x + Math.sin(a) * len * t) / LC) + ',' + Math.floor((z + Math.cos(a) * len * t) / LC); (logCells.get(key) || logCells.set(key, new Set()).get(key)).add(L); } } }
  const nearLog = (x, z) => { const set = logCells.get(Math.floor(x / LC) + ',' + Math.floor(z / LC)); if (!set) return false;
    for (const L of set) { const dx = x - L.x, dz = z - L.z, sa = Math.sin(L.a), ca = Math.cos(L.a), al = dx * sa + dz * ca, pe = dx * ca - dz * sa; if (Math.abs(al) < L.len * 0.5 + 0.6 && Math.abs(pe) < L.hh * 0.5 + 0.7) return true; } return false; };
  { const [g, m] = imp('fern', 0.82, false, 0.4), ferns = [];
    for (let k = 0, n = Math.round(6000 * Q1 + 1000); k < n; k++) { const s = r() * track.length, off = E + 2 + Math.pow(r(), 1.3) * 40, [x, z, , ti] = side(s, (r() < 0.5 ? -1 : 1) * off);
      if (off > E + 18 && !far(x, z, E + 1)) continue; if (nearLog(x, z)) continue; ferns.push([x, vergeY(x, z, ti, off) - 0.1, z, r() * 6, 1 + r() * 1.4]); }
    cells(g, m, ferns, ([x, y, z, a, w]) => mat(x, y, z, a, w, w, w)); }
  // grass clumps with white flowers along the verge (front-view bake of the Tripo tuft)
  { const [g, m] = imp('grass_tuft', 1, false, 0.55), tufts = []; m.color.setRGB(0.62, 0.68, 0.42);   // the bake is very saturated: tone it to the verge
    for (let k = 0, n = Math.round(90000 * Q1 + 12000); k < n; k++) { const s = r() * track.length, off = E - 0.35 + Math.pow(r(), 1.7) * 22, [x, z, , ti] = side(s, (r() < 0.5 ? -1 : 1) * off); if (nearLog(x, z)) continue; tufts.push([x, vergeY(x, z, ti, off) - 0.16, z, r() * 6, 0.6 + r() * 0.7]); }
    cells(g, m, tufts, ([x, y, z, a, w]) => mat(x, y, z, a, w, w, w)); }

  // ---------- light shafts falling through the canopy gaps ----------
  const shaftMat = new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,250,215,0)'); gr.addColorStop(0.25, 'rgba(255,250,215,0.55)'); gr.addColorStop(1, 'rgba(255,250,215,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 256); const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c); })(),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.45, fog: false });
  const shaftGeo = new THREE.PlaneGeometry(1, 1); shaftGeo.translate(0, -0.5, 0);
  const shafts = []; for (let s = 20; s < track.length; s += 25 + r() * 30) { if (inR(s, river, 0)) continue; const [x, z, , i] = side(s, (r() - 0.5) * 2 * (E + 20)); shafts.push([x, track.py[i] + 26, z, r() * 3, 3 + r() * 4, 34]); }
  cells(shaftGeo, shaftMat, shafts, ([x, y, z, a, w, h]) => mat(x, y, z, a, w, h, 1, 0.42, 0.18));

  // ---------- Tripo props by the road ----------
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('models/forest.glb', gltf => {
    const box = new THREE.Box3();
    const asset = name => { const n = gltf.scene.getObjectByName(name); n.updateMatrix(); n.material.envMapIntensity = 0.5;
      n.geometry.computeBoundingBox(); return { n, size: box.copy(n.geometry.boundingBox).applyMatrix4(n.matrix).getSize(new THREE.Vector3()) }; };
    // items: [x, y, z, yaw, sx, sy, sz] in metres of the finished object
    const place = (name, list, shadow = false) => { if (!list.length) return; const { n, size } = asset(name);
      cells(n.geometry, n.material, list, ([x, y, z, yaw, sx, sy, sz]) => mat(x, y, z, yaw, sx / size.x, sy / size.y, sz / size.z).multiply(n.matrix), shadow); };
    const fit = (name, h) => { const { size } = asset(name), k = h / size.y; return [size.x * k, h, size.z * k]; };
    // mossy logs lying along and across the forest floor, stretched long
    place('fallen_log', roadside(Math.round(30 * Q1 + 8), E + 8, E + 45).map(([x, y, z, s]) => { const [w, h, d] = fit('fallen_log', 1.1 + hash2(x, z) * 0.6); const a = hash2(z, x) * 6; return [x, Math.min(y, logY(x, z, a, d * 2.6, w)) - 0.05, z, a, w, h, d * 2.6]; }), true);
    // giant cedars: three stumps stacked into one trunk that rises out of sight into the canopy
    // Scots pines by the road: the full Tripo model, tall and straight, lower trunk in shadow toward the camera
    { const near = roadside(Math.round(1100 * Q1 + 250), E + 3.5, PINE_NEAR, 6).map(([x, y, z]) => [x, y - 0.3, z, hash2(z, x) * 6, ...fit('pine_b', 22 + hash2(x, z) * 12)]);
      hideGreen(asset('pine_b').n.material);
      { const { n, size } = asset('pine_b'), by = new Map();
        for (const it of near) { const key = Math.floor(it[0] / 60) + ',' + Math.floor(it[2] / 60); if (!by.has(key)) by.set(key, []); by.get(key).push(it); }
        for (const items of by.values()) {
          const full = new THREE.InstancedMesh(n.geometry, n.material, items.length), card = new THREE.InstancedMesh(farPineGeo, farPineMat, items.length);
          items.forEach(([x, y, z, yaw, sx, sy, sz], q) => { full.setMatrixAt(q, mat(x, y, z, yaw, sx / size.x, sy / size.y, sz / size.z).multiply(n.matrix)); card.setMatrixAt(q, mat(x, y, z, yaw, sy / 2 * 1.02, sy / 2 * 1.02, sy / 2 * 1.02)); });
          full.computeBoundingSphere(); card.computeBoundingSphere(); full.castShadow = card.castShadow = true; full.receiveShadow = card.receiveShadow = true;
          group.add(full, card); pineLods.push([full, card]);
        }
      }
      crowns(near.map(([x, y, z, , , h]) => [x, y, z, h]), 22, 60);
      // re-bake the far pines' card: one near pine with its drawn crown, shot from the front onto a transparent target
      if (opts.renderer && farPineMat) {
        const { n, size } = asset('pine_b'), H = 30, k = H / size.y, sc2 = new THREE.Scene();
        sc2.add(new THREE.AmbientLight(0xffffff, 1.0));
        const tree = n.clone(); tree.matrix.identity(); tree.matrixAutoUpdate = true; tree.position.set(0, 0, 0); tree.scale.setScalar(k); tree.rotation.set(0, 0, 0);
        const box2 = new THREE.Box3().setFromObject(tree); tree.position.y -= box2.min.y; sc2.add(tree);
        const crown = []; { const t2 = [[0, 0, 0, H]]; for (const [x, y, z, h] of t2) for (let q = 0, nq = 60; q < nq; q++) { const t = Math.pow((q + 0.5) / nq, 0.8), cy = y + h * (0.58 + 0.4 * t), rad = h * 0.15 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (0.6 + hash2(x + q, z) * 0.5), a = hash2(z, x + q) * 6.283;
          const m2 = new THREE.Mesh(needleGeo, needleMat); m2.position.set(Math.cos(a) * rad, cy, Math.sin(a) * rad); const s2 = h * (0.14 + hash2(x, z + q) * 0.08); m2.scale.set(s2, s2 * 0.8, s2); m2.rotation.set((hash2(q, cy) - 0.5) * 0.6, a, 0); crown.push(m2); sc2.add(m2); } }
        const W2 = (H + 1) / 4, cam = new THREE.OrthographicCamera(-W2, W2, H + 1, 0, 0.1, 200); cam.position.set(0, 0, 60);   // 1:2 like the card
        const rt = new THREE.WebGLRenderTarget(1024, 2048, { samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); rt.texture.colorSpace = THREE.SRGBColorSpace;
        const R = opts.renderer, prevT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
        R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(sc2, cam); R.setRenderTarget(prevT); R.setClearColor(prevC, prevA);
        rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.anisotropy = 4;
        // a card the same width/height ratio as before (1 wide, 2 tall at h/2 scale): stretch the target onto it
        const fm = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.4, side: THREE.DoubleSide });
        fm.onBeforeCompile = farPineMat.userData.baseCompile; farPineMat.map = rt.texture; farPineMat.onBeforeCompile = fm.onBeforeCompile; farPineMat.customProgramCacheKey = () => 'farpine-rebake'; farPineMat.alphaTest = 0.4; farPineMat.needsUpdate = true;
      }
    }
    { const bl = []; for (const sd of [-1, 1]) for (const ds of [-11, 11]) { const [x, z, , ti] = side(3200 + ds, sd * 16); const [w, h, d] = fit('moss_boulder', 14 + hash2(x, z) * 3); bl.push([x, track.py[ti] - 2, z, hash2(z, x) * 6, w, h, d]); }
      place('moss_boulder', bl, true); }   // the colossus's head rests on these
    place('scots_pine', roadside(Math.round(60 * Q1 + 15), E + 5, E + 30).map(([x, y, z]) => [x, y - 0.2, z, hash2(z, x) * 6, ...fit('scots_pine', 4 + hash2(x, z) * 5)]));
    // long mossy logs lying along the verge, roughly parallel to the road, orange bracket fungus on them
    { const logs = LOGS.map(L => { const [w, h] = fit('long_log', L.hh); return [L.x, logY(L.x, L.z, L.a, L.len, w), L.z, L.a, w, h, L.len]; });
      place('long_log', logs, true); }
    place('moss_boulder', roadside(Math.round(90 * Q1 + 20), E + 2.5, E + 50).map(([x, y, z]) => [x, y - 0.5, z, hash2(z, x) * 6, ...fit('moss_boulder', 0.8 + Math.pow(hash2(x, z), 2) * 3.5)]));
    place('fern', roadside(Math.round(260 * Q1 + 60), E + 1.5, E + 20).map(([x, y, z]) => [x, y - 0.1, z, hash2(z, x) * 6, ...fit('fern', 0.7 + hash2(x, z) * 0.8)]));
    // the forest floor near the road: moss mounds, low plants and leaf litter carpet it, mossy snags stand among the trees
    const floor = (n, dmin, dmax) => { const out = []; for (let k = 0; k < n * 2 && out.length < n; k++) {
      const s = r() * track.length, off = dmin + Math.pow(r(), 1.4) * (dmax - dmin), [x, z] = side(s, (r() < 0.5 ? -1 : 1) * off);
      if (off > E + 15 && !far(x, z, E + 0.5)) continue; out.push([x, vergeY(x, z, idx(s), off), z]); } return out; };
    // a few short mossy snags back from the road (tall broken ones read as broken trees)
    place('mossy_trunk', roadside(Math.round(25 * Q1 + 6), E + 12, E + 50, 8, span('moss')).map(([x, y, z]) => [x, y - 0.2, z, hash2(z, x) * 6, ...fit('mossy_trunk', 2.2 + hash2(x, z) * 2)]));
  }, undefined, e => console.warn('forest.glb', e));

  // ---------- the colossus itself: five big Tripo landmarks (models/ruins.glb), each scaled to a span in metres and
  // set beside (or across) the road at its stretch; LANDMARKS is tuned by eye ----------
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('models/ruins.glb', gltf => {
    // name, metres from the line, side (-1 left, 0 across the road, 1 right), centre offset, span (longest horizontal), yaw to the road, along = long axis follows the road, sink, onRoad = stands at road height
    const LANDMARKS = [
      ['colossus_legs', 80, 0, 0, 62, 0, false, 0.8, true],
      ['colossus_arm', 2430, -1, 38, 190, 0, true, 1.0, false, 0.2, 0.35],   // lies along the climb (road 12-22 m up beside it), flattened to fit
      ['colossus_head', 3200, 0, 0, 50, 0, true, -9, true],   // propped on boulders (below), the road passes under the chin
      ['colossus_torso', 3420, -1, 26, 40, Math.PI / 2, false, 1.0, false],
      ['cliff_temple', 5420, 1, 30, 44, -Math.PI / 2, false, 0.5, true],
    ];
    for (const [name, s0, sd, off, span, yaw, along, sink, onRoad, ky = 1, kz = 1] of LANDMARKS) {
      const src = gltf.scene.getObjectByName(name); if (!src) continue;
      const geo = src.geometry; geo.computeBoundingBox(); const bb = geo.boundingBox, w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z, k = span / Math.max(w, d);
      const m = new THREE.Mesh(geo, src.material); m.material.envMapIntensity = 0.5; m.material.color.setScalar(1.45); m.castShadow = m.receiveShadow = true;
      const i = idx(s0), a = Math.atan2(track.tx[i], track.tz[i]), [x, z] = side(s0, sd * off);
      m.scale.set(k, k * ky, k * kz); m.rotation.y = a + (along ? -Math.PI / 2 : 0) + yaw;
      m.position.set(x, (onRoad ? track.py[i] : hAt(x, z)) - sink - bb.min.y * m.scale.y, z); group.add(m);   // the model's centre is its origin: stand its lowest point on the ground
    }
  }, undefined, e => console.warn('ruins.glb', e));

  // ---------- the forest floor near the road: moss mounds, low plants and leaf litter, as top-down images of the Tripo
  // models (tools/bake-topdown.py) laid on low domes: a few dozen triangles each instead of thousands ----------
  {
    const loader = new THREE.TextureLoader();
    const decal = (file, dome) => {
      const t = loader.load(`models/forest/${file}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      // a rounded cap (top of a sphere, squashed), mapped from above
      const g = new THREE.SphereGeometry(0.5, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k); p.setY(k, p.getY(k) * 2 * dome); uv.setXY(k, x + 0.5, 0.5 - z); }
      g.computeVertexNormals();
      return [g, new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -1 })];
    };
    const floor = (n, dmin, dmax) => { const out = []; for (let k = 0; k < n * 2 && out.length < n; k++) {
      const s = r() * track.length, off = dmin + Math.pow(r(), 1.4) * (dmax - dmin), [x, z] = side(s, (r() < 0.5 ? -1 : 1) * off);
      if (off > E + 15 && !far(x, z, E + 0.5)) continue; out.push([x, vergeY(x, z, idx(s), off), z]); } return out; };
    { const [g, m] = decal('leaf_litter', 0.04);
      cells(g, m, floor(Math.round(5000 * Q1 + 900), E + 3.5, E + 70), ([x, y, z]) => { const w = 2 + hash2(x, z) * 3.5; return mat(x, y + 0.02, z, hash2(z, x) * 6, w, 1, w * (0.7 + hash2(x + 1, z) * 0.6)); }); }
    { const [g, m] = decal('moss_mound', 0.18);
      cells(g, m, floor(Math.round(1500 * Q1 + 300), E + 4, E + 55), ([x, y, z]) => { const w = 0.9 + Math.pow(hash2(x, z), 1.5) * 2.2; return mat(x, y - 0.05, z, hash2(z, x) * 6, w, 0.6 + hash2(x + 2, z) * 1.4, w * (0.7 + hash2(z, x + 3) * 0.6)); }); }
    { const [g, m] = decal('pebbles', 0.05);
      m.color.setRGB(0.75, 0.68, 0.55);
      cells(g, m, floor(Math.round(900 * Q1 + 150), E - 0.6, E + 2), ([x, y, z]) => { const w = 0.35 + hash2(x, z) * 0.6; return mat(x, y + 0.03, z, hash2(z, x) * 6, w, 1, w); }); }
    { const [g, m] = decal('floor_plants', 0.14);
      cells(g, m, floor(Math.round(4500 * Q1 + 800), E + 0.2, E + 40), ([x, y, z]) => { const w = 0.9 + hash2(x, z) * 1.5; return mat(x, y, z, hash2(z, x) * 6, w, 1 + hash2(x, z + 4), w); }); }
  }

  // ---------- real grass (top quality only): tufts of thin curved blades with wildflowers, swaying in the wind ----------
  // Chunks of 40 m of road on both sides, out to 26 m from the edge; a chunk is drawn only within 170 m of the camera.
  const grassChunks = [];
  if (opts.grass) {
    // one tuft: 7 blades leaning out from the centre, each a tapered strip of 3 segments; uv.y = height along the blade
    const tuft = (() => { const pos = [], uv = [], ind = [], rr = rng(31);
      for (let b = 0; b < 7; b++) {
        const a = rr() * Math.PI * 2, lean = 0.15 + rr() * 0.35, h = 0.55 + rr() * 0.5, w = 0.035 + rr() * 0.025, ox = (rr() - 0.5) * 0.25, oz = (rr() - 0.5) * 0.25;
        const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx, o = pos.length / 3;
        for (let k = 0; k <= 3; k++) { const t = k / 3, ww = w * (1 - t * 0.92), bx = ox + cx * lean * h * t * t, bz = oz + cz * lean * h * t * t, y = h * t;
          pos.push(bx - px * ww, y, bz - pz * ww, bx + px * ww, y, bz + pz * ww); uv.push(0, t, 1, t); }
        for (let k = 0; k < 3; k++) { const q = o + k * 2; ind.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); return g; })();
    const grassMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    grassMat.onBeforeCompile = sh => {
      sh.uniforms.time = time;
      sh.vertexShader = 'uniform float time; attribute vec4 iPos; attribute vec4 iMisc; varying vec3 vGrass;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);')   // lit like a soft carpet, not like paper
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float c = cos(iMisc.x), s = sin(iMisc.x);
          transformed = vec3(c * transformed.x - s * transformed.z, transformed.y, s * transformed.x + c * transformed.z) * vec3(iMisc.y, iMisc.y * (0.8 + iMisc.w * 0.6), iMisc.y);
          float h = uv.y, gust = sin(time * 1.7 + iPos.x * 0.12 + iPos.z * 0.09) * 0.5 + sin(time * 3.1 + iPos.x * 0.4) * 0.15;
          transformed.x += gust * 0.22 * h * h * iMisc.y; transformed.z += gust * 0.1 * h * h * iMisc.y;
          transformed += iPos.xyz;
          vec3 base = vec3(0.08, 0.15, 0.04), tip = mix(vec3(0.34, 0.54, 0.12), vec3(0.5, 0.62, 0.18), iMisc.w * iMisc.w);
          vGrass = mix(base, tip, smoothstep(0.0, 1.0, h));
          if (iMisc.z > 0.5 && h > 0.86) vGrass = iMisc.z < 1.5 ? vec3(0.95, 0.93, 0.85) : iMisc.z < 2.5 ? vec3(0.62, 0.45, 0.85) : vec3(0.95, 0.8, 0.3);`);
      sh.fragmentShader = 'varying vec3 vGrass;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vGrass;');
    };
    const raisedAt = i => track.py[i] - hAt(track.px[i], track.pz[i]) > 2;
    for (let s0 = 0; s0 < track.length; s0 += 40) {
      if (inR(s0, river, 30)) continue;
      const iPos = [], iMisc = [];
      let cx = 0, cz = 0, cy = 0, n = 0;
      for (let k = 0, want = 40 * 2 * 26 * 4.2 * Math.min(1.4, Q1); k < want; k++) {
        const s = s0 + r() * 40, i = idx(s); if (raisedAt(i)) continue;
        const off = E - 0.4 + Math.pow(r(), 1.6) * 26, sd = r() < 0.5 ? -1 : 1, x = track.px[i] + track.nx[i] * sd * off + (r() - 0.5) * 2, z = track.pz[i] + track.nz[i] * sd * off + (r() - 0.5) * 2;
        if (nearLog(x, z) || (fbm(x * 0.08, z * 0.08 + 11, 2) < 0.3 && r() < 0.6)) continue;   // thinner in places, like real meadows
        const y = vergeY(x, z, i, off), flower = r() < 0.12 ? (r() < 0.7 ? 1 : 1 + Math.floor(r() * 3)) : 0;   // mostly small white flowers, like the reference
        iPos.push(x, y - 0.02, z, 0); iMisc.push(r() * 6.28, 0.3 + r() * 0.35 + (off > E + 10 ? 0.15 : 0) + (off < E + 1.5 ? -0.12 : 0), flower, r());
        cx += x; cy += y; cz += z; n++;
      }
      if (!n) continue;
      const g = tuft.clone(); g.instanceCount = n;
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(iPos), 4)); g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(new Float32Array(iMisc), 4));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx / n, cy / n, cz / n), 50);
      const m = new THREE.Mesh(g, grassMat); m.receiveShadow = true; m.frustumCulled = true; group.add(m); grassChunks.push(m);
    }
  }

  // distance switches, checked as each frame starts for whichever camera renders: grass chunks; near pines as the full
  // model (and their drawn crowns) within 100 m, as the card beyond
  { const prev = scene.onBeforeRender;
    scene.onBeforeRender = (rd, sc, cam) => { if (prev) prev(rd, sc, cam); const P = cam.position;
      for (const m of grassChunks) m.visible = m.geometry.boundingSphere.center.distanceToSquared(P) < 170 * 170;
      for (const [full, card] of pineLods) { const nearC = full.boundingSphere.center.distanceToSquared(P) < 100 * 100; full.visible = nearC; card.visible = !nearC; }
      for (const im of crownLods) im.visible = im.boundingSphere.center.distanceToSquared(P) < 110 * 110; }; }

  function update(t) { time.value = t; }
  return { update, ground, hAt };
}
