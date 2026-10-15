import * as THREE from 'three';
import { canvas, tex, concreteTexture } from './textures.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function makeNoise(seed) {
  const r = rng(seed), P = new Float32Array(512 * 512);
  for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & 511) << 9) | (x & 511)];
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
  return (x, y, oct = 4) => { let a = 0, f = 1, amp = 1, sum = 0; for (let o = 0; o < oct; o++) { a += amp * n2(x * f, y * f); sum += amp; f *= 2.03; amp *= 0.5; } return a / sum; };
}

// Grid query over a subset of centreline samples: nearest distance/height/index.
function sampleField(track, keep, cell = 24) {
  const B = track.bounds, pad = 500;
  const gx0 = Math.floor((B.minx - pad) / cell), gz0 = Math.floor((B.minz - pad) / cell);
  const GW = Math.ceil((B.maxx + pad) / cell) - gx0 + 1, GH = Math.ceil((B.maxz + pad) / cell) - gz0 + 1;
  const grid = Array.from({ length: GW * GH }, () => []);
  for (let i = 0; i < track.N; i += 2) if (keep(i)) grid[(Math.floor(track.pz[i] / cell) - gz0) * GW + (Math.floor(track.px[i] / cell) - gx0)].push(i);
  return (x, z, reach = 5) => {
    const cx = Math.floor(x / cell) - gx0, cz = Math.floor(z / cell) - gz0;
    let bd = Infinity, bi = -1;
    for (let b = -reach; b <= reach; b++) { const zz = cz + b; if (zz < 0 || zz >= GH) continue;
      for (let a = -reach; a <= reach; a++) { const xx = cx + a; if (xx < 0 || xx >= GW) continue;
        for (const i of grid[zz * GW + xx]) { const dx = x - track.px[i], dz = z - track.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } } }
    return bi < 0 ? null : { d: Math.sqrt(bd), i: bi, y: track.py[bi] };
  };
}

