import * as THREE from 'three';
import { canvas, tex, radialTexture, brickTexture, latticeTexture, bannerCharTexture, plaqueTexture } from './textures.js';
import { waveNormalTexture } from './coast.js';

// 长安灯火 — Chang'an on the Lantern Festival night.
// City: walls ring x∈[-480,480], z∈[-500,125]; canal along z≈-392 (x -330…470); pagoda at (0,-440).

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const RING = { x0: -480, x1: 480, z0: -500, z1: 125 };
const CANAL = { x0: -330, x1: 470, z0: -400, z1: -384 };
const PAGODA = [0, -440];

// palette
const C = {
  lacquer: 0x8e1a12, timber: 0x3a1712, tile: 0x252a33, stone: 0x7c766c, marble: 0xcfc8bb, gold: 0xd4a63a,
};
const lanternColor = new THREE.Color(1.15, 0.035, 0.012);   // reads red with a soft bloom halo, not white

function roadGrid(track) {
  const cell = 20, B = track.bounds, pad = 120;
  const gx0 = Math.floor((B.minx - pad) / cell), gz0 = Math.floor((B.minz - pad) / cell);
  const GW = Math.ceil((B.maxx + pad) / cell) - gx0 + 1, GH = Math.ceil((B.maxz + pad) / cell) - gz0 + 1;
  const grid = Array.from({ length: GW * GH }, () => []);
  for (let i = 0; i < track.N; i++) { const gx = Math.floor(track.px[i] / cell) - gx0, gz = Math.floor(track.pz[i] / cell) - gz0; if (gx >= 0 && gz >= 0 && gx < GW && gz < GH) grid[gz * GW + gx].push(i); }
  return (x, z) => {
    const cx = Math.floor(x / cell) - gx0, cz = Math.floor(z / cell) - gz0;
    let bd = Infinity, bi = -1;
    for (let b = -2; b <= 2; b++) { const zz = cz + b; if (zz < 0 || zz >= GH) continue;
      for (let a = -2; a <= 2; a++) { const xx = cx + a; if (xx < 0 || xx >= GW) continue;
        for (const i of grid[zz * GW + xx]) { const dx = x - track.px[i], dz = z - track.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } } } }
    return bi < 0 ? { d: 1e9, i: -1 } : { d: Math.sqrt(bd), i: bi };
  };
}

