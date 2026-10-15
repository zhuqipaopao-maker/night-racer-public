import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { radialTexture } from './textures.js';

// 冰原极光 — an icefield at night under the aurora: a research station at the start, a snowy pine forest, a frozen
// lake with an old ship locked in the ice, a crevasse to jump, a canyon between glacier cliffs, a natural ice arch,
// and open tundra with a radar dome and igloos. The props are Tripo models packed in models/ice.glb
// (tools/ice-assets.py); the terrain, sky, snow and lake are built here.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += vnoise(x * f, z * f) * a; f *= 2.03; a *= 0.5; } return s; };
const ss = THREE.MathUtils.smoothstep;
const TRS = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

// Night sky: deep blue, stars, and slow green-to-violet aurora curtains.
export function buildAuroraSky(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float time; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vP); float y = d.y;
        vec3 c = mix(vec3(0.05,0.09,0.16), vec3(0.008,0.015,0.045), smoothstep(0.0, 0.55, y));
        c = mix(vec3(0.06,0.09,0.14), c, smoothstep(-0.04, 0.06, y));
        vec2 sp = d.xz / (abs(d.y) + 1.0) * 260.0; float sh = h(floor(sp));
        c += step(0.996, sh) * smoothstep(0.03, 0.25, y) * vec3(0.85,0.9,1.0) * (0.55 + 0.45 * sin(time * 2.0 + sh * 60.0));
        if (y > 0.015) {
          vec2 p = d.xz / y * 0.55;
          float a = 0.0;
          for (int k = 0; k < 3; k++) { float fk = float(k);
            float band = p.x * 0.3 + p.y * 0.12 + sin(p.y * 0.45 + time * 0.04 + fk * 1.9) * 1.3 + n2(vec2(p.y * 0.25, time * 0.02 + fk * 5.0)) * 1.6 - fk * 1.1 - 0.4;
            float curtain = exp(-band * band * 2.5);
            float rays = 0.45 + 0.55 * n2(vec2(p.y * 5.0 + p.x * 0.5 + time * 0.25, fk * 7.0));
            a += curtain * rays * (1.0 - fk * 0.25);
          }
          float fade = smoothstep(0.015, 0.16, y) * (1.0 - smoothstep(0.5, 0.85, y));
          c += mix(vec3(0.12, 1.0, 0.5), vec3(0.6, 0.25, 0.95), smoothstep(0.2, 0.55, y)) * a * fade * 0.6;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky); return sky;
}