export function buildCoast(scene, track, { trees = 1400 } = {}) {
  const group = new THREE.Group();
  const noise = makeNoise(21);
  const r = rng(91);
  const cfg = track.cfg, [bayX, bayZ] = cfg.peak;      // centre of the bay
  const spans = (cfg.bridges || []).map(([a, b, kind]) => [Math.round(a / track.step), Math.round(b / track.step), kind]);
  const onBridge = i => spans.some(([a, b]) => i >= a && i <= b);
  const landRoad = sampleField(track, i => !onBridge(i));
  const anyRoad = sampleField(track, () => true);
  const B = track.bounds, cx = (B.minx + B.maxx) / 2, cz = (B.minz + B.maxz) / 2;
  const S = THREE.MathUtils.smoothstep;
  const SEA_FLOOR = -22;

  // ---- terrain: hills behind the coast roads, cliffs dropping to the bay, open water under the bridges ----
  const SIZE = 2600, RES = 340, half = SIZE / 2, step = SIZE / RES;
  // keep a one-cell-diagonal bench at road height so no terrain triangle can slice across the road
  const roadSide = track.edge + step * Math.SQRT2 + 1;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES, RES);
  geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz);
  const pos = geo.attributes.position, count = pos.count, H = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const sea = SEA_FLOOR + noise(x / 120, z / 120, 3) * 6;
    let h = sea;
    const f = landRoad(x, z, 6);
    if (f) {
      const i = f.i, vx = x - track.px[i], vz = z - track.pz[i];
      const bayward = vx * (bayX - track.px[i]) + vz * (bayZ - track.pz[i]) > 0;
      const e = Math.max(0, f.d - roadSide);
      const hill = f.y + Math.min(70, e * 0.55) * (0.55 + noise(x / 220, z / 220, 4) * 0.9) + (noise(x / 50, z / 50, 3) - 0.5) * 6;
      const cliff = f.y - 0.35 - Math.min(f.y + 25, e * 1.6 + e * e * 0.01);
      let land = bayward ? cliff : hill;
      if (f.d < roadSide) land = f.y - 0.35;
      // how far land reaches from the road before the sea takes over
      const reach = bayward ? 40 + noise(x / 90, z / 90) * 30 : 210 + noise(x / 160, z / 160, 3) * 160;
      const k = 1 - S(f.d, reach * 0.65, reach);
      h = land * k + sea * (1 - k);
      if (bayward) h = Math.max(h, sea);
    }
    // around a bridge the ground gives way to open sea: the closer a point is to a bridge than to
    // any land road, the more it becomes water (no hills cut into walls beside the causeway)
    const b = anyRoad(x, z, 6);
    if (b && onBridge(b.i)) {
      const w = f ? S(f.d - b.d, -15, 35) : 1;
      h = h * (1 - w) + Math.min(h, sea) * w;
    }
    // never let ground touch a deck
    if (b && onBridge(b.i) && b.d < roadSide + 2) h = Math.min(h, b.y - 4.5);
    H[v] = h; pos.setY(v, h);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, col = new Float32Array(count * 3);
  const sand = new THREE.Color(0xd9c8a0), grass = new THREE.Color(0x6f8f45), dry = new THREE.Color(0xa59a5e), rock = new THREE.Color(0xb3a894), wet = new THREE.Color(0x5d7a80);
  const c = new THREE.Color();
  for (let v = 0; v < count; v++) {
    const ny = nrm.getY(v), x = pos.getX(v), z = pos.getZ(v), h = H[v];
    c.copy(grass).lerp(dry, noise(x / 60, z / 60, 3));
    c.lerp(rock, S(1 - ny, 0.2, 0.42));
    c.lerp(sand, 1 - S(h, 1.5, 5));
    c.lerp(wet, 1 - S(h, -3, 0.5));
    col.set([c.r, c.g, c.b], v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = tex(canvas(256, 256, (g, w, hh) => { const q = rng(5); g.fillStyle = '#808080'; g.fillRect(0, 0, w, hh); for (let i = 0; i < 9000; i++) { const t = 90 + q() * 90; g.fillStyle = `rgba(${t},${t},${t},.5)`; g.fillRect(q() * w, q() * hh, 1 + q() * 3, 1 + q() * 3); } }));
  detail.repeat.set(SIZE / 12, SIZE / 12);
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 }));
  terrain.receiveShadow = true;
  group.add(terrain);
  window.__terrain = terrain;   // debug/test hook
  const heightAt = (x, z) => {
    const gx = (x - (cx - half)) / step, gz = (z - (cz - half)) / step;
    const i = Math.max(0, Math.min(RES - 1, Math.floor(gx))), j = Math.max(0, Math.min(RES - 1, Math.floor(gz)));
    const u = gx - i, w = gz - j, k = j * (RES + 1) + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - w) + (H[k + RES + 1] * (1 - u) + H[k + RES + 2] * u) * w;
  };

  // ---- sea: one big plane with a scrolling wave normal map, reflecting the sky ----
  const waves = waveNormalTexture();
  waves.repeat.set(160, 160);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0x14607e, roughness: 0.22, metalness: 0.05, normalMap: waves, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.25, transparent: true, opacity: 0.93 }));
  water.rotation.x = -Math.PI / 2; water.position.set(cx, 0, cz); water.receiveShadow = true;
  group.add(water);

  // ---- bridges ----
  const conc = new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0xd8d4cc, roughness: 0.85 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.7 });
  const E = track.edge;
  const box = (a, b, w, d, mat) => {   // a box spanning points a→b (Vector3), cross-section w×d
    const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = m.receiveShadow = true; group.add(m); return m;
  };
  const P = (i, off, dy = 0) => new THREE.Vector3(track.px[i] + track.nx[i] * off, track.py[i] + dy, track.pz[i] + track.nz[i] * off);
  const cables = [];
  for (const [i0, i1, kind] of spans) {
    // box-girder deck under the road, with a white edge band
    const deck = track.stripRange.bind(track);
    for (const [a, b, ya, yb] of [[-E - 0.7, E + 0.7, -2.6, -2.6], [-E - 0.7, -E - 0.7, -0.1, -2.6], [E + 0.7, E + 0.7, -0.1, -2.6]]) {
      const m = new THREE.Mesh(deck(i0, i1, a, b, ya, yb, 8), conc); m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; group.add(m);
    }
    // piers
    const gap = kind === 'cable' ? 60 : 36, every = Math.round(gap / track.step);
    const towerAt = kind === 'cable' ? [i0 + Math.round((i1 - i0) * 0.32), i0 + Math.round((i1 - i0) * 0.68)] : [];
    for (let i = i0 + Math.round(every / 2); i < i1; i += every) {
      if (towerAt.some(t => Math.abs(t - i) < every * 0.7)) continue;
      const top = P(i, 0, -2.6), bot = top.clone(); bot.y = SEA_FLOOR - 2;
      box(bot, top, kind === 'cable' ? 5 : 3.5, 3, conc);
    }
    // A-shaped pylons with fan stays
    for (const t of towerAt) {
      const apex = P(t, 0, 78), legW = E + 3;
      for (const s of [-1, 1]) {
        const foot = P(t, s * legW, 0); foot.y = SEA_FLOOR - 2;
        box(foot, apex, 3.2, 4.2, towerMat);
      }
      box(P(t, -legW + 1.2, -3.2), P(t, legW - 1.2, -3.2), 2.4, 3.4, towerMat);       // crossbeam under the deck
      box(P(t, -10, 48), P(t, 10, 48), 1.8, 2.6, towerMat);                           // upper crossbeam
      for (const dir of [-1, 1]) for (let k = 1; k <= 13; k++) {
        const j = t + dir * Math.round((k * 14) / track.step);
        if (j <= i0 || j >= i1) continue;
        for (const s of [-1, 1]) cables.push([P(t, s * 0.8, 74 - k * 1.6), P(j, s * (E + 0.45), 1.1)]);
      }
    }
  }
  if (cables.length) {
    const cab = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.6 }), cables.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    cables.forEach(([a, b], k) => {
      const d = b.clone().sub(a); q.setFromUnitVectors(up, d.clone().normalize());
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, d.length(), 1)); cab.setMatrixAt(k, m);
    });
    group.add(cab);
  }

  // ---- lighthouse on the north headland ----
  {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < track.N; i++) { const d = Math.hypot(track.px[i] - 260, track.pz[i] + 470); if (d < bd) { bd = d; bi = i; } }
    const away = new THREE.Vector2(track.px[bi] - bayX, track.pz[bi] - bayZ).normalize();
    const lx = track.px[bi] + away.x * 42, lz = track.pz[bi] + away.y * 42, ly = heightAt(lx, lz);
    const lh = new THREE.Group(); lh.position.set(lx, ly, lz);
    const stripes = tex(canvas(16, 128, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f4f1ea' : '#c8302c'; g.fillRect(0, k * 16, 16, 16); } }));
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 22, 20), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 })); tower.position.y = 11; tower.castShadow = true; lh.add(tower);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0x2a2a2e })); gallery.position.y = 22.3; lh.add(gallery);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6), toneMapped: false })); lamp.position.y = 24; lh.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 16), new THREE.MeshStandardMaterial({ color: 0xc8302c })); cap.position.y = 26.5; lh.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 3, 16), new THREE.MeshStandardMaterial({ color: 0xe8e4dc })); base.position.y = 0.5; lh.add(base);
    group.add(lh);
  }

  // ---- seaside town: white houses with coloured roofs near the land roads ----
  const roofCols = [0xc8572e, 0x2f6fb0, 0xb83a3a, 0x3c8a7a, 0xd9a441];
  const houses = [], roofs = [];
  for (let tries = 0; tries < 9000 && houses.length < 140; tries++) {
    const i = Math.floor(r() * track.N); if (onBridge(i)) continue;
    const side = r() < 0.5 ? -1 : 1, off = side * (track.edge + 10 + r() * 70);
    const x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
    const away = (x - track.px[i]) * (bayX - track.px[i]) + (z - track.pz[i]) * (bayZ - track.pz[i]) < 0;
    if (!away) continue;
    const near = anyRoad(x, z, 2); if (near && near.d < track.edge + 7) continue;
    const y = heightAt(x, z);
    if (y < 2 || Math.abs(heightAt(x + 5, z) - heightAt(x - 5, z)) + Math.abs(heightAt(x, z + 5) - heightAt(x, z - 5)) > 4) continue;
    if (houses.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 14)) continue;
    const w = 7 + r() * 6, d = 7 + r() * 5, hgt = 4 + Math.floor(r() * 3) * 3, yaw = Math.atan2(track.tx[i], track.tz[i]);
    houses.push([x, z, y, w, d, hgt, yaw]); roofs.push(roofCols[Math.floor(r() * roofCols.length)]);
  }
  if (houses.length) {
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.8 }), houses.length);
    const roofGeo = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const roofM = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), houses.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), tint = new THREE.Color();
    houses.forEach(([x, z, y, w, d, hgt, yaw], k) => {
      e.set(0, yaw, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y - 0.5, z), q, new THREE.Vector3(w, hgt + 0.5, d)); walls.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(x, y + hgt, z), q, new THREE.Vector3(w * 1.25, 3.2, d * 1.25)); roofM.setMatrixAt(k, m);
      roofM.setColorAt(k, tint.set(roofs[k]));
    });
    walls.castShadow = roofM.castShadow = true; walls.receiveShadow = true;
    group.add(walls, roofM);
  }

  // ---- palms near the shore, round shrubs up the hills ----
  const palms = [], shrubs = [];
  for (let tries = 0; tries < 40000 && palms.length + shrubs.length < trees; tries++) {
    const x = cx + (r() - 0.5) * 2000, z = cz + (r() - 0.5) * 1400;
    const near = anyRoad(x, z, 3); if (near && near.d < track.edge + 5) continue;
    const y = heightAt(x, z); if (y < 1.2) continue;
    if (Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) + Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3)) > 5) continue;
    if (y < 14 && near && near.d < 70) palms.push([x, y, z, 0.8 + r() * 0.5, r() * 6.28]);
    else if (noise(x / 80, z / 80 + 5) > 0.45) shrubs.push([x, y, z, 1 + r() * 1.8]);
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
  if (palms.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 9, 6).translate(0, 4.5, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(0.12)), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }), palms.length);
    // fronds: six drooping blades around the crown
    const fronds = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.PlaneGeometry(1.1, 5, 1, 4); const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) { const yy = p.getY(v) + 2.5; p.setY(v, yy); p.setZ(v, -0.06 * yy * yy); }
      g.rotateX(-1.1); g.rotateY((k / 6) * Math.PI * 2); g.translate(1.05, 8.9, 0);
      fronds.push(g.toNonIndexed());
    }
    const fg = new THREE.BufferGeometry(); const arr = []; fronds.forEach(g => arr.push(...g.attributes.position.array));
    fg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); fg.computeVertexNormals();
    const crown = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 0.8, side: THREE.DoubleSide }), palms.length);
    palms.forEach(([x, y, z, s, a], k) => { e4.set(0, a, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, y - 0.2, z), q4, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(k, m4); crown.setMatrixAt(k, m4); });
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);
  }
  if (shrubs.length) {
    const sh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: 0x55783a, roughness: 0.9, flatShading: true }), shrubs.length);
    const tint = new THREE.Color();
    shrubs.forEach(([x, y, z, s], k) => { m4.compose(new THREE.Vector3(x, y + s * 0.6, z), q4.identity(), new THREE.Vector3(s, s * 0.8, s)); sh.setMatrixAt(k, m4); sh.setColorAt(k, tint.setHSL(0.24 + r() * 0.06, 0.35, 0.3 + r() * 0.15)); });
    sh.castShadow = true; group.add(sh);
  }

  // ---- sailboats out on the bay ----
  const boats = [];
  for (let tries = 0; tries < 400 && boats.length < 10; tries++) {
    const x = bayX + (r() - 0.5) * 1100, z = bayZ + (r() - 0.5) * 520;
    if (heightAt(x, z) > -6) continue;
    const near = anyRoad(x, z, 4); if (near && near.d < 45) continue;
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 7).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 })); b.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9).translate(0, 5.3, 0), new THREE.MeshStandardMaterial({ color: 0x888888 })); b.add(mast);
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 1.2); sailShape.lineTo(0, 9.5); sailShape.lineTo(3.4, 1.4); sailShape.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: r() < 0.3 ? 0xf2c14e : 0xfafafa, side: THREE.DoubleSide, roughness: 0.7 })); sail.rotation.y = Math.PI / 2; b.add(sail);
    b.position.set(x, 0, z); b.rotation.y = r() * 6.28; b.userData.phase = r() * 6.28;
    b.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(b); boats.push(b);
  }

  scene.add(group);
  return {
    update(t) {
      waves.offset.set(t * 0.012, t * 0.007);
      for (const b of boats) { const p = b.userData.phase; b.position.y = Math.sin(t * 0.9 + p) * 0.25; b.rotation.z = Math.sin(t * 0.7 + p) * 0.05; }
    },
  };
}