// Hip roof with a ridge along local x, footprint 1×1, height 1 (scale to fit).
function hipRoofGeometry() {
  const v = [-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5, -.22, 1, 0, .22, 1, 0];
  // upturned eaves: lift the four corners a little
  for (const k of [1, 4, 7, 10]) v[k] = 0.12;
  const idx = [0, 4, 5, 0, 5, 1, 2, 5, 4, 2, 4, 3, 3, 4, 0, 1, 5, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const flat = g.toNonIndexed(); flat.computeVertexNormals();
  return flat;
}

export function buildChangan(scene, track, { quality = 1, onBoom = () => {}, onLaunch = () => {} } = {}) {
  const group = new THREE.Group();
  const r = rng(2025);
  const near = roadGrid(track);
  const E = track.edge;
  const lanterns = [];                     // [x, y, z, scale]
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m; };
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const lacquer = M(C.lacquer, { roughness: 0.45 }), timber = M(C.timber), tile = M(C.tile, { roughness: 0.55, metalness: 0.15 });
  const gold = M(C.gold, { roughness: 0.35, metalness: 0.8 }), marble = M(C.marble, { roughness: 0.6 }), stone = M(C.stone, { roughness: 0.85 });
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 });
  const roofGeo = hipRoofGeometry();
  const ab = track.cfg.archBridge.map(m => Math.round(m / track.step));
  const tw = track.cfg.tower.map(m => Math.round(m / track.step));
  track.galleryRange = tw;                  // engine echo inside the gate tower

  // ---------- ground, moat, canal ----------
  const groundTex = tex(canvas(256, 256, (g, w, h) => { const q = rng(9); g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, h); for (let i = 0; i < 7000; i++) { const t = 28 + q() * 30; g.fillStyle = `rgba(${t + 6},${t},${t - 4},.6)`; g.fillRect(q() * w, q() * h, 2, 2); } g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(0, k * 64); g.lineTo(w, k * 64); g.stroke(); g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, h); g.stroke(); } }));
  groundTex.repeat.set(400, 400);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.03, -190); group.add(ground);

  const waves = waveNormalTexture(); waves.repeat.set(60, 60);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.06, metalness: 0.4, normalMap: waves, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6 });
  const waterPlane = (x0, x1, z0, z1, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), waterMat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); group.add(m); return m; };
  waterPlane(CANAL.x0, CANAL.x1, CANAL.z0, CANAL.z1, 0.05);
  // stone embankments
  for (const z of [CANAL.z0 - 0.6, CANAL.z1 + 0.6]) add(new THREE.BoxGeometry(CANAL.x1 - CANAL.x0, 0.5, 1.2), stone, (CANAL.x0 + CANAL.x1) / 2, 0.22, z);
  add(new THREE.BoxGeometry(1.2, 0.5, CANAL.z1 - CANAL.z0 + 2.4), stone, CANAL.x0 - 0.6, 0.22, (CANAL.z0 + CANAL.z1) / 2);
  // moat around the walls
  const MO = 46;
  waterPlane(RING.x0 - 9 - MO, RING.x1 + 9 + MO, RING.z0 - 10 - MO, RING.z0 - 12, 0.04);
  waterPlane(RING.x0 - 9 - MO, RING.x1 + 9 + MO, RING.z1 + 11, RING.z1 + 9 + MO, 0.04);
  waterPlane(RING.x0 - 9 - MO, RING.x0 - 11, RING.z0 - 12, RING.z1 + 11, 0.04);
  waterPlane(RING.x1 + 11, RING.x1 + 9 + MO, RING.z0 - 12, RING.z1 + 11, 0.04);

  // ---------- city walls (except where the road itself is the wall) ----------
  const wallH = 12, wallT = 18;
  const wallSeg = [];
  const sides = [
    [[RING.x0, RING.z1], [RING.x1, RING.z1]], [[RING.x0, RING.z0], [RING.x1, RING.z0]],
    [[RING.x0, RING.z0], [RING.x0, RING.z1]], [[RING.x1, RING.z0], [RING.x1, RING.z1]],
  ];
  for (const [[ax, az], [bx, bz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 12);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
      const nr = near(x, z);
      if (nr.d < wallT / 2 + E + 3) continue;                // the raised road is the wall here
      wallSeg.push([x, z, len / n + 0.05, bx !== ax]);
    }
  }
  const wallMat = brickMat.clone(); wallMat.map = brickMat.map.clone(); wallMat.map.repeat.set(3, 3);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, wallSeg.length);
  const merlonList = [];
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  wallSeg.forEach(([x, z, len, alongX], k) => {
    m4.compose(new THREE.Vector3(x, wallH / 2, z), q4.identity(), new THREE.Vector3(alongX ? len : wallT, wallH, alongX ? wallT : len)); walls.setMatrixAt(k, m4);
    for (let t = -len / 2 + 1.3; t < len / 2; t += 2.6) for (const s of [-1, 1]) merlonList.push(alongX ? [x + t, z + s * (wallT / 2 - 0.6)] : [x + s * (wallT / 2 - 0.6), z + t]);
    if (k % 2 === 0) lanterns.push([x + (alongX ? 0 : (x < 0 ? wallT / 2 + 0.6 : -wallT / 2 - 0.6)), wallH - 1.2, z + (alongX ? (z < 0 ? wallT / 2 + 0.6 : -wallT / 2 - 0.6) : 0), 1.1]);
  });
  group.add(walls);
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), wallMat, merlonList.length);
  merlonList.forEach(([x, z], k) => { m4.compose(new THREE.Vector3(x, wallH + 0.55, z), q4.identity(), one); merlons.setMatrixAt(k, m4); });
  group.add(merlons);

  // ---------- pavilions (gate towers, corner towers) ----------
  const latA = latticeTexture(3), latB = latticeTexture(7);
  const panelMat = t => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.7 });
  const panelA = panelMat(latA), panelB = panelMat(latB);
  function pavilion(x, y, z, ry, w, d, floors, storeyH = 5.5) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    let yy = 0, ww = w, dd = d;
    for (let f = 0; f < floors; f++) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(ww - 2.4, storeyH, dd - 2.4), f % 2 ? panelB : panelA); body.position.y = yy + storeyH / 2; g.add(body);
      // columns round the veranda
      const cols = Math.max(2, Math.round(ww / 4.2));
      for (let c = 0; c <= cols; c++) for (const s of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, storeyH, 10), lacquer); col.position.set(-ww / 2 + 0.6 + (ww - 1.2) * c / cols, yy + storeyH / 2, s * (dd / 2 - 0.6)); g.add(col);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.7, dd), lacquer); beam.position.y = yy + storeyH + 0.1; g.add(beam);
      const roof = new THREE.Mesh(roofGeo, tile); roof.scale.set(ww + 4.5, f === floors - 1 ? 4.2 : 1.6, dd + 4.5); roof.position.y = yy + storeyH + 0.45; g.add(roof);
      if (f === floors - 1) { const ridge = new THREE.Mesh(new THREE.BoxGeometry((ww + 4.5) * 0.44, 0.35, 0.35), gold); ridge.position.y = yy + storeyH + 4.6; g.add(ridge); }
      // lanterns hung from the eave corners and along the front
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = new THREE.Vector3(lx * (ww / 2 + 1.8), yy + storeyH - 0.4, lz * (dd / 2 + 1.8)).applyEuler(new THREE.Euler(0, ry, 0));
        lanterns.push([x + p.x, y + p.y, z + p.z, 1.3]);
      }
      for (let c = 1; c < cols; c++) for (const s of [-1, 1]) {
        const p = new THREE.Vector3(-ww / 2 + 0.6 + (ww - 1.2) * c / cols, yy + storeyH - 0.9, s * (dd / 2 + 0.2)).applyEuler(new THREE.Euler(0, ry, 0));
        lanterns.push([x + p.x, y + p.y, z + p.z, 1]);
      }
      yy += storeyH + 1.6; ww *= 0.8; dd *= 0.8;
    }
    group.add(g);
    return g;
  }
  // south gate tower and the four corner towers
  pavilion(0, wallH, RING.z1, 0, 34, 14, 2, 6);
  const arch = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050302 }));
  arch.position.set(0, 4.5, RING.z1 - wallT / 2 - 0.05); arch.rotation.y = Math.PI; group.add(arch);
  add(new THREE.PlaneGeometry(9, 4.5), arch.material, 0, 2.25, RING.z1 - wallT / 2 - 0.05, Math.PI);
  for (const [cx, cz] of [[RING.x0, RING.z1], [RING.x1, RING.z1], [RING.x0, RING.z0], [RING.x1, RING.z0]]) {
    if (near(cx, cz).d < 30) continue;
    add(new THREE.BoxGeometry(wallT + 6, wallH + 0.4, wallT + 6), wallMat, cx, (wallH + 0.4) / 2, cz);
    pavilion(cx, wallH + 0.4, cz, 0, 14, 14, 1, 5);
  }

  // ---------- the gate tower the road runs through, on the north wall ----------
  {
    const [i0, i1] = tw, W = E + 1.4, H = 7.2;
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(track.stripRange(i0, i1, s * W, s * W, 0, H, 4), brickMat); wall.material.side = THREE.DoubleSide; group.add(wall);
      const outer = new THREE.Mesh(track.stripRange(i0, i1, s * (W + 3), s * (W + 3), -track.py[i0], H, 4), brickMat); group.add(outer);
      group.add(new THREE.Mesh(track.stripRange(i0, i1, s * W, s * (W + 3), H, H, 4), brickMat));
    }
    const ceil = new THREE.Mesh(track.stripRange(i0, i1, -W, W, H, H, 4), new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.9, side: THREE.DoubleSide })); group.add(ceil);
    for (const end of [i0, i1]) {   // portal faces
      const yaw = Math.atan2(track.tx[end], track.tz[end]);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2 * (W + 3), 1.8), brickMat);
      face.position.set(track.px[end], track.py[end] + H - 0.9, track.pz[end]); face.rotation.y = yaw; face.material.side = THREE.DoubleSide; group.add(face);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: plaqueTexture('玄武门'), toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3), side: THREE.DoubleSide }));
      plaque.material.side = THREE.FrontSide;
      plaque.position.set(track.px[end], track.py[end] + H - 0.9, track.pz[end]); plaque.rotation.y = yaw + Math.PI; plaque.translateZ(0.06); group.add(plaque);   // faces cars arriving
    }
    // warm lamps along the tunnel ceiling
    for (let i = i0 + 3; i < i1; i += 6) for (const o of [-3, 3]) lanterns.push([track.px[i] + track.nx[i] * o, track.py[i] + H - 0.7, track.pz[i] + track.nz[i] * o, 0.9]);
    const mid = Math.round((i0 + i1) / 2);
    pavilion(track.px[mid], track.py[mid] + H, track.pz[mid], Math.atan2(track.tx[mid], track.tz[mid]) + Math.PI / 2, 20, (i1 - i0) * track.step * 0.95, 2, 5.6);
  }

  // ---------- stone arch bridge over the canal ----------
  {
    // Bridge body built along the road (it curves here): two spandrel walls from the deck down to the water,
    // with a semicircular arch cut from below, plus the arch soffit. The arch crown stays 0.7 m under the deck.
    const mid = Math.round((ab[0] + ab[1]) / 2), yaw = Math.atan2(track.tx[mid], track.tz[mid]);
    const R = 8.5, crown = Math.max(1.2, track.py[mid] - 0.7);
    const bottom = i => { const d = (i - mid) * track.step; return Math.abs(d) < R ? crown * Math.sqrt(1 - (d / R) ** 2) : -0.4; };
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xbdb5a6, roughness: 0.75, side: THREE.DoubleSide });
    const W = E + 0.4, i0 = ab[0] - 6, i1 = ab[1] + 6;
    for (const sd of [-1, 1]) group.add(new THREE.Mesh(track.stripRange(i0, i1, sd * W, sd * W, i => bottom(i) - track.py[i], -0.05), bridgeMat));
    group.add(new THREE.Mesh(track.stripRange(i0, i1, -W, W, i => bottom(i) - track.py[i], i => bottom(i) - track.py[i], 2), bridgeMat));
    // keystone ring outlining the arch on both faces
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 24; k++) { const a = Math.PI * k / 24, d = -Math.cos(a) * R, i = Math.max(0, Math.min(track.N - 1, mid + Math.round(d / track.step))); pts.push(new THREE.Vector3(track.px[i] + track.nx[i] * sd * (W + 0.05), Math.sin(a) * crown, track.pz[i] + track.nz[i] * sd * (W + 0.05))); }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.22, 6, false), new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.8 })));
    }
    // marble balustrades with lion posts
    for (const s of [-1, 1]) {
      group.add(new THREE.Mesh(track.stripRange(ab[0] - 4, ab[1] + 4, s * (E + 0.2), s * (E + 0.2), 0.05, 0.95, 3), marble));
      group.add(new THREE.Mesh(track.stripRange(ab[0] - 4, ab[1] + 4, s * (E + 0.02), s * (E + 0.38), 0.95, 0.95, 3), marble));
      for (let i = ab[0] - 4; i <= ab[1] + 4; i += 4) { const p = add(new THREE.BoxGeometry(0.4, 1.3, 0.4), marble, track.px[i] + track.nx[i] * s * (E + 0.2), track.py[i] + 0.65, track.pz[i] + track.nz[i] * s * (E + 0.2)); p.rotation.y = yaw; }
      lanterns.push([track.px[ab[0] - 4] + track.nx[ab[0] - 4] * s * (E + 0.2), track.py[ab[0] - 4] + 2.1, track.pz[ab[0] - 4] + track.nz[ab[0] - 4] * s * (E + 0.2), 1.2]);
      lanterns.push([track.px[ab[1] + 4] + track.nx[ab[1] + 4] * s * (E + 0.2), track.py[ab[1] + 4] + 2.1, track.pz[ab[1] + 4] + track.nz[ab[1] + 4] * s * (E + 0.2), 1.2]);
    }
    marble.side = THREE.DoubleSide;
  }

  // ---------- seven-storey pagoda ----------
  {
    const [px, pz] = PAGODA;
    add(new THREE.CylinderGeometry(13, 14, 2.2, 8), stone, px, 1.1, pz);
    let y = 2.2, rad = 9;
    const pagodaTex = latticeTexture(13); pagodaTex.repeat.set(2, 1);
    const pagodaMat = panelMat(pagodaTex); pagodaMat.emissiveIntensity = 0.85;
    for (let k = 0; k < 7; k++) {
      const h = 5 - k * 0.25;
      add(new THREE.CylinderGeometry(rad * 0.92, rad, h, 8, 1, false, Math.PI / 8), pagodaMat, px, y + h / 2, pz);
      const roof = add(new THREE.CylinderGeometry(rad * 0.62, rad + 2.6, 1.5, 8, 1, false, Math.PI / 8), tile, px, y + h + 0.7, pz);
      const eave = add(new THREE.CylinderGeometry(rad + 2.6, rad + 2.4, 0.35, 8, 1, false, Math.PI / 8), lacquer, px, y + h - 0.05, pz);
      for (let c = 0; c < 8; c++) { const a = (c / 8) * Math.PI * 2; lanterns.push([px + Math.cos(a) * (rad + 2.3), y + h - 0.7, pz + Math.sin(a) * (rad + 2.3), 1.1]); }
      y += h + 1.4; rad *= 0.86;
    }
    add(new THREE.ConeGeometry(1.4, 6, 8), gold, px, y + 3, pz);
    for (let k = 0; k < 4; k++) add(new THREE.SphereGeometry(0.9 - k * 0.15, 12, 8), gold, px, y + 1 + k * 1.3, pz);
    // the pagoda's light spilling on the ground
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,150,80,0.2)', 'rgba(255,130,60,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(px, 0.06, pz); group.add(glow);
  }

  // ---------- houses and shops ----------
  const houses = [];   // [x, z, w, d, storeys, yaw, facesRoad]
  const clear = (x, z, w, d, yaw) => {
    if (x < RING.x0 + 16 || x > RING.x1 - 16 || z < RING.z0 + 16 || z > RING.z1 - 16) return false;
    if (Math.hypot(x - PAGODA[0], z - PAGODA[1]) < 28 + Math.max(w, d) / 2) return false;
    if (z > CANAL.z0 - 6 - d / 2 && z < CANAL.z1 + 6 + d / 2 && x > CANAL.x0 - 8) return false;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = a * w / 2, lz = b * d / 2, X = x + lx * c + lz * s, Z = z - lx * s + lz * c;
      const nr = near(X, Z);
      if (nr.d < E + 5 + (nr.i >= 0 && track.py[nr.i] > 0.8 ? 6 : 0)) return false;
    }
    return !houses.some(([hx, hz, hw, hd]) => Math.abs(hx - x) < (hw + w) / 2 + 1.5 && Math.abs(hz - z) < (hd + d) / 2 + 1.5 && Math.hypot(hx - x, hz - z) < (Math.max(hw, hd) + Math.max(w, d)) / 2 + 1);
  };
  // shopfronts lining the ground-level streets
  for (let i = 0; i < track.N; i += 9) {
    if (track.py[i] > 0.6) continue;
    for (const s of [-1, 1]) {
      const w = 11 + r() * 7, d = 10 + r() * 6, off = E + 6.5 + d / 2;
      const x = track.px[i] + track.nx[i] * off * s, z = track.pz[i] + track.nz[i] * off * s;
      const yaw = Math.atan2(track.tx[i], track.tz[i]) + Math.PI / 2;
      if (clear(x, z, w, d, yaw)) houses.push([x, z, w, d, r() < 0.55 ? 2 : 1, yaw, s, i]);
    }
  }
  // the rest of the city: courtyard houses on a jittered grid
  for (let x = RING.x0 + 30; x < RING.x1 - 20; x += 27) for (let z = RING.z0 + 30; z < RING.z1 - 20; z += 27) {
    const w = 12 + r() * 8, d = 10 + r() * 7, X = x + (r() - 0.5) * 8, Z = z + (r() - 0.5) * 8, yaw = r() < 0.5 ? 0 : Math.PI / 2;
    if (clear(X, Z, w, d, yaw)) houses.push([X, Z, w, d, r() < 0.25 ? 2 : 1, yaw, 0, -1]);
  }
  const storeyH = 4.6;
  const bodyMats = [panelA, panelB].map(mm => { const t = mm.map.clone(); t.repeat.set(1, 1); return mm; });
  const twoA = panelMat((() => { const t = latticeTexture(21); t.repeat.set(1, 2); return t; })());
  const sets = [[], []];
  houses.forEach(h => sets[h[4] - 1].push(h));
  sets.forEach((list, si) => {
    if (!list.length) return;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), si ? twoA : bodyMats[0], list.length);
    list.forEach(([x, z, w, d, st, yaw], k) => { e4.set(0, yaw, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, st * storeyH / 2, z), q4, new THREE.Vector3(w, st * storeyH, d)); body.setMatrixAt(k, m4); });
    group.add(body);
  });
  const roofs = new THREE.InstancedMesh(roofGeo, tile, houses.length), eaves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), timber, houses.length);
  houses.forEach(([x, z, w, d, st, yaw, s, i], k) => {
    e4.set(0, yaw, 0); q4.setFromEuler(e4);
    const top = st * storeyH;
    m4.compose(new THREE.Vector3(x, top + 0.35, z), q4, new THREE.Vector3(w + 3.2, 3 + st * 0.6, d + 3.2)); roofs.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3(x, top + 0.18, z), q4, new THREE.Vector3(w + 2.6, 0.36, d + 2.6)); eaves.setMatrixAt(k, m4);
    if (s) {   // lanterns at the front eave corners of shops facing the street
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      for (const a of [-1, 1]) {
        const lx = a * (w / 2 + 0.6), lz = s * (d / 2 + 1.0);
        // building local frame: x along yaw, z across; front faces the road
        const X = x + lx * c + lz * sn, Z = z - lx * sn + lz * c;
        lanterns.push([X, top - 0.6, Z, 1]);
      }
    }
  });
  group.add(roofs, eaves);

  // vertical shop banners sticking out over the pavement, facing the traffic
  const words = ['茶', '酒', '面馆', '客栈', '当', '药铺', '绸缎', '灯会', '福', '元宵', '汤圆', '糖人', '书', '香'];
  const bannerTex = words.map((w, k) => bannerCharTexture(w, k % 3 === 2 ? '#1b2a4a' : '#a3201a', k % 3 === 2 ? '#f0c95a' : '#ffe7b0'));
  houses.forEach(([x, z, w, d, st, yaw, s, i]) => {
    if (!s || r() > 0.55) return;
    const t = bannerTex[Math.floor(r() * bannerTex.length)], hh = 0.85 * (t.image.height / 96);
    const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.DoubleSide });
    const ti = i, a = r() < 0.5 ? -1 : 1, c = Math.cos(yaw), sn = Math.sin(yaw);
    const lx = a * (w / 2 - 1.2), lz = s * (d / 2 + 1.1);
    const X = x + lx * c + lz * sn, Z = z - lx * sn + lz * c;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.85, hh), mat);
    p.position.set(X, Math.min(st * storeyH - 0.8, 3.4 + hh / 2), Z); p.rotation.y = Math.atan2(track.tx[ti], track.tz[ti]) + Math.PI;
    group.add(p);
  });

  // ---------- lantern strings across the streets ----------
  const cords = [], poles = [], pools = [];
  for (let i = 4; i < track.N; i += Math.round(17 / track.step)) {
    if (track.py[i] > 0.6 || (i > ab[0] - 10 && i < ab[1] + 10)) continue;
    const y = 7.6, P = s => new THREE.Vector3(track.px[i] + track.nx[i] * s * (E + 1.1), y, track.pz[i] + track.nz[i] * s * (E + 1.1));
    const a = P(-1), b = P(1);
    poles.push(a.clone(), b.clone());
    let prev = a;
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 1.4;
      cords.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); prev = p;
      if (k < 8 && k % 2 === 1 || k === 4) lanterns.push([p.x, p.y - 0.75, p.z, 1.15]);
    }
    pools.push([track.px[i], track.pz[i]]);
  }
  const cordGeo = new THREE.BufferGeometry(); cordGeo.setAttribute('position', new THREE.Float32BufferAttribute(cords, 3));
  group.add(new THREE.LineSegments(cordGeo, new THREE.LineBasicMaterial({ color: 0x2a1a12 })));
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 7.8, 8).translate(0, 3.9, 0), lacquer, poles.length);
  poles.forEach((p, k) => { m4.makeTranslation(p.x, 0, p.z); poleMesh.setMatrixAt(k, m4); });
  group.add(poleMesh);
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,110,60,0.07)', 'rgba(255,90,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), pools.length);
  pools.forEach(([x, z], k) => { e4.set(-Math.PI / 2, 0, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, 0.05, z), q4, one); poolMesh.setMatrixAt(k, m4); });
  poolMesh.renderOrder = 1; group.add(poolMesh);
  // lanterns along the wall-top parapets, with their warm light on the paving (the wall is otherwise dark)
  const wallPools = [];
  for (const [a, b] of track.raisedRuns || []) for (let i = a + 3; i < b; i += Math.round(11 / track.step)) for (const s of [-1, 1]) {
    if (i >= tw[0] && i <= tw[1]) continue;
    lanterns.push([track.px[i] + track.nx[i] * s * (E + 0.7), track.py[i] + 2.9, track.pz[i] + track.nz[i] * s * (E + 0.7), 1.1]);
    wallPools.push([track.px[i] + track.nx[i] * s * (E - 2.5), track.py[i] + 0.06, track.pz[i] + track.nz[i] * s * (E - 2.5)]);
  }
  const wpMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,140,70,0.24)', 'rgba(255,110,50,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), wallPools.length);
  wallPools.forEach(([x, y, z], k) => { e4.set(-Math.PI / 2, 0, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, y, z), q4, one); wpMesh.setMatrixAt(k, m4); });
  wpMesh.renderOrder = 1; group.add(wpMesh);
  // stone lanterns along the canal banks, with their reflections streaking on the water
  const streaks = [];
  for (let x = CANAL.x0 + 10; x < CANAL.x1 - 6; x += 16) for (const z of [CANAL.z0 - 1.2, CANAL.z1 + 1.2]) {
    if (Math.abs(x - 302) < 16) continue;
    add(new THREE.BoxGeometry(0.7, 1.6, 0.7), stone, x, 0.8, z);
    lanterns.push([x, 2.1, z, 0.9]);
    streaks.push([x, z + (z < -392 ? 3.5 : -3.5)]);
  }
  const streakMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,120,60,0.4)', 'rgba(255,90,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const streakMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 9), streakMat, streaks.length + 7);
  streaks.forEach(([x, z], k) => { e4.set(-Math.PI / 2, 0, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, 0.08, z), q4, one); streakMesh.setMatrixAt(k, m4); });
  for (let k = 0; k < 7; k++) { e4.set(-Math.PI / 2, 0, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(PAGODA[0] + (k - 3) * 2.6, 0.08, CANAL.z0 + 7), q4, new THREE.Vector3(1.4, 1.5, 1)); streakMesh.setMatrixAt(streaks.length + k, m4); }
  streakMesh.renderOrder = 1; group.add(streakMesh);

  // ---------- giant festival lanterns (造型花灯) ----------
  const bigSpots = [], bigAnim = [];
  // lit-from-within but still shaded by the night light, so the figures keep their form instead of blooming into blobs
  const glowM = (r_, g_, b_) => {
    const mx = Math.max(r_, g_, b_), base = new THREE.Color(r_ / mx, g_ / mx, b_ / mx);
    return new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.42 * mx, roughness: 0.55 });
  };
  const ball = (mat, sx, sy, sz, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };
  const cartMat = M(0x5a1410, { roughness: 0.6 });
  const roadside = (dist, side, extra = 3.6) => {
    const i = Math.round(dist / track.step), off = side * (E + extra);
    return { x: track.px[i] + track.nx[i] * off, z: track.pz[i] + track.nz[i] * off, yaw: Math.atan2(track.tx[i], track.tz[i]), i };
  };
  // 玉兔灯: a glowing white rabbit on a red float, facing the traffic
  function rabbit(dist, side) {
    const p = roadside(dist, side, 4.2), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw + Math.PI + side * 0.5; g.scale.setScalar(1.3);
    const white = glowM(1.25, 1.2, 1.12), pink = glowM(1.3, 0.45, 0.6), red = glowM(1.4, 0.05, 0.05);
    const cart = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 4.2), cartMat); cart.position.y = 0.6; g.add(cart);
    for (const [wx, wz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 14).rotateZ(Math.PI / 2), M(0x2a1a10)); w.position.set(wx, 0.45, wz); g.add(w); }
    ball(white, 1.5, 1.35, 1.9, 0, 2.35, -0.3, g);                         // body
    ball(white, 1.05, 1.0, 1.05, 0, 3.7, 1.15, g);                          // head
    for (const sx of [-1, 1]) {
      const ear = ball(white, 0.28, 1.25, 0.38, sx * 0.42, 5.2, 0.9, g); ear.rotation.z = -sx * 0.18;
      const inner = ball(pink, 0.14, 0.95, 0.12, sx * 0.42, 5.2, 1.18, g); inner.rotation.z = -sx * 0.18;
      ball(red, 0.13, 0.13, 0.08, sx * 0.42, 3.85, 2.12, g);                // eyes
      ball(white, 0.42, 0.3, 0.6, sx * 0.7, 1.45, 1.1, g);                   // front paws
    }
    ball(pink, 0.12, 0.09, 0.08, 0, 3.55, 2.2, g);                          // nose
    ball(white, 0.5, 0.5, 0.5, 0, 2.3, -2.35, g);                           // tail
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5), M(0x2a1a10)); pole.position.set(1.3, 2, 1.8); g.add(pole);
    group.add(g); bigSpots.push([p.x, p.z, 5]);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,240,230,0.28)', 'rgba(255,220,200,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, 0.07, p.z); group.add(halo);
  }
  // 宫灯: hexagonal palace lantern on a tall pole with a curved hook
  function palace(dist, side, h = 7) {
    const p = roadside(dist, side, 2.2), g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h), lacquer); pole.position.y = h / 2; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), lacquer); arm.position.set(0, h - 0.1, 0.7); g.add(arm);
    const L = new THREE.Group(); L.position.set(0, h - 1.5, 1.4); g.add(L);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 6), glowM(1.35, 0.25, 0.08)); L.add(body);
    for (const y of [0.85, -0.85]) { const rim = new THREE.Mesh(new THREE.CylinderGeometry(y > 0 ? 0.5 : 0.9, y > 0 ? 0.95 : 0.6, 0.3, 6), gold); rim.position.y = y; L.add(rim); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.8), glowM(1.3, 0.15, 0.05)); ts.position.set(Math.cos(a) * 0.85, -1.4, Math.sin(a) * 0.85); L.add(ts); }
    g.rotation.y = p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    group.add(g); bigSpots.push([p.x, p.z, 1.5]);
    bigAnim.push(t => { L.rotation.z = Math.sin(t * 1.1 + dist) * 0.06; L.rotation.y = t * 0.3; });
  }
  // 福 lantern: big square red lantern with a gold 福 on every face
  const fuTex = bannerCharTexture('福', '#b01a12', '#ffd76a');
  function fu(dist, side) {
    const p = roadside(dist, side, 2.4), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5), lacquer); pole.position.y = 3.25; g.add(pole);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ map: fuTex, color: new THREE.Color(1.35, 1.3, 1.3), toneMapped: false })); cube.position.y = 7.6; cube.rotation.y = Math.PI / 4; g.add(cube);
    for (const y of [6.5, 8.7]) { const c = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 2.3), gold); c.position.y = y; c.rotation.y = Math.PI / 4; g.add(c); }
    group.add(g); bigSpots.push([p.x, p.z, 1.5]);
    bigAnim.push(t => { cube.rotation.y = Math.PI / 4 + Math.sin(t * 0.6 + dist) * 0.25; });
  }
  // 鲤鱼灯: carp leaping out of the canal, with a splash ring
  function carp(x, z, face) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face;
    const fish = new THREE.Group(); g.add(fish);
    const orange = glowM(1.5, 0.42, 0.08), red = glowM(1.4, 0.12, 0.05), cream = glowM(1.3, 1.1, 0.8), gld = glowM(1.6, 1.1, 0.25);
    ball(orange, 2.6, 1.15, 0.85, 0, 0, 0, fish);
    ball(cream, 2.0, 0.6, 0.6, 0.2, -0.45, 0, fish);
    for (const sz of [-1, 1]) { ball(gld, 0.2, 0.2, 0.1, 1.9, 0.25, sz * 0.62, fish); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 4).rotateZ(Math.PI / 2), red); tail.position.set(-3.1, 0, 0); tail.scale.set(1, 1, 0.25); fish.add(tail);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 4), red); fin.position.set(0, 1.2, 0); fin.scale.set(1.6, 1, 0.2); fish.add(fin);
    for (const sz of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 1.6), gld); wh.position.set(2.5, -0.2, sz * 0.3); wh.rotation.z = 1.1; fish.add(wh); }
    fish.rotation.z = 0.55;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 30).rotateX(Math.PI / 2), glowM(0.9, 0.95, 1.0)); ring.position.y = 0.12; g.add(ring);
    group.add(g);
    bigAnim.push(t => { const k = Math.sin(t * 0.9 + x); fish.position.y = 2.2 + k * 0.6; fish.rotation.z = 0.55 + k * 0.15; ring.scale.setScalar(1 + (t * 0.5 + x) % 1 * 0.6); });
  }
  // 莲花灯: giant floating lotus
  function lotusBig(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0.1, z);
    const pinkM = glowM(1.35, 0.5, 0.72), deep = glowM(1.25, 0.25, 0.5);
    for (const [n_, r0, tilt, sc, mat] of [[10, 1.6, 1.0, 1.3, pinkM], [8, 0.9, 0.55, 1.0, deep]]) for (let k = 0; k < n_; k++) {
      const a = k / n_ * Math.PI * 2 + (r0 < 1 ? 0.3 : 0);
      const pet = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat); pet.scale.set(0.5 * sc, 1.25 * sc, 0.22 * sc);
      pet.position.set(Math.cos(a) * r0, 0.9 * sc, Math.sin(a) * r0); pet.rotation.order = 'YXZ'; pet.rotation.y = -a + Math.PI / 2; pet.rotation.x = -tilt * 0.6; g.add(pet);
    }
    ball(glowM(1.8, 1.4, 0.35), 0.55, 0.35, 0.55, 0, 0.9, 0, g);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24).rotateX(-Math.PI / 2), M(0x1f4a2a, { roughness: 0.8 })); pad.position.y = -0.05; g.add(pad);
    group.add(g);
    bigAnim.push(t => { g.rotation.y = t * 0.08 + x; g.position.y = 0.1 + Math.sin(t + x) * 0.05; });
  }
  for (const [d, sd] of [[150, -1], [270, 1], [430, -1], [560, 1], [1660, 1], [1830, -1], [2010, 1], [2180, -1]]) rabbit(d, sd);
  for (const d of [40, 330, 470, 1600, 1950, 2120, 2300]) for (const sd of [-1, 1]) palace(d, sd);
  for (const [d, sd] of [[90, 1], [200, -1], [500, -1], [1720, -1], [1880, 1], [2250, 1]]) fu(d, sd);
  carp(250, -392, 0.2); carp(372, -393, Math.PI - 0.2); carp(-120, -391, 0.1);
  lotusBig(-30, -392); lotusBig(110, -392); lotusBig(-230, -393);

  // ---------- lion dance (舞狮) under the paifang ----------
  const lions = [];
  function lion(dist, side, colA, colB) {
    const i = Math.round(dist / track.step), off = side * (E + 3.4);
    const g = new THREE.Group(); g.position.set(track.px[i] + track.nx[i] * off, 0, track.pz[i] + track.nz[i] * off);
    g.rotation.y = Math.atan2(track.tx[i], track.tz[i]) + Math.PI - side * 0.9;   // turned toward the oncoming cars
    const furA = new THREE.MeshStandardMaterial({ color: colA, roughness: 0.8, emissive: colA, emissiveIntensity: 0.25 });
    const furB = new THREE.MeshStandardMaterial({ color: colB, roughness: 0.8, emissive: colB, emissiveIntensity: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.2 });
    const dark = M(0x111111), legM = M(0xe8d090);
    const body = new THREE.Group(); g.add(body);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), furA); torso.scale.set(0.95, 0.75, 1.6); torso.position.set(0, 1.45, -0.6); body.add(torso);
    for (let k = 0; k < 7; k++) { const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), furB); tuft.position.set(0, 2.1 - k * 0.04, 0.4 - k * 0.38); body.add(tuft); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), furB); tail.position.set(0, 1.7, -2.3); tail.rotation.x = -1.1; body.add(tail);
    const head = new THREE.Group(); head.position.set(0, 2.0, 1.0); body.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), furA); skull.scale.set(1, 0.9, 0.95); head.add(skull);
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.6, 1.0), toneMapped: false })); mirror.position.set(0, 0.55, 0.62); mirror.rotation.x = -0.4; head.add(mirror);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 8), furB); horn.position.set(0, 0.95, 0.15); head.add(horn);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), white); eye.position.set(sx * 0.35, 0.2, 0.68); head.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), dark); pupil.position.set(sx * 0.36, 0.2, 0.86); head.add(pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), furB); brow.position.set(sx * 0.35, 0.45, 0.66); brow.rotation.z = sx * 0.3; head.add(brow);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), furB); ear.scale.set(1, 1.4, 0.5); ear.position.set(sx * 0.7, 0.55, 0.1); head.add(ear);
    }
    const jaw = new THREE.Group(); jaw.position.set(0, -0.35, 0.3); head.add(jaw);
    const lip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), furB); lip.scale.set(1, 0.5, 1.1); jaw.add(lip);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 8), white); beard.position.set(0, -0.35, 0.3); beard.rotation.x = Math.PI; jaw.add(beard);
    // the two dancers' legs under the costume (yellow trousers)
    const legs = [];
    for (const [lx, lz] of [[-0.35, 0.6], [0.35, 0.6], [-0.35, -1.6], [0.35, -1.6]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.0, 8).translate(0, -0.5, 0), legM); l.position.set(lx, 1.0, lz); g.add(l); legs.push(l); }
    group.add(g);
    lions.push({ g, body, head, jaw, legs, ph: dist * 0.1 + side });
    bigSpots.push([g.position.x, g.position.z, 3.5]);
  }
  lion(28, -1, 0xd8241a, 0xf2c230);
  lion(28, 1, 0xf0b81e, 0xc81e1e);
  const lionDance = t => {
    for (const L of lions) {
      const tt = t * 2.4 + L.ph;
      const hop = Math.max(0, Math.sin(tt)) ** 2;
      const rear = Math.max(0, Math.sin(t * 0.45 + L.ph) - 0.6) * 2.5;   // now and then the lion rears up
      L.body.position.y = hop * 0.35 + rear * 0.4;
      L.body.rotation.x = -rear * 0.35;
      L.head.rotation.y = Math.sin(tt * 0.5) * 0.6;
      L.head.rotation.z = Math.sin(tt * 0.9) * 0.2;
      L.head.rotation.x = Math.sin(tt * 1.3) * 0.15;
      L.jaw.rotation.x = Math.max(0, Math.sin(tt * 2.1)) * 0.5;
      L.g.rotation.y += Math.sin(t * 0.3 + L.ph) * 0.002;
      L.legs.forEach((l, k) => { l.rotation.x = Math.sin(tt * 2 + k * 1.6) * 0.35; l.position.y = 1.0 + (k < 2 ? L.body.position.y + rear * 0.3 : L.body.position.y * 0.5); });
    }
  };

  // ---------- festival life: river lanterns, painted boats, willows, crowds, dragon dance, lantern gates ----------
  const lotusN = Math.round(240 * Math.max(0.5, quality));
  const lotus = new THREE.InstancedMesh(new THREE.ConeGeometry(0.45, 0.28, 8, 1, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.32, 0.45), toneMapped: false, side: THREE.DoubleSide }), lotusN);
  const flame = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, 0.4), toneMapped: false }), lotusN);
  const lotusData = Array.from({ length: lotusN }, () => ({ x: CANAL.x0 + r() * (CANAL.x1 - CANAL.x0), z: CANAL.z0 + 1.5 + r() * (CANAL.z1 - CANAL.z0 - 3), v: 0.4 + r() * 0.6, p: r() * 6.28 }));
  group.add(lotus, flame);

  // 画舫: hull, cabin with lit lattice, upturned roof, lanterns fore and aft
  const boats = [];
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 1.1, 3.4), timber); hull.position.y = 0.35; b.add(hull);
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.7, 2.4, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4), timber); bow.position.set(6.6, 0.45, 0); b.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 2.8), panelA); cabin.position.y = 2; b.add(cabin);
    const rf = new THREE.Mesh(roofGeo, tile); rf.scale.set(7.6, 1.4, 4); rf.position.y = 3.1; b.add(rf);
    for (const lx of [-4.8, 4.8, -2.6, 2.6]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8).scale(1, 1.3, 1), new THREE.MeshBasicMaterial({ color: lanternColor, toneMapped: false })); l.position.set(lx, Math.abs(lx) > 4 ? 2.4 : 3.4, Math.abs(lx) > 4 ? 0 : 1.5); b.add(l); }
    b.position.set(-280 + k * 190, 0.05, -392 + (k - 1) * 3); b.userData = { x0: -310, x1: 270, dir: k % 2 ? -1 : 1, v: 2 + r() * 1.2 };
    group.add(b); boats.push(b);
  }

  // willows along both canal banks
  const wl = [];
  for (let x = CANAL.x0 + 6; x < CANAL.x1 - 4; x += 22 + r() * 8) for (const z of [CANAL.z0 - 5, CANAL.z1 + 5]) if (Math.abs(x - 302) > 22 && Math.hypot(x - PAGODA[0], z - PAGODA[1]) > 30) wl.push([x + (r() - 0.5) * 6, z]);
  const wTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.45, 5, 7).translate(0, 2.5, 0), timber, wl.length);
  const crownGeo = new THREE.SphereGeometry(3.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.25, 1).translate(0, 5.2, 0);
  const wCrown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), wl.length);
  wl.forEach(([x, z], k) => { const sc = 0.8 + r() * 0.5; e4.set(0, r() * 6.28, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, 0, z), q4, new THREE.Vector3(sc, sc, sc)); wTrunk.setMatrixAt(k, m4); wCrown.setMatrixAt(k, m4); });
  group.add(wTrunk, wCrown);

  // crowds on the pavements: simple figures, some carrying hand lanterns
  const people = [];
  for (let i = 0; i < track.N; i += 2) {
    if (track.py[i] > 0.6 || (i > ab[0] - 12 && i < ab[1] + 12)) continue;
    for (const sd of [-1, 1]) {
      if (r() > 0.55 * Math.max(0.5, quality)) continue;
      const off = sd * (E + 1.4 + r() * 4);
      const x = track.px[i] + track.nx[i] * off + (r() - 0.5), z = track.pz[i] + track.nz[i] * off + (r() - 0.5);
      if (bigSpots.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br + 1.2)) continue;
      people.push([x, z, r() * 6.28, 0.9 + r() * 0.2]);
    }
  }
  const robeCols = [0x8e1a12, 0x1f3a5c, 0x2e5e3a, 0xb8862a, 0x5a2a5e, 0xd8cfc0, 0x7a3a1a, 0x2a2a30];
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 1.35, 7).translate(0, 0.68, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), people.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6).translate(0, 1.55, 0), new THREE.MeshStandardMaterial({ color: 0xd9a87c, roughness: 0.8 }), people.length);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.7 }), people.length);
  const handL = [];
  const tint = new THREE.Color();
  people.forEach(([x, z, a, sc], k) => {
    e4.set(0, a, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, 0, z), q4, new THREE.Vector3(sc, sc, sc));
    body.setMatrixAt(k, m4); head.setMatrixAt(k, m4); hair.setMatrixAt(k, m4);
    body.setColorAt(k, tint.set(robeCols[Math.floor(r() * robeCols.length)]));
    if (r() < 0.22) handL.push([x + Math.cos(a) * 0.35, 1.05 * sc, z - Math.sin(a) * 0.35]);
  });
  group.add(body, head, hair);
  for (const [x, y, z] of handL) lanterns.push([x, y, z, 0.42]);

  // dragon dance circling the pagoda
  const SEG = 22, dragon = [];
  const dGold = new THREE.MeshStandardMaterial({ color: 0xe0b040, roughness: 0.4, metalness: 0.6, emissive: 0x6a3a00, emissiveIntensity: 0.6 });
  const dRed = new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.5, emissive: 0x500a04, emissiveIntensity: 0.7 });
  for (let k = 0; k < SEG; k++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(k === 0 ? 0.95 : 0.7 - k * 0.012, 10, 8).scale(1.4, 1, 1), k === 0 ? dRed : (k % 2 ? dGold : dRed));
    group.add(seg); dragon.push(seg);
  }
  const dHorns = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 6), dGold); dragon[0].add(dHorns); dHorns.position.set(0.2, 0.9, 0.35); dHorns.rotation.z = -0.4;
  const dHorn2 = dHorns.clone(); dHorn2.position.z = -0.35; dragon[0].add(dHorn2);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.4), toneMapped: false })); group.add(pearl);
  const dancers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8 }), SEG);
  group.add(dancers);

  // lantern gates (彩门) spanning the avenue and the west street
  const gateTex = plaqueTexture('元宵灯会');
  for (const dist of [110, 210, 1760, 1900]) {
    const i = Math.round(dist / track.step), yaw = Math.atan2(track.tx[i], track.tz[i]);
    const g = new THREE.Group(); g.position.set(track.px[i], track.py[i], track.pz[i]); g.rotation.y = yaw;
    const W = E + 1.2;
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), lacquer); p.position.set(sd * W, 4.5, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 1.6, 0.7, 0.7), lacquer); beam.position.y = 8.8; g.add(beam);
    // glowing arch of small lights
    const glow = new THREE.Mesh(new THREE.TorusGeometry(W - 0.2, 0.12, 6, 40, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.3), toneMapped: false })); glow.position.y = 2.2; glow.scale.y = 0.85; g.add(glow);
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.35), new THREE.MeshBasicMaterial({ map: gateTex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3), side: THREE.DoubleSide })); plq.position.set(0, 10, 0); g.add(plq);
    const rf = new THREE.Mesh(roofGeo, tile); rf.scale.set(2 * W + 3, 1.6, 2.2); rf.position.y = 10.8; g.add(rf);
    group.add(g);
    for (const sd of [-1, -0.45, 0.45, 1]) { const p = new THREE.Vector3(sd * W * 0.95, 7.7, 0).applyEuler(new THREE.Euler(0, yaw, 0)); lanterns.push([track.px[i] + p.x, track.py[i] + p.y, track.pz[i] + p.z, 1.6]); }
  }

  const festival = (t, dt) => {
    for (let k = 0; k < lotusN; k++) {
      const L = lotusData[k]; L.x += L.v * dt; if (L.x > CANAL.x1 - 2) L.x = CANAL.x0 + 2;
      const y = 0.12 + Math.sin(t * 1.3 + L.p) * 0.04;
      m4.makeTranslation(L.x, y, L.z + Math.sin(t * 0.4 + L.p) * 0.4); lotus.setMatrixAt(k, m4);
      m4.makeTranslation(L.x, y + 0.22, L.z + Math.sin(t * 0.4 + L.p) * 0.4); flame.setMatrixAt(k, m4);
    }
    lotus.instanceMatrix.needsUpdate = flame.instanceMatrix.needsUpdate = true;
    for (const b of boats) {
      const u = b.userData; b.position.x += u.dir * u.v * dt;
      if (b.position.x > u.x1) u.dir = -1; if (b.position.x < u.x0) u.dir = 1;
      b.rotation.y = u.dir > 0 ? 0 : Math.PI; b.rotation.z = Math.sin(t * 0.8 + u.v) * 0.02;
    }
    // dragon: a pearl leads round the plaza, each segment follows on a weaving, rising path
    const R0 = 19, sp = 0.32;
    for (let k = 0; k < SEG; k++) {
      const a = t * sp - k * 0.075, rr = R0 + Math.sin(t * 1.6 - k * 0.5) * 1.3;
      const x = PAGODA[0] + Math.cos(a) * rr, z = PAGODA[1] + Math.sin(a) * rr, y = 2.2 + Math.sin(t * 3.2 - k * 0.55) * 0.9;
      dragon[k].position.set(x, y, z); dragon[k].rotation.y = -a;
      m4.makeTranslation(x, 0, z); dancers.setMatrixAt(k, m4);
    }
    const pa = t * sp + 0.25; pearl.position.set(PAGODA[0] + Math.cos(pa) * R0, 3 + Math.sin(t * 4) * 0.5, PAGODA[1] + Math.sin(pa) * R0);
    dancers.instanceMatrix.needsUpdate = true;
  };

  // all lanterns: one instanced draw, glowing (bloom picks them up), with gold caps
  const lanternGeo = new THREE.SphereGeometry(0.5, 12, 9); lanternGeo.scale(1, 1.3, 1);
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, new THREE.MeshBasicMaterial({ color: lanternColor, toneMapped: false }), lanterns.length);
  const capMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 0.16, 10), new THREE.MeshBasicMaterial({ color: 0x7a5a1c }), lanterns.length * 2);
  lanterns.forEach(([x, y, z, s], k) => {
    m4.compose(new THREE.Vector3(x, y, z), q4.identity(), new THREE.Vector3(s, s, s)); lanternMesh.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3(x, y + 0.66 * s, z), q4, new THREE.Vector3(s, s, s)); capMesh.setMatrixAt(k * 2, m4);
    m4.compose(new THREE.Vector3(x, y - 0.66 * s, z), q4, new THREE.Vector3(s, s, s)); capMesh.setMatrixAt(k * 2 + 1, m4);
  });
  group.add(lanternMesh, capMesh);
  // sway: each lantern swings like a pendulum hung from ~0.9 m above its centre; phase from its position
  const swayU = { value: 0 };
  const swayIt = (mat, pivotUp) => {
    mat.onBeforeCompile = sh => {
      sh.uniforms.swayT = swayU;
      sh.vertexShader = 'uniform float swayT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = ip.x * 0.37 + ip.z * 0.23 + ip.y * 0.5;
          float arm = ${pivotUp.toFixed(2)} - transformed.y;
          float sw = sin(swayT * 1.7 + ph) * 0.11 + sin(swayT * 0.63 + ph * 1.7) * 0.07;
          transformed.x += sin(sw) * arm; transformed.y += (1.0 - cos(sw)) * arm;
          transformed.z += sin(sw * 0.7 + 1.3) * arm * 0.5;
        }`);
    };
  };
  swayIt(lanternMesh.material, 0.9); swayIt(capMesh.material, 0.9);

  // ---------- snowfall around the camera ----------
  const SNOW = Math.round(3500 * Math.max(0.4, quality)), BOX = 90, HGT = 40;
  const snowPos = new Float32Array(SNOW * 3), snowSeed = new Float32Array(SNOW * 4);
  for (let k = 0; k < SNOW; k++) snowSeed.set([r() * BOX, r() * HGT, r() * BOX, 0.6 + r() * 0.9], k * 4);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const flake = tex(canvas(32, 32, (g2, w) => { const gr = g2.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, w); }), { repeat: false });
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: flake, size: 0.22, transparent: true, depthWrite: false, color: 0xfff1e6, opacity: 0.9 }));
  snow.frustumCulled = false; group.add(snow);
  const snowFall = (t, cam) => {
    if (!cam) return;
    const cx = cam.position.x - BOX / 2, cy = cam.position.y - HGT / 2, cz = cam.position.z - BOX / 2;
    for (let k = 0; k < SNOW; k++) {
      const j = k * 4, sp = snowSeed[j + 3];
      let x = (snowSeed[j] + Math.sin(t * 0.5 * sp + k) * 1.2 + t * 0.8 - cx) % BOX; if (x < 0) x += BOX;
      let y = (snowSeed[j + 1] - t * 1.4 * sp - cy) % HGT; if (y < 0) y += HGT;
      let z = (snowSeed[j + 2] + Math.cos(t * 0.4 * sp + k) * 1.2 - cz) % BOX; if (z < 0) z += BOX;
      snowPos[k * 3] = cx + x; snowPos[k * 3 + 1] = cy + y; snowPos[k * 3 + 2] = cz + z;
    }
    snowGeo.attributes.position.needsUpdate = true;
  };
  // a light dusting of snow on the roofs: pale tops
  tile.color.set(0x3a404c);

  // ---------- distant mountains ----------
  {
    const seg = 160, pos = [], idx = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, R = 1700;
      const h = 90 + 110 * Math.abs(Math.sin(a * 3 + 1.3)) * (0.5 + 0.5 * Math.sin(a * 7.1)) + 40 * Math.sin(a * 13.7);
      pos.push(Math.cos(a) * R, -10, -190 + Math.sin(a) * R, Math.cos(a) * R, h, -190 + Math.sin(a) * R);
      if (k < seg) { const j = k * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0c0d1c, side: THREE.DoubleSide, fog: false })));
  }

  // ---------- fireworks ----------
  const fw = fireworks(group, quality, onBoom, onLaunch);
  // ---------- sky lanterns drifting up ----------
  const SKY = Math.round(380 * quality);
  const skyL = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.65, 0.22), toneMapped: false }), SKY);
  const sl = Array.from({ length: SKY }, () => ({ x: (r() - 0.5) * 1400, y: 10 + r() * 300, z: -190 + (r() - 0.5) * 1100, v: 0.8 + r() * 1.2, p: r() * 6.28 }));
  group.add(skyL);

  scene.add(group);
  return {
    update(t, dt, cam) {
      swayU.value = t; snowFall(t, cam); lionDance(t);
      waves.offset.set(t * 0.01, t * 0.006);
      festival(t, dt);
      for (const f of bigAnim) f(t);
      for (let k = 0; k < SKY; k++) {
        const L = sl[k]; L.y += L.v * dt; if (L.y > 320) { L.y = 8; L.x = (r() - 0.5) * 1400; L.z = -190 + (r() - 0.5) * 1100; }
        m4.makeTranslation(L.x + Math.sin(t * 0.3 + L.p) * 3, L.y, L.z + Math.cos(t * 0.23 + L.p) * 3); skyL.setMatrixAt(k, m4);
      }
      skyL.instanceMatrix.needsUpdate = true;
      fw.update(dt);
    },
    celebrate(x, y, z, h) { fw.celebrate(x, y, z, h); },
    lionSpot: (() => { const i = Math.round(28 / track.step); return new THREE.Vector3(track.px[i], 1.5, track.pz[i]); })(),
    get flash() { return fw.flash; },
  };
}

// ---------- fireworks: rockets that burst into thousands of sparks ----------
function fireworks(group, quality, onBoom, onLaunch) {
  const MAX = Math.round(14000 * Math.max(0.45, quality));
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), base = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX), age = new Float32Array(MAX), size = new Float32Array(MAX), drag = new Float32Array(MAX), twinkle = new Uint8Array(MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { map: { value: tex(canvas(32, 32, (g2, w) => {   // hot core, quick falloff: reads as a spark, not a puff
      const gr = g2.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, w, w);
    }), { repeat: false }) } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * 2600.0 / -mv.z, 2.0, 16.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a, 1.0); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; group.add(pts);
  window.__fw = { live: () => { let n = 0; for (let i = 0; i < MAX; i++) if (age[i] < life[i]) n++; return n; }, rockets: () => rockets.length };
  let cur = 0;
  const spawn = (x, y, z, vx, vy, vz, c, l, s, dr, tw) => {
    const i = cur; cur = (cur + 1) % MAX;
    pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); base.set(c, i * 3); col.set(c, i * 3);
    life[i] = l; age[i] = 0; size[i] = s; drag[i] = dr; twinkle[i] = tw ? 1 : 0;
  };
  const PAL = [[1.8, 0.12, 0.08], [1.8, 1.05, 0.15], [0.2, 1.6, 0.45], [0.25, 0.6, 1.9], [1.6, 0.2, 1.4], [1.7, 1.6, 1.3], [1.9, 0.55, 0.1]];
  const rockets = [];
  let timer = 1, finaleT = 8, flash = 0, flashC = new THREE.Color();
  const launch = (x, z, h, type, colors, speedMul = 1) => { rockets.push({ x, y: 0, z, vy: 55 + Math.random() * 15, h, type, colors, speedMul }); onLaunch(x, z); };
  const burst = R => {
    const n = Math.round((R.type === 'willow' ? 320 : 420) * Math.max(0.45, quality));
    const sp = (R.type === 'willow' ? 26 : 40) * R.speedMul * (0.85 + Math.random() * 0.3);
    const ringAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.4, Math.random() - 0.5).normalize();
    for (let k = 0; k < n; k++) {
      let dx, dy, dz;
      if (R.type === 'ring') {
        const a = (k / n) * Math.PI * 2, u = new THREE.Vector3(1, 0, 0).cross(ringAxis).normalize(), w = ringAxis.clone().cross(u);
        dx = Math.cos(a) * u.x + Math.sin(a) * w.x; dy = Math.cos(a) * u.y + Math.sin(a) * w.y; dz = Math.cos(a) * u.z + Math.sin(a) * w.z;
      } else { const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1); dx = Math.sin(ph) * Math.cos(th); dy = Math.cos(ph); dz = Math.sin(ph) * Math.sin(th); }
      const c = R.colors[(R.type === 'double' && k % 2) ? 1 : 0];
      const v = sp * (R.type === 'ring' ? 1 : 0.7 + Math.random() * 0.3);
      spawn(R.x, R.y, R.z, dx * v, dy * v, dz * v, c, R.type === 'willow' ? 3.2 + Math.random() : 1.6 + Math.random() * 0.9, R.type === 'willow' ? 1.0 : 1.3, R.type === 'willow' ? 1.6 : 1.05, R.type === 'willow' || Math.random() < 0.3);
    }
    flash = 1; flashC.setRGB(R.colors[0][0], R.colors[0][1], R.colors[0][2]).multiplyScalar(0.5);
    onBoom(R.x, R.y, R.z, R.type);
  };
  const randomShow = () => {
    const a = Math.random() * Math.PI * 2, d = 560 + Math.random() * 380;   // just outside the city walls (never through the streets)
    const types = ['peony', 'peony', 'double', 'willow', 'ring'];
    const c1 = PAL[Math.floor(Math.random() * PAL.length)], c2 = PAL[Math.floor(Math.random() * PAL.length)];
    const t = types[Math.floor(Math.random() * types.length)];
    launch(Math.cos(a) * d, -190 + Math.sin(a) * d * 0.8, 150 + Math.random() * 100, t, t === 'willow' ? [[1.9, 1.0, 0.2]] : [c1, c2]);
  };
  return {
    get flash() { return { k: flash, color: flashC }; },
    celebrate(x, y, z, h) {
      // a salvo of big bursts just ahead of the car
      for (let k = 0; k < 7; k++) setTimeout(() => {
        const a = h + (Math.random() - 0.5) * 1.1, d = 120 + Math.random() * 70;   // ahead and low enough to stay in view
        const c1 = PAL[Math.floor(Math.random() * PAL.length)];
        launch(x + Math.sin(a) * d, z + Math.cos(a) * d, y + 26 + Math.random() * 18, k % 3 === 2 ? 'willow' : 'double', k % 3 === 2 ? [[1.9, 1.0, 0.2]] : [c1, PAL[5]], 1.3);
      }, k * 220);
    },
    update(dt) {
      timer -= dt;
      if (timer <= 0) { randomShow(); if (Math.random() < 0.3) { randomShow(); randomShow(); } timer = 0.3 + Math.random() * 0.8; }
      // every ~20 s a finale: a fan of shells from one spot, bursting together
      finaleT -= dt;
      if (finaleT <= 0) {
        finaleT = 16 + Math.random() * 10;
        const a = Math.random() * Math.PI * 2, d = 620, c = PAL[Math.floor(Math.random() * PAL.length)];
        for (let k = 0; k < 9; k++) setTimeout(() => launch(Math.cos(a) * d + (k - 4) * 26, -190 + Math.sin(a) * d * 0.8, 170 + Math.abs(k - 4) * 12, k % 2 ? 'peony' : 'willow', k % 2 ? [c, PAL[5]] : [[1.9, 1.0, 0.2]], 1.2), k * 90);
      }
      for (let k = rockets.length - 1; k >= 0; k--) {
        const R = rockets[k];
        R.y += R.vy * dt; R.vy -= 9 * dt;
        spawn(R.x + (Math.random() - 0.5) * 0.3, R.y, R.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 2, -4, (Math.random() - 0.5) * 2, [1.6, 0.9, 0.35], 0.45, 0.6, 2, false);
        if (R.y >= R.h || R.vy < 8) { burst(R); rockets.splice(k, 1); }
      }
      for (let i = 0; i < MAX; i++) {
        if (age[i] >= life[i]) { if (size[i]) { size[i] = 0; } continue; }
        age[i] += dt;
        const k = age[i] / life[i], dd = Math.exp(-drag[i] * dt), j = i * 3;
        vel[j] *= dd; vel[j + 1] = vel[j + 1] * dd - 6.5 * dt; vel[j + 2] *= dd;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        let f = (1 - k) * (1 - k);
        if (twinkle[i] && k > 0.45) f *= Math.random() < 0.5 ? 0.15 : 1.2;
        col[j] = base[j] * f; col[j + 1] = base[j + 1] * f; col[j + 2] = base[j + 2] * f;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
      flash = Math.max(0, flash - dt * 2.5);
    },
  };
}

// Night sky with a big full moon, stars and a warm glow over the city.
export function buildMoonSky(scene, moonDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { moon: { value: moonDir.clone().normalize() } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 moon; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); float a=h(vec3(i,1.0)), b=h(vec3(i+vec2(1,0),1.0)), c=h(vec3(i+vec2(0,1),1.0)), d=h(vec3(i+vec2(1,1),1.0)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      void main(){
        float y = vP.y;
        vec3 zen = vec3(0.012,0.016,0.05), mid = vec3(0.03,0.03,0.09), hor = vec3(0.22,0.07,0.06);
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, y)); c = mix(c, zen, smoothstep(0.22, 0.85, y));
        vec3 q = floor(vP * 380.0); float s = step(0.9972, h(q)) * smoothstep(0.08, 0.4, y);
        c += s * (0.5 + 0.5 * h(q + 3.0));
        float d = dot(vP, moon), ang = acos(clamp(d, -1.0, 1.0));
        float disc = 1.0 - smoothstep(0.052, 0.056, ang);
        vec3 mc = vec3(1.0, 0.94, 0.8) * (0.85 + 0.15 * n2(vP.xy * 160.0 + vP.z * 80.0)) * 2.4;
        c = mix(c, mc, disc);
        c += vec3(0.9, 0.75, 0.55) * 0.18 * exp(-ang * 9.0) + vec3(0.5,0.45,0.4) * 0.06 * exp(-ang * 2.5);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  scene.add(sky);
  return sky;
}

// Warm environment map for reflections: red/gold lantern panels under a deep blue sky.
export function warmEnv(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05060f);
  const cols = [0xff4a20, 0xffb040, 0xff3018, 0xffd070, 0xff6030, 0xffa040];
  cols.forEach((c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), side: THREE.DoubleSide }));
    const a = (k / cols.length) * Math.PI * 2; m.position.set(Math.cos(a) * 12, 1.5 + (k % 2) * 2.5, Math.sin(a) * 12); m.lookAt(0, 0, 0); env.add(m);
  });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4) }));
  moon.position.set(4, 10, -12); moon.lookAt(0, 0, 0); env.add(moon);
  const pm = new THREE.PMREMGenerator(renderer);
  const t = pm.fromScene(env, 0.02).texture; pm.dispose();
  return t;
}
