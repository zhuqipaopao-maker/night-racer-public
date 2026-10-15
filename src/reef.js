import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 珊瑚深海 — the whole lap on the sea floor: a coral garden, a kelp forest, a glass tunnel down into a
// trench, a leap over a chasm, a shipwreck, and pink seahorses everywhere, drifting beside (and over) the road.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += vnoise(x * f, z * f) * a; f *= 2.03; a *= 0.5; } return s; };
const ss = THREE.MathUtils.smoothstep;
const TRS = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
function part(geo, color, m, r, jit = 0.12) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv'); if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let k = 0; k < n; k += 3) { const f = 1 - jit / 2 + r() * jit; for (let q = 0; q < 3; q++) c.set([col.r * f, col.g * f, col.b * f], (k + q) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function lumpy(geo, amt, freq, seed = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); v.multiplyScalar(1 + (fbm(v.x * freq + seed, v.z * freq + v.y * freq * 0.7, 3) - 0.5) * amt); p.setXYZ(k, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
const FOG_V = '\n#include <fog_pars_vertex>\n', FOG_F = '\n#include <fog_pars_fragment>\n';

// A seahorse, about 1 unit tall: curled tail, arched belly, bony ridged body in rings, a long snout,
// crown, eyes. Body + snout + eyes in one vertex-coloured geometry; the dorsal fin is separate (it flutters).
function seahorseGeo() {
  const r = rng(9);
  const spine = new THREE.CatmullRomCurve3([[0.06, -0.48], [0.16, -0.52], [0.2, -0.42], [0.1, -0.36], [0.02, -0.3], [-0.02, -0.1], [0.02, 0.1], [0.06, 0.26], [0.02, 0.38], [-0.04, 0.44]].map(([z, y]) => new THREE.Vector3(0, y, z)));
  const rad = t => (t < 0.35 ? 0.012 + t * 0.12 : t < 0.8 ? 0.054 + Math.sin((t - 0.35) / 0.45 * Math.PI) * 0.045 : 0.06 - (t - 0.8) * 0.12);
  const S = 46, R = 10, pos = [], col = [], idx = [], pink = new THREE.Color(0xff6fb8), pale = new THREE.Color(0xffc2df), deep = new THREE.Color(0xe0408f);
  const frames = spine.computeFrenetFrames(S, false);
  for (let i = 0; i <= S; i++) {
    const t = i / S, P = spine.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], rr = rad(t), ring = (i % 3 === 0) ? 1.12 : 1;
    for (let j = 0; j < R; j++) {
      const a = j / R * Math.PI * 2, belly = Math.max(0, Math.cos(a));   // the front of the body is paler
      const x = P.x + (Math.cos(a) * N.x + Math.sin(a) * B.x) * rr * ring, y = P.y + (Math.cos(a) * N.y + Math.sin(a) * B.y) * rr * ring, z = P.z + (Math.cos(a) * N.z + Math.sin(a) * B.z) * rr * ring;
      pos.push(x, y, z); const c = pink.clone().lerp(pale, belly * 0.6).lerp(deep, ring > 1 ? 0.35 : 0); col.push(c.r, c.g, c.b);
      if (i < S) { const a0 = i * R + j, a1 = i * R + (j + 1) % R, b0 = a0 + R, b1 = a1 + R; idx.push(a0, b0, a1, a1, b0, b1); }
    }
  }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); body.setIndex(idx);
  const bodyN = body.toNonIndexed(); bodyN.computeVertexNormals();
  const head = spine.getPointAt(0.97);
  const snout = part(new THREE.CylinderGeometry(0.018, 0.026, 0.2, 8).rotateX(Math.PI / 2), 0xff7ec2, new THREE.Matrix4().makeTranslation(head.x, head.y - 0.03, head.z + 0.1), r, 0);
  const crown = part(new THREE.ConeGeometry(0.03, 0.08, 6), 0xffa8d4, new THREE.Matrix4().makeTranslation(head.x, head.y + 0.06, head.z - 0.01), r, 0);
  const eyes = [-1, 1].map(s => part(new THREE.SphereGeometry(0.016, 8, 6), 0x111111, new THREE.Matrix4().makeTranslation(s * 0.045, head.y + 0.005, head.z + 0.02), r, 0));
  const g = mergeGeometries([bodyN, snout, crown, ...eyes]);
  // dorsal fin: a small fan on the back
  const fin = new THREE.CircleGeometry(0.09, 10, Math.PI * 0.5, Math.PI); fin.rotateY(Math.PI / 2);
  const back = spine.getPointAt(0.55); fin.translate(0, back.y, back.z - 0.06);
  return { body: g, fin };
}