// Tiling wave normal map from summed sines (seamless), encoded as tangent-space normals.
export function waveNormalTexture() {
  const N = 256, hgt = new Float32Array(N * N), r = rng(13);
  const comps = Array.from({ length: 9 }, () => ({ kx: Math.round(1 + r() * 6) * (r() < 0.5 ? -1 : 1), ky: Math.round(1 + r() * 6) * (r() < 0.5 ? -1 : 1), a: 0.3 + r(), p: r() * 6.28 }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0; for (const c of comps) h += c.a * Math.sin(((c.kx * x + c.ky * y) / N) * Math.PI * 2 + c.p) / Math.hypot(c.kx, c.ky);
    hgt[y * N + x] = h;
  }
  const cv = canvas(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)], dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
      const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1, l = Math.hypot(nx, ny, nz), k = (y * N + x) * 4;
      img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  return tex(cv, { srgb: false });
}

// Daytime sky: blue gradient, bright sun, drifting fbm clouds.
export function buildDaySky(scene, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() }, time: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; uniform float time; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.0, w = 0.5; for (int k = 0; k < 5; k++){ a += w * n(p); p *= 2.03; w *= 0.5; } return a; }
      void main(){
        float y = vP.y;
        vec3 zen = vec3(0.16,0.38,0.78), hor = vec3(0.70,0.84,0.95), low = vec3(0.55,0.68,0.78);
        vec3 c = y > 0.0 ? mix(hor, zen, pow(smoothstep(0.0, 0.7, y), 0.8)) : low;
        if (y > 0.02) {
          vec2 uv = vP.xz / (y + 0.12) * 1.6 + vec2(time * 0.004, time * 0.002);
          float cl = smoothstep(0.52, 0.78, fbm(uv));
          c = mix(c, vec3(1.0), cl * 0.85 * smoothstep(0.02, 0.2, y));
        }
        float d = max(dot(vP, sun), 0.0);
        c += vec3(1.0,0.9,0.7) * pow(d, 12.0) * 0.25 + vec3(1.0,0.97,0.9) * pow(d, 1200.0) * 8.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  scene.add(sky);
  return sky;
}