export function buildIce(scene, track, opts = {}) {
  const Q = opts.quality ?? 1, r = rng(2026), cfg = track.cfg, N = track.N, step = track.step, E = track.edge;
  const group = new THREE.Group(); scene.add(group);
  const idx = m => Math.max(0, Math.min(N - 1, Math.round(m / step)));
  const time = { value: 0 };
  const zoneAt = (z => s => { let n = z[0][0]; for (const [name, from] of z) if (s >= from) n = name; return n; })(cfg.zones);
  const span = name => { const k = cfg.zones.findIndex(z => z[0] === name); return [cfg.zones[k][1], cfg.zones[k + 1] ? cfg.zones[k + 1][1] : track.length]; };
  const lake = span('lake'), canyon = span('canyon'), forest = span('forest'), tundra = span('tundra'), crev = cfg.crevasse;
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
  const inR = (s, [a, b], pad = 0) => s >= a - pad && s <= b + pad;
  const LAKE_Y = -0.75;

  // ---------- terrain ----------
  const ground = (x, z) => {
    let h = fbm(x * 0.003, z * 0.003, 4) * 16 - 5 + fbm(x * 0.02, z * 0.02, 2) * 1.5;   // rolling snow
    const q = nearRoad(x, z, 320);
    if (q.i < 0) return h;
    const ry = track.py[q.i], d = q.d, s = q.s;
    // the frozen lake: a wide flat sheet of ice either side of the road
    if (inR(s, lake, 120)) { const k = (1 - ss(d, 170, 260)) * ss(s, lake[0] - 120, lake[0] + 30) * (1 - ss(s, lake[1] - 30, lake[1] + 120)); h = h * (1 - k) + (LAKE_Y - 0.05) * k; }
    // the ice canyon: glacier walls right beside the road
    if (inR(s, canyon, 60)) {
      const k = ss(s, canyon[0] - 60, canyon[0] + 10) * (1 - ss(s, canyon[1] - 10, canyon[1] + 60));
      const wall = ry + 22 + fbm(x * 0.02, z * 0.02, 3) * 16;
      const t = THREE.MathUtils.lerp(THREE.MathUtils.lerp(ry - 0.6, wall, ss(d, E + 5, E + 18)), h, ss(d, 110, 170));
      h = h * (1 - k) + t * k;
    }
    // the crevasse across the road under the jump: level snow either side, then the crack itself
    if (inR(s, crev, 90)) {
      const lv = (1 - ss(d, 120, 220)) * ss(s, crev[0] - 90, crev[0] - 40) * (1 - ss(s, crev[1] + 40, crev[1] + 90));
      h = h * (1 - lv) + (ry - 0.6) * lv;
      const k = ss(s, crev[0] - 18, crev[0] + 4) * (1 - ss(s, crev[1] - 4, crev[1] + 18)) * (1 - ss(d, 160, 230));
      h = h * (1 - k) + (-34 + fbm(x * 0.05, z * 0.05, 2) * 6) * k;
      if (d < E + 6 && !inR(s, cfg.gaps[0], 2)) h = Math.min(h, ry - 0.6);   // ramp and landing decks stay clear
      return h;
    }
    // the road always sits on the ground
    if (!inR(s, canyon, 60) && d < E + 40) { const k = ss(d, E + 1, E + 40); h = (ry - 0.6) * (1 - k) + h * k; }
    else if (d < E + 5) h = ry - 0.6;
    return h;
  };
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, track.px[i]); maxx = Math.max(maxx, track.px[i]); minz = Math.min(minz, track.pz[i]); maxz = Math.max(maxz, track.pz[i]); }
  const PAD = 500, W = maxx - minx + 2 * PAD, D = maxz - minz + 2 * PAD, res = 9 / Math.min(1, Q + 0.3);
  // fine patch over the canyon and crevasse (steep walls beside the road need small triangles)
  let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9;
  for (let i = idx(crev[0] - 80); i <= idx(canyon[1] + 60); i++) { fx0 = Math.min(fx0, track.px[i]); fx1 = Math.max(fx1, track.px[i]); fz0 = Math.min(fz0, track.pz[i]); fz1 = Math.max(fz1, track.pz[i]); }
  fx0 -= 90; fx1 += 90; fz0 -= 90; fz1 += 90;
  const inFine = (x, z, m = 0) => x > fx0 + m && x < fx1 - m && z > fz0 + m && z < fz1 - m;
  const SNOW = new THREE.Color(0xeef4fc), SHADE = new THREE.Color(0xb8cbe4), ICE = new THREE.Color(0x6aa6d8), DEEP = new THREE.Color(0x1d4a78), ROCK = new THREE.Color(0x46505e);
  const snowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.7 });
  const grid = (cx, cz, w, d, r0, heightFn) => {
    const g = new THREE.PlaneGeometry(w, d, Math.round(w / r0), Math.round(d / r0)); g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, heightFn(p.getX(k), p.getZ(k))); g.computeVertexNormals();
    const nrm = g.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), steep = ss(1 - nrm.getY(k), 0.12, 0.45);
      col.copy(SNOW).lerp(SHADE, fbm(x * 0.03, z * 0.03, 2) * 0.6);
      col.lerp(ICE, steep * 0.85).lerp(DEEP, ss(-y, 6, 26) * 0.9);                      // glacier walls, crevasse depths
      if (steep > 0.6 && fbm(x * 0.05, z * 0.05 + y * 0.05, 2) > 0.62) col.lerp(ROCK, 0.6);   // the odd rock showing through
      c.set([col.r, col.g, col.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, snowMat); m.receiveShadow = true; group.add(m);
    return g;
  };
  const fine = grid((fx0 + fx1) / 2, (fz0 + fz1) / 2, fx1 - fx0, fz1 - fz0, 4 / Math.min(1, Q + 0.5), ground);
  const tg = grid((minx + maxx) / 2, (minz + maxz) / 2, W, D, res, (x, z) => {
    if (inFine(x, z, res + 1)) return -40;   // hidden under the fine patch
    const ex = Math.min(x - minx + PAD, maxx + PAD - x, z - minz + PAD, maxz + PAD - z);
    return ground(x, z) * ss(ex, 0, 160) - 0.5 * (1 - ss(ex, 0, 160));
  });
  const sampler = (g, x0, z0, w, d) => { const GX = g.parameters.widthSegments, GZ = g.parameters.heightSegments, p = g.attributes.position;
    return (x, z) => { const fx = THREE.MathUtils.clamp((x - x0) / w * GX, 0, GX - 1e-4), fz = THREE.MathUtils.clamp((z - z0) / d * GZ, 0, GZ - 1e-4), ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, H = (a, b) => p.getY(b * (GX + 1) + a);
      return H(ix, iz) * (1 - u) * (1 - v) + H(ix + 1, iz) * u * (1 - v) + H(ix, iz + 1) * (1 - u) * v + H(ix + 1, iz + 1) * u * v; }; };
  const hFine = sampler(fine, fx0, fz0, fx1 - fx0, fz1 - fz0), hCoarse = sampler(tg, (minx + maxx) / 2 - W / 2, (minz + maxz) / 2 - D / 2, W, D);
  const hAt = (x, z) => (inFine(x, z) ? hFine(x, z) : hCoarse(x, z));
  const slopeAt = (x, z) => Math.max(Math.abs(hAt(x + 4, z) - hAt(x - 4, z)), Math.abs(hAt(x, z + 4) - hAt(x, z - 4))) / 8;
  // endless snow beyond
  const flat = new THREE.Mesh(new THREE.RingGeometry(Math.hypot(W, D) * 0.45, 5000, 64, 1), new THREE.MeshStandardMaterial({ color: 0xd8e4f2, roughness: 0.95 }));
  flat.rotation.x = -Math.PI / 2; flat.position.set((minx + maxx) / 2, -0.6, (minz + maxz) / 2); group.add(flat);

  // ---------- the frozen lake: glossy ice over the flattened ground ----------
  {
    let cx = 0, cz = 0, n = 0; for (let i = idx(lake[0]); i <= idx(lake[1]); i++) { cx += track.px[i]; cz += track.pz[i]; n++; } cx /= n; cz /= n;
    let R = 0; for (let i = idx(lake[0]); i <= idx(lake[1]); i++) R = Math.max(R, Math.hypot(track.px[i] - cx, track.pz[i] - cz));
    const iceTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
      g.fillStyle = '#9ab4c8'; g.fillRect(0, 0, 512, 512);
      const rr = rng(7); g.strokeStyle = 'rgba(230,245,255,0.55)';
      for (let k = 0; k < 70; k++) { g.lineWidth = 0.6 + rr() * 1.6; g.beginPath(); let x = rr() * 512, y = rr() * 512; g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (rr() - 0.5) * 120; y += (rr() - 0.5) * 120; g.lineTo(x, y); } g.stroke(); }
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.05 + rr() * 0.1})`; g.beginPath(); g.ellipse(rr() * 512, rr() * 512, 20 + rr() * 60, 8 + rr() * 30, rr() * 3, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    // keep the sheet well clear of the crevasse, or it would fill the crack
    const ci = idx((crev[0] + crev[1]) / 2), toCrack = Math.hypot(track.px[ci] - cx, track.pz[ci] - cz);
    const ice = new THREE.Mesh(new THREE.CircleGeometry(Math.min(R + 230, toCrack - 70), 64), new THREE.MeshStandardMaterial({ map: iceTex, color: 0x8ea4b8, roughness: 0.05, metalness: 0.35, envMapIntensity: 2.2 }));
    ice.rotation.x = -Math.PI / 2; ice.position.set(cx, LAKE_Y, cz); ice.receiveShadow = true; group.add(ice);
  }

  // ---------- far mountains (cone stand-ins until the Tripo mountains load) ----------
  let conePeaks;
  {
    const g = new THREE.ConeGeometry(1, 1, 7, 4).translate(0, 0.5, 0); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y > 0.02 && y < 0.98) { const f = 1 + (hash2(p.getX(k) * 9 + y * 3, p.getZ(k) * 9) - 0.5) * 0.35; p.setX(k, p.getX(k) * f); p.setZ(k, p.getZ(k) * f); } }
    g.computeVertexNormals();
    const c = new Float32Array(p.count * 3), col = new THREE.Color(); for (let k = 0; k < p.count; k++) { col.copy(ROCK).lerp(SNOW, ss(p.getY(k), 0.25, 0.55)); c.set([col.r, col.g, col.b], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const peaks = []; for (let t = 0; t < 400 && peaks.length < 46; t++) { const a = r() * Math.PI * 2, R = 1400 + r() * 1300, x = (minx + maxx) / 2 + Math.cos(a) * R, z = (minz + maxz) / 2 + Math.sin(a) * R; if (nearRoad(x, z, 360).d < 500) continue; peaks.push([x, z, 160 + r() * 260, 140 + r() * 320]); }
    const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), peaks.length);
    peaks.forEach(([x, z, w, h], k) => im.setMatrixAt(k, TRS(x, -10, z, r() * 6, w, h, w * (0.7 + r() * 0.5)))); group.add(im);
    conePeaks = im;
  }

  // ---------- falling snow around the camera ----------
  const snowU = { time, center: { value: new THREE.Vector3() } };
  {
    const n = Math.round(5000 * Math.min(1, Q + 0.2)), pos = new Float32Array(n * 3), rr = rng(11);
    for (let k = 0; k < n * 3; k++) pos[k] = rr();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { ...snowU, map: { value: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)') } }, transparent: true, depthWrite: false,
      vertexShader: `uniform float time; uniform vec3 center; varying float vA;
        void main(){ float B = 110.0; vec3 drift = vec3(sin(time * 0.3 + position.y * 9.0) * 2.0 + time * 1.5, -time * 3.2, time * 0.8);
          vec3 w = center + mod(position * B + drift - center, B) - B * 0.5;
          vec4 mv = modelViewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(260.0 / -mv.z, 1.0, 9.0); vA = smoothstep(55.0, 20.0, length(w - center)); }`,
      fragmentShader: `uniform sampler2D map; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), texture2D(map, gl_PointCoord).a * vA * 0.85); }`,
    }));
    pts.frustumCulled = false; group.add(pts);
  }

  // ---------- warm lights at the station and along the start ----------
  const glowMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,190,110,1)', 'rgba(255,140,60,0)'), color: new THREE.Color(1.1, 0.9, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const lamp = (x, y, z, s = 6) => { const sp = new THREE.Sprite(glowMat); sp.position.set(x, y, z); sp.scale.setScalar(s); group.add(sp); };
  const side = (s, off) => { const i = idx(s); return [track.px[i] + track.nx[i] * off, track.pz[i] + track.nz[i] * off, Math.atan2(track.tx[i], track.tz[i]), i]; };
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 8).translate(0, 3.5, 0), poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.6 });
  for (let s = 20; s < 560; s += 60) for (const sd of [-1, 1]) {
    const [x, z] = side(s, sd * (E + 3)), y = hAt(x, z), m = new THREE.Mesh(pole, poleMat); m.position.set(x, y, z); group.add(m); lamp(x, y + 7.2, z, 2.6);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.4), toneMapped: false })); l.position.set(x, y + 7.1, z); group.add(l);
  }

  // ---------- Tripo props ----------
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('models/ice.glb', gltf => {
    const asset = name => { const n = gltf.scene.getObjectByName(name); n.updateMatrix(); n.material.envMapIntensity = 0.9; return n; };
    const m4 = new THREE.Matrix4();
    // list items: [x, y, z, yaw, sx, sy?, sz?] — y is where the asset's base sits
    // one instanced mesh per 300 m cell, so whole cells behind or beside the camera are culled
    const place = (name, list, shadow = true) => {
      if (!list.length) return;
      const a = asset(name), cells = new Map();
      for (const it of list) { const k = Math.floor(it[0] / 300) + ',' + Math.floor(it[2] / 300); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(it); }
      for (const items of cells.values()) {
        const im = new THREE.InstancedMesh(a.geometry, a.material, items.length);
        items.forEach(([x, y, z, yaw, sx, sy = sx, sz = sx], k) => im.setMatrixAt(k, m4.copy(TRS(x, y, z, yaw, sx, sy, sz)).multiply(a.matrix)));
        im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; group.add(im);
      }
    };
    const far = (x, z, m) => nearRoad(x, z, m + CELL).d >= m;
    const okGround = (x, z) => (slopeAt(x, z) < 0.35 ? hAt(x, z) : null);
    const roadside = (a, b, n, dmin, dmax, sizes, out, tries = 8) => {
      for (let t = 0; t < n * tries && out.length < n; t++) {
        const s = a + r() * (b - a), [x, z] = side(s, (r() < 0.5 ? -1 : 1) * (dmin + Math.pow(r(), 1.4) * (dmax - dmin)));
        if (!far(x, z, dmin - 1)) continue; const y = okGround(x, z); if (y === null) continue;
        out.push([x, y - 0.3, z, r() * 6.28, sizes[0] + r() * (sizes[1] - sizes[0])]);
      }
      return out;
    };
    const inAny = (s, ...R) => R.some(([a, b]) => s >= a && s <= b);
    // pines: a dense forest, thinning out elsewhere (none on the lake or in the canyon). The detailed model lines the
    // road; the rows behind use the decimated copy, so the forest can be thick without costing three times as much.
    const NEAR = E + 45, open = s => inAny(s, [lake[0] - 80, lake[1] + 80], [crev[0] - 120, canyon[1] + 40]);
    const pines = roadside(forest[0], forest[1], Math.round(300 * Q + 60), E + 4, NEAR, [9, 18], []);
    const pinesLo = roadside(forest[0], forest[1], Math.round(800 * Q + 140), NEAR, E + 280, [10, 20], [], 6);
    for (let t = 0; t < 6000 && pines.length < 380 * Q + 80; t++) {
      const s = r() * track.length; if (open(s)) continue;
      const [x, z] = side(s, (r() < 0.5 ? -1 : 1) * (E + 12 + r() * (NEAR - E - 12))); if (!far(x, z, E + 10)) continue; const y = okGround(x, z); if (y === null) continue;
      pines.push([x, y - 0.3, z, r() * 6.28, 8 + r() * 10]);
    }
    for (let t = 0; t < 8000 && pinesLo.length < 1300 * Q + 220; t++) {
      const s = r() * track.length; if (open(s)) continue;
      const [x, z] = side(s, (r() < 0.5 ? -1 : 1) * (NEAR + r() * 300)); if (!far(x, z, NEAR - 2)) continue; const y = okGround(x, z); if (y === null) continue;
      pinesLo.push([x, y - 0.3, z, r() * 6.28, 8 + r() * 12]);
    }
    place('pine', pines);
    place('pine_lo', pinesLo, false);
    // sculpted mountains on the horizon replace the cone stand-ins
    { const kinds = ['mountain_a', 'mountain_b', 'mountain_c'], lists = { mountain_a: [], mountain_b: [], mountain_c: [] };
      for (let t = 0, n = 0; t < 600 && n < 42; t++) {
        const a = r() * Math.PI * 2, R = 1500 + r() * 1300, x = (minx + maxx) / 2 + Math.cos(a) * R, z = (minz + maxz) / 2 + Math.sin(a) * R;
        if (nearRoad(x, z, 360).d < 500) continue;
        const kind = kinds[n++ % 3], w = 420 + r() * 520, sink = kind === 'mountain_b' ? 0.3 : 0.12;
        lists[kind].push([x, -w * 0.6 * sink, z, r() * 6.28, w, w * (0.8 + r() * 0.5), w]);
      }
      for (const k of kinds) place(k, lists[k], false);
      conePeaks.visible = false; }
    // ice chunks on the lake shore and in the canyon, rocks on the tundra
    const ice = roadside(lake[0], lake[1], Math.round(50 * Q + 16), E + 12, E + 200, [2, 8], []);
    roadside(canyon[0], canyon[1], Math.round(30 * Q + 10), E + 4, E + 14, [1.5, 4], ice);
    place('icerock_a', ice);
    place('icerock_b', roadside(tundra[0], tundra[1], Math.round(60 * Q + 16), E + 10, E + 260, [3, 11], roadside(forest[0], forest[1], Math.round(20 * Q + 6), E + 10, E + 120, [2, 6], [])));
    // glacier cliffs lining the canyon
    const cliffs = [];
    for (let s = canyon[0] + 15; s < canyon[1] - 15; s += 26) for (const sd of [-1, 1]) {
      const [x, z, yaw, i] = side(s, sd * (E + 17 + r() * 4));
      cliffs.push([x, track.py[i] - 3, z, yaw + Math.PI / 2 + (sd > 0 ? Math.PI : 0) + (r() - 0.5) * 0.3, 34 + r() * 8, 34 + r() * 14, 26]);
    }
    place('icecliff', cliffs);
    // the glacier arch the road runs under (its legs stand across the road)
    { const [x, z, yaw, i] = side(cfg.arch, 0); place('arch2', [[x, track.py[i] - 2, z, yaw + Math.PI / 2, 58]]); }
    // the old ship locked in the lake ice
    { const [x, z, yaw] = side(cfg.ship, 80); place('ship', [[x, LAKE_Y - 5, z, yaw + 0.5, 46]]); }
    // research station at the start, with a snowmobile and fuel drums
    { const [x, z, yaw] = side(70, -(E + 24)), y = hAt(x, z);
      place('station', [[x, y - 0.2, z, yaw, 24], ...[[-26, -0.15, 12]].map(([o, dy, s]) => { const [x2, z2] = side(70 + o, -(E + 34)); return [x2, hAt(x2, z2) + dy, z2, yaw + 0.4, s]; })]);
      { const [x2, z2] = side(110, -(E + 14)); place('snowmobile', [[x2, hAt(x2, z2) - 0.1, z2, yaw + 2.2, 3.2]]); }
      const drums = []; for (const [o, d] of [[40, -(E + 10)], [44, -(E + 12)], [3200, E + 22], [3600, -(E + 18)]]) { const [x2, z2] = side(o, d); drums.push([x2, hAt(x2, z2) - 0.2, z2, r() * 6, 3]); }
      place('barrels', drums);
      for (const [dx, dy] of [[-6, 7], [6, 7]]) { const [x2, z2] = side(70 + dx, -(E + 24)); lamp(x2, y + dy, z2, 4); }
    }
    // tundra: radar domes, igloos
    { const radars = []; for (const [s, d, sc] of [[3150, E + 80, 30], [3480, -(E + 140), 24], [3700, E + 200, 20]]) { const [x, z] = side(s, d); radars.push([x, hAt(x, z) - 0.5, z, r() * 6, sc]); }
      place('radar', radars);
      const ig = []; for (let k = 0; k < 7; k++) { const [x, z] = side(2950 + k * 22 + r() * 10, E + 28 + r() * 40); ig.push([x, hAt(x, z) - 0.4, z, r() * 6, 6 + r() * 3]); }
      place('igloo', ig);
      for (const [x, , z] of ig.slice(0, 4)) lamp(x, hAt(x, z) + 2, z, 3.5); }
    // red-and-white marker poles along the whole road (not over the crevasse)
    const marks = []; for (let s = 10; s < track.length; s += 32) { if (inAny(s, [crev[0] - 6, crev[1] + 6], [cfg.arch - 25, cfg.arch + 25])) continue; for (const sd of [-1, 1]) { const [x, z, yaw, i] = side(s, sd * (E + 1.6)); marks.push([x, track.py[i] - 0.6, z, yaw, 2.4]); } }
    place('marker', marks, false);
  }, undefined, e => console.warn('ice.glb', e));

  function update(t, dt, camera) {
    time.value = t;
    if (camera) snowU.center.value.copy(camera.position);
  }
  return { update, ground, hAt };
}