export function buildReef(scene, track, opts = {}) {
  const Q = opts.quality ?? 1, r = rng(321), group = new THREE.Group(); scene.add(group);
  const cfg = track.cfg, N = track.N, step = track.step, E = track.edge, SURF = 55;
  const time = { value: 0 };
  const idx = m => Math.max(0, Math.min(N - 1, Math.round(m / step)));
  const zoneOf = s => { let n = cfg.zones[0][0]; for (const [z, a] of cfg.zones) if (s >= a) n = z; return n; };
  // nearest road sample (spatial hash)
  const CELL = 40, H = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(track.px[i] / CELL) + ',' + Math.floor(track.pz[i] / CELL); if (!H.has(k)) H.set(k, []); H.get(k).push(i); }
  const near = (x, z, R = 200) => { let bd = 1e18, bi = -1; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let ring = 0; ring <= Math.ceil(R / CELL); ring++) { for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== ring) continue; const L = H.get((cx + a) + ',' + (cz + b)); if (L) for (const i of L) { const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } } if (bi >= 0 && ring > 0) break; }
    return { d: Math.sqrt(bd), i: bi };
  };
  const [g0, g1] = cfg.gaps[0];
  // ---------- sea floor ----------
  const floor = (x, z) => {
    const q = near(x, z, 240), s = q.i * step;
    let h = -5 + fbm(x * 0.01, z * 0.01, 4) * 8 + Math.sin(x * 0.06 + fbm(x * 0.02, z * 0.02) * 6) * 0.6;   // dunes and ripples
    // the trench: everything from the tunnel to the wreck lies in a deep valley
    const deep = ss(s, 1250, 1500) * (1 - ss(s, 2800, 3200));
    h -= deep * (22 + fbm(x * 0.02, z * 0.02) * 6) * (1 - ss(q.d, 180, 240));
    if (q.i < 0) return h;
    const ry = track.py[q.i];
    if (s > g0 - 15 && s < g1 + 15) return Math.min(h, -55 + fbm(x * 0.05, z * 0.05) * 6) * (1 - ss(q.d, 60, 110)) + h * ss(q.d, 60, 110);   // the chasm under the jump
    const k = ss(q.d, E + 2, E + 30);
    return (ry - 0.7) * (1 - k) + h * k;
  };
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, track.px[i]); maxx = Math.max(maxx, track.px[i]); minz = Math.min(minz, track.pz[i]); maxz = Math.max(maxz, track.pz[i]); }
  const PAD = 320, W = maxx - minx + 2 * PAD, D = maxz - minz + 2 * PAD, cx = (minx + maxx) / 2, cz = (minz + maxz) / 2, res = 6 / Math.min(1, Q + 0.3);
  const fg = new THREE.PlaneGeometry(W, D, Math.round(W / res), Math.round(D / res)); fg.rotateX(-Math.PI / 2); fg.translate(cx, 0, cz);
  { const p = fg.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, floor(p.getX(k), p.getZ(k))); fg.computeVertexNormals(); }
  const sand = new THREE.ShaderMaterial({
    uniforms: { ...fogU(), time, sunDir: { value: new THREE.Vector3(0.2, 1, 0.15).normalize() } }, fog: true,
    vertexShader: `${FOG_V} varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normal; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `${FOG_F} uniform float time; uniform vec3 sunDir; varying vec3 vW; varying vec3 vN;
      void main(){
        vec2 p = vW.xz * 0.1;
        float c1 = abs(sin(p.x + sin(p.y * 1.3 + time * 0.8) + time * 0.5)) * abs(sin(p.y * 0.9 + sin(p.x * 1.1 - time * 0.7)));
        float caus = pow(1.0 - c1, 6.0) * smoothstep(-40.0, 0.0, vW.y);
        float lit = 0.45 + 0.55 * max(dot(normalize(vN), sunDir), 0.0);
        vec3 s = mix(vec3(0.66, 0.6, 0.48), vec3(0.42, 0.44, 0.4), smoothstep(0.0, -30.0, vW.y));
        s *= 0.88 + 0.12 * sin(vW.x * 0.9 + sin(vW.z * 0.5) * 3.0);
        vec3 c = s * lit + vec3(0.5, 0.95, 1.0) * caus * 0.5;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  group.add(new THREE.Mesh(fg, sand));
  // sea surface overhead, seen from below: bright rippling light
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(W + 3000, D + 3000), new THREE.ShaderMaterial({ uniforms: { time }, side: THREE.DoubleSide, fog: false, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; varying vec3 vW;
      void main(){ vec2 p = vW.xz * 0.03; float w = sin(p.x * 3.0 + time * 0.9) * sin(p.y * 2.6 - time * 0.7) + 0.5 * sin((p.x + p.y) * 7.0 + time * 1.4);
        float d = length(vW.xz - cameraPosition.xz); float k = exp(-d * 0.004);
        vec3 c = mix(vec3(0.05, 0.3, 0.38), mix(vec3(0.35, 0.75, 0.8), vec3(0.85, 1.0, 1.0), smoothstep(0.7, 1.4, w)), k);
        gl_FragColor = vec4(c, 1.0); }` }));
  surf.rotation.x = -Math.PI / 2; surf.position.set(cx, SURF, cz); group.add(surf);

  const m4 = new THREE.Matrix4();
  const inst = (geo, mat, list, setter, shadow = false) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length; list.forEach((it, k) => { setter(m4, it, k, im); im.setMatrixAt(k, m4); }); im.castShadow = shadow; group.add(im); return im; };
  const roadside = (s0, s1, minOff, maxOff) => { const i = idx(s0 + r() * (s1 - s0)), sd = r() < 0.5 ? -1 : 1, off = sd * (minOff + r() * (maxOff - minOff)); return [track.px[i] + track.nx[i] * off, track.pz[i] + track.nz[i] * off, i]; };
  const L = track.length, Z = cfg.zones;
  const zr = name => { const k = Z.findIndex(z => z[0] === name); return [Z[k][1], k + 1 < Z.length ? Z[k + 1][1] : L]; };
  const coralSpans = [zr('coral'), zr('coral2'), zr('final')];
  const pickSpan = spans => spans[Math.floor(r() * spans.length)];

  // ---------- coral, anemones, rocks ----------
  const CORAL = [0xff5a7a, 0xff9a3a, 0xc85aff, 0xffd84a, 0x4ad8ff, 0xff6ad0, 0xff4a4a, 0x7affc8].map(c => new THREE.Color(c));
  const branchG = (() => { const P = [part(new THREE.CylinderGeometry(0.08, 0.14, 1, 6).translate(0, 0.5, 0), 0xffffff, null, r, 0)];
    for (let k = 0; k < 7; k++) { const sub = new THREE.CylinderGeometry(0.035, 0.08, 0.7, 5).translate(0, 0.35, 0); P.push(part(sub, 0xffffff, TRS(0, 0.3 + r() * 0.5, 0, r() * 6, 1, 1, 1, (r() - 0.5) * 1.6), r, 0)); }
    return mergeGeometries(P); })();
  const brainG = lumpy(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.25, 4, 9);
  const tubeG = mergeGeometries([0, 1, 2, 3, 4].map(k => part(new THREE.CylinderGeometry(0.12, 0.1, 1, 8, 1, true).translate(0, 0.5, 0), 0xffffff, TRS(Math.cos(k * 1.3) * 0.25, 0, Math.sin(k * 1.3) * 0.25, 0, 1, 0.6 + (k % 3) * 0.3, 1), r, 0)));
  const corals = [];
  for (let t = 0; t < 2600 * Q + 300; t++) { const sp = pickSpan(coralSpans), [x, z] = roadside(sp[0], sp[1], E + 2.5, 60); if (near(x, z, 30).d < E + 2) continue; corals.push([x, floor(x, z), z, 0.7 + r() * 2.6, r() * 6, Math.floor(r() * CORAL.length), Math.floor(r() * 4)]); }
  for (let t = 0; t < 500 * Q + 60; t++) { const [x, z] = roadside(0, L, E + 3, 50); if (near(x, z, 30).d < E + 2) continue; corals.push([x, floor(x, z), z, 0.6 + r() * 1.8, r() * 6, Math.floor(r() * CORAL.length), Math.floor(r() * 4)]); }
  const coralSet = (dy, sx = 1, sy = 1) => (m, it, k, im) => { m.copy(TRS(it[0], it[1] + dy * it[3], it[2], it[4], it[3] * sx, it[3] * sy, it[3] * sx)); im.setColorAt(k, CORAL[it[5]]); };
  const cMat = () => new THREE.MeshStandardMaterial({ roughness: 0.75, emissive: 0x220a18, flatShading: true });
  inst(branchG, cMat(), corals.filter(c => c[6] === 0), coralSet(-0.1));
  inst(brainG, cMat(), corals.filter(c => c[6] === 1), coralSet(-0.2, 1, 0.8));
  inst(new THREE.CircleGeometry(1, 14, 0, Math.PI), new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, emissive: 0x220a18 }), corals.filter(c => c[6] === 2), coralSet(0, 1.3));
  inst(tubeG, new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissive: 0x220a18 }), corals.filter(c => c[6] === 3), coralSet(-0.05));
  // anemones: a cluster of waving tentacles
  const anemG = mergeGeometries(Array.from({ length: 16 }, (_, k) => { const a = k / 16 * Math.PI * 2, d = 0.12 + (k % 2) * 0.1; return new THREE.CylinderGeometry(0.012, 0.035, 0.6, 5).translate(0, 0.3, 0).applyMatrix4(TRS(Math.cos(a) * d, 0, Math.sin(a) * d, 0, 1, 1, 1, Math.sin(a) * 0.4, Math.cos(a) * -0.4)).toNonIndexed(); }));
  const anemMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x401030 });
  anemMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2; transformed.x += sin(time * 1.6 + ph + position.y * 4.0) * position.y * 0.25; transformed.z += cos(time * 1.3 + ph) * position.y * 0.15;'); };
  const anem = []; for (let t = 0; t < 700 * Q + 80; t++) { const sp = pickSpan(coralSpans), [x, z] = roadside(sp[0], sp[1], E + 2, 40); if (near(x, z, 30).d < E + 1.5) continue; anem.push([x, floor(x, z), z, 1 + r() * 2.2, Math.floor(r() * 4)]); }
  const ANEM = [0xff8ad0, 0xffb04a, 0x9affd8, 0xd08aff].map(c => new THREE.Color(c));
  inst(anemG, anemMat, anem, (m, [x, y, z, s, c], k, im) => { m.copy(TRS(x, y - 0.05, z, 0, s, s, s)); im.setColorAt(k, ANEM[c]); });
  const rockG = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.6, 1.3, 4);
  const rocks = []; for (let t = 0; t < 600 * Q + 80; t++) { const [x, z] = roadside(0, L, E + 6, 140); if (near(x, z, 40).d < E + 4) continue; rocks.push([x, floor(x, z), z, 1.5 + Math.pow(r(), 2.5) * 14, r() * 6]); }
  inst(rockG, new THREE.MeshStandardMaterial({ color: 0x5a6a68, roughness: 0.95, flatShading: true }), rocks, (m, [x, y, z, s, a]) => m.copy(TRS(x, y, z, a, s, s * 0.65, s)));

  // ---------- kelp forest ----------
  const [k0, k1] = zr('kelp');
  const kelpMat = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x0a2a14 });
  kelpMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07; transformed.x += sin(time * 0.8 + ph + position.y * 2.5) * position.y * 0.3;'); };
  const kelpG = mergeGeometries([0, 1].map(k => new THREE.PlaneGeometry(0.9, 1, 1, 10).translate(0, 0.5, 0).rotateY(k * Math.PI / 2)));
  const kelp = []; for (let t = 0; t < 2400 * Q + 200; t++) { const span = r() < 0.75 ? [k0 - 60, k1 + 60] : [0, L]; const [x, z] = roadside(span[0], span[1], E + 2, span[1] - span[0] < L ? 70 : 30); if (near(x, z, 30).d < E + 1.5) continue; kelp.push([x, floor(x, z), z, (span[1] - span[0] < L ? 12 : 4) + r() * 20, r() * 6]); }
  inst(kelpG, kelpMat, kelp, (m, [x, y, z, h, a]) => m.copy(TRS(x, y, z, a, 1, h, 1)));

  // ---------- glass tunnel down into the trench ----------
  {
    const [u0, u1] = cfg.tube, a = idx(u0), b = idx(u1), R = E + 1.4, segs = 14, pos = [], ind = [];
    for (let i = a; i <= b; i++) for (let k = 0; k <= segs; k++) { const th = Math.PI * k / segs, off = -Math.cos(th) * R, hy = Math.sin(th) * R * 0.85 + 0.9;
      pos.push(track.px[i] + track.nx[i] * off, track.py[i] + hy, track.pz[i] + track.nz[i] * off); if (i < b && k < segs) { const p = (i - a) * (segs + 1) + k, q = p + segs + 1; ind.push(p, q, p + 1, q, q + 1, p + 1); } }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(ind); tg.computeVertexNormals();
    const tube = new THREE.Mesh(tg, new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(vec3(0.5, 0.9, 1.0), 0.04 + min(f, 0.6) * 0.22); }` }));
    tube.renderOrder = 4; group.add(tube);
    const ribs = []; for (let i = a; i <= b; i += Math.round(12 / step)) ribs.push(i);
    inst(new THREE.TorusGeometry(R, 0.18, 6, 24, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 2.0), toneMapped: false }), ribs, (m, i) => m.copy(TRS(track.px[i], track.py[i] + 0.9, track.pz[i], Math.atan2(track.tx[i], track.tz[i]), 1, 0.85, 1)));
  }

  // ---------- shipwreck ----------
  {
    const i = idx(cfg.wreck), sd = 1, off = sd * (E + 34), x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
    const W0 = new THREE.Group(); W0.position.set(x, floor(x, z) + 1, z); W0.rotation.set(0.12, Math.atan2(track.tx[i], track.tz[i]) + 0.4, -0.35); group.add(W0);
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 }), rust = new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9, metalness: 0.2 });
    // hull: a lathe of the cross-section, cut open along the top
    const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 6 * (0.35 + 0.65 * Math.sin(t * Math.PI)), (t - 0.5) * 40)); }
    const hull = new THREE.Mesh(new THREE.LatheGeometry(pts, 20, Math.PI * 0.5, Math.PI), wood); hull.rotation.set(Math.PI / 2, 0, 0); hull.scale.set(1, 1, 0.8); hull.castShadow = true; W0.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 30), wood); deck.position.set(0, 0.1, 0); deck.rotation.z = 0.05; W0.add(deck);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 6), rust); cabin.position.set(0, 1.7, -8); W0.add(cabin);
    for (const [zz, h, tilt] of [[6, 18, 0.25], [-3, 11, -0.6]]) { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h, 8), wood); mast.position.set(0, h / 2, zz); mast.rotation.z = tilt; W0.add(mast); }
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 2), rust); rudder.position.set(0, -3, -20); W0.add(rudder);
    // coral and anemones have colonised it
    for (let k = 0; k < 30; k++) { const c = new THREE.Mesh(brainG, new THREE.MeshStandardMaterial({ color: CORAL[k % CORAL.length], roughness: 0.8, flatShading: true })); c.position.set((r() - 0.5) * 7, 0.3, (r() - 0.5) * 28); c.scale.setScalar(0.4 + r() * 0.8); W0.add(c); }
  }

  // ---------- jellyfish, fish, a whale, bubbles, light shafts ----------
  const jel = []; for (let t = 0; t < 120 * Q + 20; t++) { const [x, z, i] = roadside(0, L, E + 4, 80); jel.push([x, track.py[i] + 4 + r() * 25, z, 0.8 + r() * 2, r() * 6]); }
  const jelly = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.8, 2.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), jel.length); group.add(jelly);
  const tent = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 1, 8, 1, true).rotateX(Math.PI).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.5, 1.6), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), jel.length); group.add(tent);
  const fishGeo = mergeGeometries([part(new THREE.SphereGeometry(0.35, 8, 6), 0xffffff, TRS(0, 0, 0, 0, 0.55, 0.8, 1.6), r, 0), part(new THREE.ConeGeometry(0.3, 0.5, 4), 0xffffff, TRS(0, 0, -0.65, 0, 0.3, 1, 1, -Math.PI / 2), r, 0)]);
  const FISH = [0xffd040, 0x40c8ff, 0xff7a4a, 0xf0f0f0, 0x9a6aff].map(c => new THREE.Color(c));
  const schools = []; for (let k = 0; k < 22; k++) { const [x, z, i] = roadside(0, L, E + 8, 45); schools.push([x, track.py[i] + 3 + r() * 10, z, 6 + r() * 9]); }
  const fishN = Math.round(450 * Q + 60), fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0x102030 }), fishN);
  const fishData = []; for (let k = 0; k < fishN; k++) { fishData.push([k % schools.length, r() * 6.28, (r() - 0.5) * 5, 0.7 + r() * 0.5, (r() - 0.5) * 4]); fish.setColorAt(k, FISH[(k % schools.length) % FISH.length]); }
  group.add(fish);
  const whale = new THREE.Group();
  { const skin = new THREE.MeshStandardMaterial({ color: 0x3a4e60, roughness: 0.7 }), belly = new THREE.MeshStandardMaterial({ color: 0x9aaab0, roughness: 0.7 });
    const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - t * 0.55) * 3.2 + 0.05, t * 22 - 11)); }
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), skin); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.8); whale.add(body);
    const bel = new THREE.Mesh(new THREE.LatheGeometry(pts, 18, Math.PI * 0.75, Math.PI * 0.5), belly); bel.rotation.x = Math.PI / 2; bel.scale.set(1.01, 1.01, 0.81); whale.add(bel);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 3), skin); tail.position.set(0, 0, -11.5); whale.add(tail); whale.userData.tail = tail;
    for (const sd of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 1.6), skin); fin.position.set(sd * 4, -1.2, 3); fin.rotation.set(0, sd * 0.5, sd * -0.4); whale.add(fin); }
    whale.scale.setScalar(1.8); group.add(whale); }
  const wi = idx(zr('coral2')[0] + 500), wC = new THREE.Vector3(track.px[wi] + track.nx[wi] * 70, 22, track.pz[wi] + track.nz[wi] * 70);
  const vents = []; for (let k = 0; k < 40; k++) { const [x, z] = roadside(0, L, E + 3, 30); vents.push([x, floor(x, z), z]); }
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd8f8ff, transparent: true, opacity: 0.5 }), vents.length * 10); group.add(bub);
  const shafts = []; for (let k = 0; k < 50 * Q + 10; k++) { const [x, z] = roadside(0, L, 0, 120); shafts.push([x, z, (r() - 0.5) * 0.5]); }
  inst(new THREE.CylinderGeometry(2, 9, 1, 8, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.55, 0.6), transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), shafts,
    (m, [x, z, t]) => m.copy(TRS(x, SURF, z, 0, 1, SURF + 40, 1, 0, 0.25 + t)));

  // ---------- pink seahorses ----------
  const SH = seahorseGeo();
  const horseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: 0x5a1038, metalness: 0.05 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xffb0dc, transparent: true, opacity: 0.75, side: THREE.DoubleSide, emissive: 0x6a2040 });
  finMat.onBeforeCompile = sh => { sh.uniforms.time = time; sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.x += sin(time * 22.0 + instanceMatrix[3].x) * 0.035 * smoothstep(-0.05, 0.08, abs(position.z + 0.0));'); };
  const horses = [];
  // little herds along the whole lap, thickest in the coral gardens; some hang right over the road
  for (let h = 0; h < 46 * Q + 14; h++) {
    const coral = r() < 0.65, sp = coral ? pickSpan(coralSpans) : [0, L], i = idx(sp[0] + r() * (sp[1] - sp[0])), over = r() < 0.25;
    const sd = r() < 0.5 ? -1 : 1, off = over ? (r() - 0.5) * 6 : sd * (E + 3 + r() * 16);
    const n = 3 + Math.floor(r() * 5), bx = track.px[i] + track.nx[i] * off, bz = track.pz[i] + track.nz[i] * off, by = track.py[i] + (over ? 5 + r() * 4 : 1.2 + r() * 5);
    for (let k = 0; k < n; k++) horses.push({ x: bx + (r() - 0.5) * 5, y: by + (r() - 0.5) * 2.5, z: bz + (r() - 0.5) * 5, s: 1.1 + r() * 1.3, ph: r() * 6.28, R: 1 + r() * 3, sp: (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.25), face: r() * 6.28 });
  }
  // the giant seahorse arch over the finish
  const ai = idx(cfg.arch), ayaw = Math.atan2(track.tx[ai], track.tz[ai]);
  const giants = [-1, 1].map(sd => ({ x: track.px[ai] + track.nx[ai] * sd * (E + 3), y: track.py[ai] + 10.5, z: track.pz[ai] + track.nz[ai] * sd * (E + 3), s: 22, ph: sd, R: 0, sp: 0, face: ayaw - sd * Math.PI / 2, giant: true }));
  const all = [...horses, ...giants];
  const hb = new THREE.InstancedMesh(SH.body, horseMat, all.length), hf = new THREE.InstancedMesh(SH.fin, finMat, all.length);
  hb.castShadow = true; group.add(hb, hf);
  // a ring of pink coral at the foot of each giant
  for (const g of giants) for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, c = new THREE.Mesh(branchG, new THREE.MeshStandardMaterial({ color: k % 2 ? 0xff6fb8 : 0xffa0d0, roughness: 0.7, flatShading: true })); c.position.set(g.x + Math.cos(a) * 3, floor(g.x, g.z), g.z + Math.sin(a) * 3); c.scale.setScalar(2 + r() * 1.5); group.add(c); }

  const q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function update(t, dt, cam) {
    time.value = t;
    // seahorses: drift in slow circles, bob, rock gently; the giants just sway
    all.forEach((H, k) => {
      const a = H.ph + t * H.sp, x = H.x + Math.cos(a) * H.R, z = H.z + Math.sin(a) * H.R, y = H.y + Math.sin(t * 0.9 + H.ph * 3) * (H.giant ? 0.4 : 0.35);
      const yaw = H.giant ? H.face : H.sp > 0 ? -a : -a + Math.PI;
      e4.set(H.giant ? 0.32 + Math.sin(t * 0.7 + H.ph) * 0.03 : Math.sin(t * 0.7 + H.ph) * 0.15, yaw, Math.sin(t * 0.5 + H.ph * 2) * 0.08, 'YXZ'); q4.setFromEuler(e4);
      m4.compose(v4.set(x, y, z), q4, s4.set(H.s, H.s, H.s)); hb.setMatrixAt(k, m4); hf.setMatrixAt(k, m4);
    });
    hb.instanceMatrix.needsUpdate = hf.instanceMatrix.needsUpdate = true;
    jel.forEach(([x, y, z, sc, ph], k) => { const p = Math.sin(t * 0.8 + ph), yy = y + Math.sin(t * 0.3 + ph) * 3;
      m4.makeScale(sc, sc * (1 + 0.15 * p), sc); m4.setPosition(x, yy, z); jelly.setMatrixAt(k, m4);
      m4.makeScale(sc * (1 - 0.1 * p), sc * 3.5, sc * (1 - 0.1 * p)); m4.setPosition(x, yy, z); tent.setMatrixAt(k, m4); });
    jelly.instanceMatrix.needsUpdate = tent.instanceMatrix.needsUpdate = true;
    fishData.forEach(([si, ph, dy, sp, dr], k) => { const [x, y, z, R] = schools[si], a = ph + t * 0.5 * sp, rr = R + dr;
      e4.set(0, -a, 0); q4.setFromEuler(e4); m4.compose(v4.set(x + Math.cos(a) * rr, y + dy + Math.sin(t + ph) * 0.5, z + Math.sin(a) * rr), q4, one); fish.setMatrixAt(k, m4); });
    fish.instanceMatrix.needsUpdate = true;
    const wa = t * 0.02; whale.position.set(wC.x + Math.cos(wa) * 160, wC.y + Math.sin(t * 0.2) * 3, wC.z + Math.sin(wa) * 160); whale.rotation.y = -wa + Math.PI; whale.userData.tail.rotation.x = Math.sin(t * 1.2) * 0.35;
    vents.forEach(([x, y, z], v) => { for (let q = 0; q < 10; q++) { const ph = (t * 0.22 + q / 10 + v * 0.13) % 1; m4.makeTranslation(x + Math.sin(ph * 20 + q) * 0.5, y + ph * 40, z + Math.cos(ph * 17 + q) * 0.5); bub.setMatrixAt(v * 10 + q, m4); } });
    bub.instanceMatrix.needsUpdate = true;
  }
  return { update, SURF };
}
