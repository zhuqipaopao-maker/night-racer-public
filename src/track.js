import * as THREE from 'three';
import { t as T, LANG } from './i18n.js';
import { neonRoadTexture, roadTexture, puddleTexture, curbTexture, concreteTexture, bannerTexture, fenceTexture, radialTexture, checkerTexture, gantryTexture, mountainRoadTexture, gravelTexture, chevronTexture, stoneRoadTexture, forestRoadTexture, forestDirt, DIRT_GLSL, brickTexture, plaqueTexture } from './textures.js';
import { ctrlHeights } from './maps.js';
import { cityBranches, resample } from './paths.js';

// City barrier dimensions (the city map's sidewalk/buildings are laid out from these).
export const WALL_T = 0.6;
export const WALL_H = 1.1;
export const WALK = 5;

export class Track {
  constructor(cfg) {
    this.cfg = cfg;
    this.half = cfg.half;                       // half road width
    this.edge = cfg.half + cfg.curb;            // where barriers / guardrails stand
    this.driveLimit = this.edge - 1.05;         // car centre may not go past this lateral offset
    const H = ctrlHeights(cfg.ctrl);
    this.curve = new THREE.CatmullRomCurve3(cfg.ctrl.map((p, i) => new THREE.Vector3(p[0], H[i], p[1])), true, 'centripetal');
    this.length = this.curve.getLength();
    const N = this.N = Math.round(this.length / 1.5);
    this.step = this.length / N;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = this.curve.getPointAt(i / N), t = this.curve.getTangentAt(i / N);
      t.y = 0; t.normalize();
      this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z; this.tx[i] = t.x; this.tz[i] = t.z;
      this.nx[i] = -t.z; this.nz[i] = t.x; // right-hand side of travel
    }
    if (cfg.profile) this.applyProfile(cfg.profile);
    // smooth the height profile (spline kinks between control points would otherwise act like tiny ramps at speed)
    for (let pass = 0; pass < (cfg.profile ? 0 : 3); pass++) {
      const src = Float32Array.from(this.py), R = 10;
      for (let i = 0; i < N; i++) { let s = 0; for (let d = -R; d <= R; d++) s += src[(i + d + N) % N]; this.py[i] = s / (2 * R + 1); }
    }
    // crests: gaussian bumps added on top of the smooth profile. Only near these can a car leave the ground.
    this.launch = new Uint8Array(N);
    for (const [s0, hgt, w] of cfg.bumps || []) for (let i = 0; i < N; i++) {
      let ds = i * this.step - s0; if (Math.abs(ds) > 4 * w) continue;
      this.py[i] += hgt * Math.exp(-(ds * ds) / (2 * w * w));
      if (ds > -1.5 * w && ds < 2 * w) this.launch[i] = 1;
    }
    // grade (rise over run) and smoothed signed curvature (positive = left bend)
    this.grade = new Float32Array(N); this.k = new Float32Array(N);
    const ang = i => Math.atan2(this.tx[this.wrap(i)], this.tz[this.wrap(i)]);
    for (let i = 0; i < N; i++) {
      this.grade[i] = (this.py[this.wrap(i + 3)] - this.py[this.wrap(i - 3)]) / (6 * this.step);
      const d = ang(i + 5) - ang(i - 5);
      this.k[i] = Math.atan2(Math.sin(d), Math.cos(d)) / (10 * this.step);
    }
    this.buildLayers(cfg);
    if (cfg.branches) this.buildPaths(cfg);
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < N; i++) {
      minx = Math.min(minx, this.px[i]); maxx = Math.max(maxx, this.px[i]); minz = Math.min(minz, this.pz[i]); maxz = Math.max(maxz, this.pz[i]);
      miny = Math.min(miny, this.py[i]); maxy = Math.max(maxy, this.py[i]);
    }
    this.bounds = { minx, maxx, minz, maxz, miny, maxy };
  }

  wrap(i) { const N = this.N; return ((i % N) + N) % N; }

  // Heights straight from distance keys [s, y, ease] (ease of the segment ending at that key).
  applyProfile(keys) {
    const E = { in: t => t * t, out: t => 1 - (1 - t) * (1 - t), lin: t => t };
    const at = s => {
      for (let k = 1; k < keys.length; k++) if (s <= keys[k][0]) {
        const [s0, y0] = keys[k - 1], [s1, y1, e] = keys[k], t = (s - s0) / Math.max(1e-6, s1 - s0);
        return y0 + (y1 - y0) * (E[e] ? E[e](t) : t * t * (3 - 2 * t));
      }
      return keys[keys.length - 1][1];
    };
    this.profileAt = at;
    for (let i = 0; i < this.N; i++) this.py[i] = at(i * this.step);
  }

  // Optional layered road: gaps in the deck, a lower road, split lanes, narrow/no-wall stretches, boost pads.
  buildLayers(cfg) {
    const N = this.N, idx = m => Math.round(m / this.step);
    const flag = list => { const a = new Uint8Array(N); for (const [m0, m1] of list || []) for (let i = idx(m0); i <= idx(m1); i++) a[this.wrap(i)] = 1; return a; };
    this.layered = !!(cfg.gaps || cfg.lower || cfg.noWall);
    this.up = Float32Array.from(this.py);
    this.low = new Float32Array(N).fill(NaN);
    this.halfAt = new Float32Array(N).fill(this.half);
    this.gap = flag(cfg.gaps); this.split = flag(cfg.split); this.noWall = flag(cfg.noWall); this.divider = flag(cfg.divider);
    this.boost = flag(cfg.boost); this.bigAir = flag(cfg.bigAir); this.exposed = flag(cfg.exposed); this.lowG = flag(cfg.lowG);
    if (!this.layered) return;
    for (const [m0, m1] of cfg.gaps || []) {
      const a = idx(m0), b = idx(m1);
      for (let i = a + 1; i < b; i++) { this.up[i] = NaN; this.py[i] = this.py[a] + (this.py[b] - this.py[a]) * (i - a) / (b - a); }
    }
    for (const L of cfg.lower || []) {
      const E = { in: t => t * t, out: t => 1 - (1 - t) * (1 - t), lin: t => t };
      const at = s => { const K = L.keys; for (let k = 1; k < K.length; k++) if (s <= K[k][0]) { const [s0, y0] = K[k - 1], [s1, y1, e] = K[k], t = (s - s0) / (s1 - s0); return y0 + (y1 - y0) * (E[e] ? E[e](t) : t * t * (3 - 2 * t)); } return K[K.length - 1][1]; };
      for (let i = idx(L.from); i <= idx(L.to); i++) this.low[i] = at(i * this.step);
    }
    for (const [m0, m1, h] of cfg.narrow || []) for (let i = idx(m0); i <= idx(m1); i++) this.halfAt[i] = h;
    const g = arr => { const out = new Float32Array(N); for (let i = 0; i < N; i++) {
      const a = arr[this.wrap(i - 2)], b = arr[this.wrap(i + 2)], c = arr[i];
      out[i] = Number.isFinite(a) && Number.isFinite(b) ? (b - a) / (4 * this.step) : Number.isFinite(a) && Number.isFinite(c) ? (c - a) / (2 * this.step) : Number.isFinite(b) && Number.isFinite(c) ? (b - c) / (2 * this.step) : 0;
    } return out; };
    this.gUp = g(this.up); this.gLow = g(this.low);
    this.respawnZones = (cfg.respawn || []).map(([a, b, r]) => [idx(a), idx(b), idx(r)]);
  }

  // Road surface under (x, z) at lateral offset `off` for a car currently at height y:
  // the highest deck at or just below the car (so a car can drive up ramps but drops through gaps).
  surfaceAt(i, x, z, off, y) {
    if (!this.layered) return { y: this.heightAt(i, x, z), g: this.gradeAt(i, x, z), layer: 'up' };
    if (this.noWall[i] && Math.abs(off) > this.halfAt[i] + 0.4) return { y: -Infinity };
    const along = (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i];
    const j = this.wrap(i + (along >= 0 ? 1 : -1)), t = Math.min(1, Math.abs(along) / this.step);
    // at a deck end (ramp lip) the next sample is missing: carry on along the last slope instead of flattening
    const L = arr => { const a = arr[i], b = arr[j]; if (Number.isFinite(b)) return a + (b - a) * t; const c = arr[this.wrap(2 * i - j)]; return Number.isFinite(c) ? a + (a - c) * t : a; };
    let best = -Infinity, g = 0, layer = null;
    const sp = this.split[i];
    if (Number.isFinite(this.up[i]) && (!sp || off < 0)) { const h = L(this.up); if (h <= y + 0.8) { best = h; g = this.gUp[i]; layer = 'up'; } }
    // (the low road also runs under the ramp deck, for cars that fell short of the jump)
    if (Number.isFinite(this.low[i]) && (!sp || off >= 0 || y < this.up[i] - 1.5)) { const h = L(this.low); if (h <= y + 0.8 && h > best) { best = h; g = this.gLow[i]; layer = 'low'; } }
    return { y: best, g, layer };
  }

  // where to put a car back after it fell: a little before the last place it drove, outside any jump
  respawnIndex(i) {
    for (const [a, b, r] of this.respawnZones || []) if (i >= a && i <= b) return r;
    let k = this.wrap(i - 20);
    for (let n = 0; n < 200 && (!Number.isFinite(this.up[k]) || this.split[k] || this.noWall[k]); n++) k = this.wrap(k - 4);
    return k;
  }

  // Side roads (street maps): each one a centreline of its own whose samples map onto main-loop progress,
  // so laps, positions and the minimap keep working whichever way a car goes.
  buildPaths(cfg) {
    const N = this.N, aLat = 25;
    const nearestMain = (x, z) => { let b = 0, bd = 1e18; for (let i = 0; i < N; i++) { const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
    this.paths = cityBranches(cfg).map(b => {
      const pts = resample(b.pts, this.step), K = pts.length, A = n => new Float32Array(n);
      const P = { id: b.id, name: b.name, kind: b.kind, half: b.half, edge: b.half + cfg.curb, K, px: A(K), pz: A(K), tx: A(K), tz: A(K), nx: A(K), nz: A(K), v: A(K), prog: A(K) };
      P.lim = P.edge - 1.05;
      pts.forEach(([x, z], k) => { P.px[k] = x; P.pz[k] = z; });
      for (let k = 0; k < K; k++) { const a = Math.max(0, k - 1), c = Math.min(K - 1, k + 1), dx = P.px[c] - P.px[a], dz = P.pz[c] - P.pz[a], l = Math.hypot(dx, dz) || 1;
        P.tx[k] = dx / l; P.tz[k] = dz / l; P.nx[k] = -P.tz[k]; P.nz[k] = P.tx[k]; }
      // speed limit from curvature (AI)
      const ang = k => Math.atan2(P.tx[Math.max(0, Math.min(K - 1, k))], P.tz[Math.max(0, Math.min(K - 1, k))]);
      for (let k = 0; k < K; k++) { const d = ang(k + 6) - ang(k - 6), kap = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) / (12 * this.step); P.v[k] = Math.min(80, Math.sqrt(aLat / Math.max(kap, 1e-4))); }
      for (let pass = 0; pass < 3; pass++) { const v = Float32Array.from(P.v); for (let k = 0; k < K; k++) { let m = 0, n = 0; for (let d = -4; d <= 4; d++) { const j = k + d; if (j >= 0 && j < K) { m += v[j]; n++; } } P.v[k] = Math.min(P.v[k], m / n + 2); } }
      P.i0 = nearestMain(P.px[0], P.pz[0]); P.i1 = nearestMain(P.px[K - 1], P.pz[K - 1]);
      P.span = (P.i1 - P.i0 + N) % N;
      for (let k = 0; k < K; k++) P.prog[k] = (P.i0 + P.span * k / (K - 1)) % N;
      return P;
    });
  }

  // the place on a side road (or the main loop) to put a car back
  pose(path, k, i) {
    const P = path && this.paths ? this.paths.find(p => p.id === path) : null;
    if (P) { k = Math.max(0, Math.min(P.K - 1, k)); return { x: P.px[k], z: P.pz[k], h: Math.atan2(P.tx[k], P.tz[k]), y: 0, i: Math.round(P.prog[k]) % this.N }; }
    return { x: this.px[i], z: this.pz[i], h: Math.atan2(this.tx[i], this.tz[i]), y: this.py[i], i };
  }

  // Nearest road (plan view): on street maps, whichever of the main loop and the side roads the car is
  // most comfortably inside. i is always main-loop progress; off / normals are relative to that road.
  nearest(x, z, hint = -1) {
    const m = this.nearestMain(x, z, hint);
    if (!this.paths) return m;
    const N = this.N;
    Object.assign(m, { lim: this.driveLimit, path: 0, k: m.i, nx: this.nx[m.i], nz: this.nz[m.i], tx: this.tx[m.i], tz: this.tz[m.i] });
    let best = m, bestEx = Math.abs(m.off) - m.lim;
    for (const P of this.paths) {
      let k0 = 0, k1 = P.K - 1;
      if (hint >= 0) {
        const rel = (hint - P.i0 + N) % N;
        if (rel > P.span + 60 && rel < N - 60) continue;
        const kk = Math.round(Math.max(0, Math.min(1, (rel > P.span + 60 ? 0 : rel) / P.span)) * (P.K - 1));
        k0 = Math.max(0, kk - 90); k1 = Math.min(P.K - 1, kk + 90);
      }
      let bk = -1, bd = 1e18;
      for (let k = k0; k <= k1; k++) { const dx = x - P.px[k], dz = z - P.pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } }
      if (bk < 0) continue;
      const off = (x - P.px[bk]) * P.nx[bk] + (z - P.pz[bk]) * P.nz[bk], ex = Math.abs(off) - P.lim;
      // at the very ends a side road lies on the main road: only count it once the car is properly on it
      if (ex < bestEx - 0.01) { bestEx = ex; best = { i: Math.round(P.prog[bk]) % N, off, lim: P.lim, path: P.id, k: bk, nx: P.nx[bk], nz: P.nz[bk], tx: P.tx[bk], tz: P.tz[bk] }; }
    }
    return best;
  }

  nearestMain(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < this.N; i++) { const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    } else {
      for (let k = -45; k <= 45; k++) { const i = this.wrap(hint + k); const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    }
    const off = (x - this.px[best]) * this.nx[best] + (z - this.pz[best]) * this.nz[best];
    return { i: best, off };
  }

  // Road surface height at (x, z) near sample i — interpolated along the centreline.
  heightAt(i, x, z) { return this.lerpAt(this.py, i, x, z); }

  // Linear interpolation of a per-sample array along the segment from sample i toward its neighbour
  // on the side of (x, z). Projecting onto the actual segment keeps it continuous where the nearest sample switches.
  lerpAt(arr, i, x, z) {
    const along = (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i];
    const j = this.wrap(i + (along >= 0 ? 1 : -1));
    const sx = this.px[j] - this.px[i], sz = this.pz[j] - this.pz[i];
    const t = Math.max(0, Math.min(1, ((x - this.px[i]) * sx + (z - this.pz[i]) * sz) / (sx * sx + sz * sz)));
    return arr[i] + (arr[j] - arr[i]) * t;
  }

  // Grade interpolated along the centreline like heightAt, so pitch doesn't step every sample.
  gradeAt(i, x, z) { return this.lerpAt(this.grade, i, x, z); }

  // Like strip() but only over samples i0..i1, and the lateral offsets may depend on the sample (fn(i) → number).
  stripRange(i0, i1, a, b, ya, yb, tile) {
    const n = i1 - i0, pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
    const val = (v, i) => (typeof v === 'function' ? v(i) : v);
    for (let k = 0; k <= n; k++) {
      const i = this.wrap(i0 + k), y = this.py[i], A = val(a, i), Bv = val(b, i);
      pos.set([this.px[i] + this.nx[i] * A, y + val(ya, i), this.pz[i] + this.nz[i] * A, this.px[i] + this.nx[i] * Bv, y + val(yb, i), this.pz[i] + this.nz[i] * Bv], k * 6);
      uv.set([0, k * this.step / tile, 1, k * this.step / tile], k * 4);
      if (k < n) { const j = k * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  // Strip mesh between lateral offsets a→b at heights ya→yb above the road; u 0→1 across, v = distance / tile.
  strip(a, b, ya, yb, tile) {
    const N = this.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N, v = (i * this.step) / tile, y = this.py[k];
      pos.set([this.px[k] + this.nx[k] * a, y + ya, this.pz[k] + this.nz[k] * a, this.px[k] + this.nx[k] * b, y + yb, this.pz[k] + this.nz[k] * b], i * 6);
      uv.set([0, v, 1, v], i * 4);
      if (i < N) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  build(scene) {
    const group = new THREE.Group();
    if (this.cfg.style === 'metro') { /* streets are built by metro.js */ }
    else if (this.cfg.style === 'city') this.buildCityRoad(group);
    else if (this.cfg.style === 'ancient') this.buildAncientRoad(group);
    else if (this.cfg.style === 'sky' || this.cfg.style === 'dream' || this.cfg.style === 'deep' || this.cfg.style === 'canyon' || this.cfg.style === 'reef' || this.cfg.style === 'ice' || this.cfg.style === 'film' || this.cfg.style === 'colossus') this.buildSkyRoad(group);
    else this.buildMountainRoad(group);
    this.buildStart(group);
    scene.add(group);
    this.group = group;
    return group;
  }

  buildCityRoad(group) {
    const HALF = this.half, WALL_IN = this.edge;
    group.add(new THREE.Mesh(this.strip(-HALF, HALF, 0, 0, 32), new THREE.MeshStandardMaterial({
      map: roadTexture(), roughnessMap: puddleTexture(), roughness: 0.7, metalness: 0.05, envMapIntensity: 1.3, color: 0xd8d8d8 })));
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.4, envMapIntensity: 0.8 });
    for (const s of [-1, 1]) group.add(new THREE.Mesh(this.strip(s * HALF, s * WALL_IN, 0.0, 0.06, 4), curbMat));

    // Concrete barriers with sponsor banners on the inner face, catch fence on top, sidewalk behind.
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.12, side: THREE.DoubleSide });
    bannerMat.emissiveMap = bannerMat.map;
    const concrete = concreteTexture();
    const wallMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.85, side: THREE.DoubleSide });
    const fenceTex = fenceTexture(); fenceTex.repeat.set(1.6, 1);
    const fenceMat = new THREE.MeshStandardMaterial({ alphaMap: fenceTex, transparent: true, color: 0x9aa2b0, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false });
    const walkMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.6, envMapIntensity: 1.0, color: 0x9a9a9a });
    const bannerLeft = bannerMat.clone();
    bannerLeft.map = bannerMat.map.clone(); bannerLeft.map.repeat.set(1, -1); bannerLeft.emissiveMap = bannerLeft.map;
    for (const s of [-1, 1]) {
      const inner = s * WALL_IN, outer = s * (WALL_IN + WALL_T);
      group.add(new THREE.Mesh(this.strip(inner, inner, 0, WALL_H, 16), s < 0 ? bannerLeft : bannerMat));
      group.add(new THREE.Mesh(this.strip(inner, outer, WALL_H, WALL_H, 4), wallMat));
      group.add(new THREE.Mesh(this.strip(outer, outer, WALL_H, 0, 4), wallMat));
      const fence = new THREE.Mesh(this.strip(s * (WALL_IN + 0.3), s * (WALL_IN + 0.3), WALL_H, WALL_H + 2.6, 1.8), fenceMat);
      fence.renderOrder = 2; group.add(fence);
      group.add(new THREE.Mesh(this.strip(outer, s * (WALL_IN + WALL_T + WALK), 0.15, 0.15, 8), walkMat));
    }
    this.buildStreetLights(group);
  }

  // 长安: bluestone paving, stone kerbs; at street level a low carved-stone balustrade, up on the wall a
  // crenellated parapet, and solid brick sides wherever the road runs raised (ramps and wall top).
  buildAncientRoad(group) {
    const H = this.half, E = this.edge;
    group.add(new THREE.Mesh(this.strip(-H, H, 0, 0, 32), new THREE.MeshStandardMaterial({ map: stoneRoadTexture(H * 2), roughness: 0.72, metalness: 0.02, envMapIntensity: 0.45 })));
    const kerb = new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 0.8 });
    for (const s of [-1, 1]) group.add(new THREE.Mesh(this.strip(s * H, s * E, 0.02, 0.1, 4), kerb));
    const brick = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9, side: THREE.DoubleSide });
    brick.map.repeat.set(1, 1);
    const marble = new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.6 });
    // raised runs: sample index ranges where the road is more than 0.8 m above ground (excluding the arch bridge)
    const ab = this.cfg.archBridge ? this.cfg.archBridge.map(m => Math.round(m / this.step)) : [-1, -1];
    const raised = i => this.py[i] > 0.8 && !(i >= ab[0] - 4 && i <= ab[1] + 4);
    const runs = []; let st = -1;
    for (let i = 0; i <= this.N; i++) { const on = i < this.N && raised(i); if (on && st < 0) st = i; if (!on && st >= 0) { runs.push([st, i]); st = -1; } }
    this.raisedRuns = runs;
    const wallW = E + 1.4;
    for (const [a, b] of runs) {
      for (const s of [-1, 1]) {
        // brick side down to the ground, parapet on top
        const side = new THREE.Mesh(this.stripRange(a, b, s * wallW, s * wallW, i => -this.py[i] - 0.1, 1.3, 3), brick);
        side.geometry.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * 3; });
        group.add(side);
        group.add(new THREE.Mesh(this.stripRange(a, b, s * E, s * E, 0, 1.3, 3), brick));                 // parapet inner face
        group.add(new THREE.Mesh(this.stripRange(a, b, s * E, s * wallW, 1.3, 1.3, 3), brick));            // parapet top
      }
      group.add(new THREE.Mesh(this.stripRange(a, b, -wallW, wallW, i => -this.py[i] - 0.05, i => -this.py[i] - 0.05, 8), brick));   // underside (seen from ramps' ends)
    }
    // crenellations (merlons) on the outer parapets of raised runs
    const merlons = [];
    const every = Math.max(1, Math.round(2.6 / this.step));
    for (const [a, b] of runs) for (let i = a; i < b; i += every) for (const s of [-1, 1]) merlons.push([i, s]);
    const mer = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.9, 1.4), brick, merlons.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    merlons.forEach(([i, s], k) => { e.set(0, Math.atan2(this.tx[i], this.tz[i]), 0); q.setFromEuler(e); m.compose(new THREE.Vector3(this.px[i] + this.nx[i] * s * (E + 0.7), this.py[i] + 1.75, this.pz[i] + this.nz[i] * s * (E + 0.7)), q, one); mer.setMatrixAt(k, m); });
    group.add(mer);
    // street-level stone balustrade: posts + rail
    const low = []; for (let i = 0; i < this.N; i += Math.max(1, Math.round(2.2 / this.step))) if (!raised(i) && !(i >= ab[0] - 4 && i <= ab[1] + 4)) for (const s of [-1, 1]) low.push([i, s]);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.85, 0.28), marble, low.length);
    low.forEach(([i, s], k) => { e.set(0, Math.atan2(this.tx[i], this.tz[i]), 0); q.setFromEuler(e); m.compose(new THREE.Vector3(this.px[i] + this.nx[i] * s * (E + 0.2), this.py[i] + 0.42, this.pz[i] + this.nz[i] * s * (E + 0.2)), q, one); posts.setMatrixAt(k, m); });
    group.add(posts);
    const railRuns = []; st = -1;
    for (let i = 0; i <= this.N; i++) { const on = i < this.N && !raised(i) && !(i >= ab[0] - 4 && i <= ab[1] + 4); if (on && st < 0) st = i; if (!on && st >= 0) { railRuns.push([st, i]); st = -1; } }
    for (const [a, b] of railRuns) for (const s of [-1, 1]) {
      group.add(new THREE.Mesh(this.stripRange(a, b, s * (E + 0.2), s * (E + 0.2), 0.6, 0.85, 3), marble));
      group.add(new THREE.Mesh(this.stripRange(a, b, s * (E + 0.06), s * (E + 0.34), 0.85, 0.85, 3), marble));
    }
    marble.side = THREE.DoubleSide;
  }

  // 天空工地: decks in the air. Upper deck where it exists (left half in split lanes), the low road (right half
  // in split lanes, full width under the fork jump), deck slabs with thickness, jersey barriers except on the
  // crane jib, a wall between split lanes, hazard stripes at every deck end, glowing boost chevrons.
  buildSkyRoad(group) {
    const H = this.half, E = this.edge, N = this.N;
    const runs = pred => { const out = []; let st = -1; for (let i = 0; i <= N; i++) { const on = i < N && pred(i); if (on && st < 0) st = i; if (!on && st >= 0) { if (i - 1 > st) out.push([st, i - 1]); st = -1; } } return out; };   // inclusive [first, last] sample
    const reef = this.cfg.style === 'reef';
    const dream = this.cfg.style === 'dream' || this.cfg.style === 'deep' || reef;   // (the reef gets the glowing edges too: bioluminescent)
    const asphalt = reef ? new THREE.MeshStandardMaterial({ map: mountainRoadTexture(H * 2), color: 0x9fb8b4, roughness: 0.85, envMapIntensity: 0.4 })
      : dream ? new THREE.MeshStandardMaterial({ map: neonRoadTexture(H * 2), roughness: 0.45, metalness: 0.15, envMapIntensity: 0.35 })
      : new THREE.MeshStandardMaterial({ map: mountainRoadTexture(H * 2), roughness: 0.78, envMapIntensity: 0.6 });
    const canyon = this.cfg.style === 'canyon', ice = this.cfg.style === 'ice', forest = this.cfg.style === 'colossus';
    if (forest) {   // a dirt track, mossy edges melting into the forest floor
      asphalt.map = forestRoadTexture(E * 2); asphalt.color.set(0xffffff); asphalt.roughness = 0.95; asphalt.envMapIntensity = 0.3;
      asphalt.bumpMap = asphalt.map; asphalt.bumpScale = 2.5;   // the ruts
      const dirt = forestDirt(), EE = E;
      // the soil is a real photograph (+ its normal map) in world space; the drawn texture only adds the ruts, damp
      // edges, roots, needles and grass; the road's edge is worn ragged (noise) so it dissolves into the verge under it
      asphalt.onBeforeCompile = sh => {
        sh.uniforms.uDirt = { value: dirt.diff }; sh.uniforms.uDirtN = { value: dirt.nor };
        sh.vertexShader = 'attribute float soft; varying float vSoft; varying vec3 vWorldP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz; vSoft = soft;');
        sh.fragmentShader = 'varying vec3 vWorldP; varying float vSoft; float roadGreen;\n' + DIRT_GLSL + '\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            { vec3 pr = diffuseColor.rgb; roadGreen = smoothstep(0.0, 0.05, pr.g - pr.r);
              float shade = dot(pr, vec3(0.3333)) / 0.62;
              float big = dn(vWorldP.xz * 0.045) * 0.6 + dn(vWorldP.xz * 0.17) * 0.4;
              vec3 soil = dirtAlbedo(vWorldP.xz) * vec3(1.42, 1.24, 1.0) * shade * mix(0.78, 1.22, big);
              soil = mix(soil, soil * vec3(0.9, 0.95, 0.85), smoothstep(0.55, 0.8, dn(vWorldP.xz * 0.03 + 7.0)));
              diffuseColor.rgb = mix(soil, pr, roadGreen);
              float ed = min(vMapUv.x, 1.0 - vMapUv.x) * 2.0 * ${EE.toFixed(3)};
              float thr = vSoft * (0.1 + 1.25 * (dn(vWorldP.xz * 1.7) * 0.6 + dn(vWorldP.xz * 6.0) * 0.4));
              if (ed < thr) discard; }`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec3 d = dirtNormalW(vWorldP.xz); vec3 dv = (viewMatrix * vec4(d, 0.0)).xyz; normal = normalize(normal + dv * (1.0 - roadGreen) * 1.1); }`);
      };
    }
    if (ice) { asphalt.color.set(0xc4d2e2); asphalt.roughness = 0.45; asphalt.envMapIntensity = 0.9; }   // packed snow and ice on the road
    const slab = forest ? new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.95, side: THREE.DoubleSide }) : ice ? new THREE.MeshStandardMaterial({ color: 0x8fb2d4, roughness: 0.6, side: THREE.DoubleSide }) : canyon ? new THREE.MeshStandardMaterial({ color: 0xa8603e, roughness: 0.95, side: THREE.DoubleSide }) : dream ? new THREE.MeshStandardMaterial({ color: 0x120a24, roughness: 0.6, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.9, side: THREE.DoubleSide });
    const jersey = dream ? new THREE.MeshStandardMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.MeshStandardMaterial({ map: concreteTexture(), color: canyon ? 0xe0b890 : ice ? 0xe4eef8 : forest ? 0x7d8a62 : 0xd8d4cc, roughness: 0.85, side: THREE.DoubleSide });
    this.beat = { value: 0 };
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5, emissive: 0x3a2a00 });
    const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.receiveShadow = true; o.castShadow = m !== asphalt; group.add(o); return o; };
    const upY = i => this.up[i] - this.py[i], lowY = i => this.low[i] - this.py[i];
    const halfW = i => (this.halfAt[i] < H ? this.halfAt[i] : E);
    // upper deck
    for (const [a, b] of runs(i => Number.isFinite(this.up[i]))) {
      const L = i => (this.split[i] ? -halfW(i) : -halfW(i)), R = i => (this.split[i] ? 0 : halfW(i));
      const deckG = this.stripRange(a, b, L, R, upY, upY, 32);
      const wl = forest ? (cw => i => cw.some(([p, q]) => i * this.step >= p - 8 && i * this.step <= q + 8))(this.cfg.walls || []) : () => true;
      { const sf = new Float32Array((b - a + 1) * 2);
        for (let k = 0; k <= b - a; k++) sf[k * 2] = sf[k * 2 + 1] = forest && !wl(this.wrap(a + k)) ? 1 : 0;
        deckG.setAttribute('soft', new THREE.BufferAttribute(sf, 1)); }
      mesh(deckG, asphalt);
      mesh(this.stripRange(a, b, L, R, i => upY(i) - 1.1, i => upY(i) - 1.1, 8), slab);             // underside
      const skirt = i => upY(i) - (forest && !wl(i) ? 0 : 1.1);   // forest: no kerb face on the open stretches, the road runs into the ground
      mesh(this.stripRange(a, b, L, L, upY, skirt, 8), slab);
      mesh(this.stripRange(a, b, R, R, upY, skirt, 8), slab);
    }
    // low road
    for (const [a, b] of runs(i => Number.isFinite(this.low[i]))) {
      const L = () => -E, R = () => E;
      { const lg = this.stripRange(a, b, L, R, lowY, lowY, 32); lg.setAttribute('soft', new THREE.BufferAttribute(new Float32Array((b - a + 1) * 2), 1)); mesh(lg, asphalt); }
      mesh(this.stripRange(a, b, L, R, i => lowY(i) - 1.1, i => lowY(i) - 1.1, 8), slab);
      mesh(this.stripRange(a, b, R, R, lowY, i => lowY(i) - (forest ? 0 : 1.1), 8), slab);
      mesh(this.stripRange(a, b, () => E, () => E, lowY, i => lowY(i) + 0.95, 6), jersey);
      mesh(this.stripRange(a, b, () => -E, () => -E, lowY, i => lowY(i) + 0.95, 6), jersey);
    }
    // jersey barriers along the upper deck, except on the crane jib
    const walled = forest ? (cw => i => cw.some(([a, b]) => i * this.step >= a && i * this.step <= b))(this.cfg.walls || []) : () => true;
    for (const [a, b] of runs(i => Number.isFinite(this.up[i]) && !this.noWall[i] && walled(i))) for (const sd of [-1, 1]) {
      const at = i => (this.split[i] && sd > 0 ? 0.0001 : sd * E);
      if (sd > 0) {   // right side: skip split stretches (the centre wall stands there instead)
        for (const [c, d] of runs(i => i >= a && i <= b && !this.split[i])) mesh(this.stripRange(c, d, () => E, () => E, upY, i => upY(i) + 0.95, 6), jersey);
      } else mesh(this.stripRange(a, b, at, at, upY, i => upY(i) + 0.95, 6), jersey);
    }
    // wall between the split lanes, from the low road up past the ramp deck
    for (const [a, b] of runs(i => this.divider[i])) mesh(this.stripRange(a, b, () => 0, () => 0, i => lowY(i) - 1.1, i => (Number.isFinite(this.up[i]) ? Math.max(lowY(i), upY(i)) : lowY(i)) + 0.95, 6), jersey);
    // crane jib: painted yellow edges instead of barriers
    for (const [a, b] of runs(i => this.noWall[i])) for (const sd of [-1, 1]) mesh(this.stripRange(a, b, i => sd * (this.halfAt[i] - 0.25), i => sd * this.halfAt[i], i => upY(i) + 0.02, i => upY(i) + 0.02, 2), yellow);
    // hazard stripes at deck ends (ramp lips and landing edges)
    const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d'); for (let k = -1; k < 5; k++) { g.fillStyle = k % 2 ? '#111' : '#f2b705'; g.beginPath(); g.moveTo(k * 16, 16); g.lineTo(k * 16 + 16, 0); g.lineTo(k * 16 + 32, 0); g.lineTo(k * 16 + 16, 16); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: stripeTex, emissiveIntensity: 0.25 });
    for (let i = 0; i < N; i++) {
      const here = Number.isFinite(this.up[i]), next = Number.isFinite(this.up[this.wrap(i + 1)]), prev = Number.isFinite(this.up[this.wrap(i - 1)]);
      if (here && (!next || !prev)) {
        const w = this.split[i] ? E : 2 * E, cx = this.split[i] ? -E / 2 : 0;
        const m = mesh(new THREE.BoxGeometry(w, 0.6, 0.6), stripeMat);
        m.position.set(this.px[i] + this.nx[i] * cx, this.up[i] - 0.3, this.pz[i] + this.nz[i] * cx);
        m.rotation.y = Math.atan2(this.tx[i], this.tz[i]) + Math.PI / 2; m.rotation.y -= Math.PI / 2;
      }
    }
    // boost pads: glowing chevrons that scroll forward
    const chev = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#3df2ff'; g.lineWidth = 16; g.lineJoin = 'miter'; for (const y of [30, 86]) { g.beginPath(); g.moveTo(14, y + 30); g.lineTo(64, y - 10); g.lineTo(114, y + 30); g.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    this.boostTex = chev;
    const boostMat = new THREE.MeshBasicMaterial({ map: chev, transparent: true, depthWrite: false, color: dream ? new THREE.Color(0.6, 1.0, 1.1) : new THREE.Color(1.6, 2.4, 2.6), toneMapped: false, blending: THREE.AdditiveBlending });
    for (const [a, b] of runs(i => this.boost[i])) { const m = new THREE.Mesh(this.stripRange(a, b, -H + 0.5, i => (this.split[i] ? -0.6 : H - 0.5), i => upY(i) + 0.04, i => upY(i) + 0.04, 4), boostMat); m.renderOrder = 2; group.add(m); }
    // little blue marker lights along the barrier tops
    const marks = [];   // (none in the forest: low mossy stone walls, no lights)
    if (!forest) for (let i = 0; i < N; i += 8) if (Number.isFinite(this.up[i]) && !this.noWall[i]) for (const sd of [-1, 1]) if (!(sd > 0 && this.split[i])) marks.push([this.px[i] + this.nx[i] * sd * E, this.up[i] + 1.0, this.pz[i] + this.nz[i] * sd * E]);
    if (dream) {
      // glowing rails on the glass barriers and neon edge lines, pulsing with the music
      const neon = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false }); m.onBeforeCompile = sh => { sh.uniforms.beat = this.beat; sh.fragmentShader = 'uniform float beat;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= 0.55 + beat * 0.9;'); }; return m; };
      const pink = neon(2.6, 0.35, 1.6), cyan = neon(0.35, 2.0, 2.6);
      // 坠梦: each dream layer has its own pair of edge colours
      const PAL = { grid: [pink, cyan], cloud: [neon(2.8, 1.7, 0.6), neon(2.6, 2.4, 2.0)], city: [neon(2.8, 0.9, 0.3), neon(2.8, 0.3, 0.3)],
        seaTop: [neon(0.3, 2.2, 2.0), neon(0.3, 1.4, 2.8)], sea: [neon(0.3, 2.2, 2.0), neon(0.3, 1.4, 2.8)], space: [neon(2.2, 2.2, 2.8), neon(1.6, 0.7, 2.8)], jungle: [neon(0.7, 2.4, 0.6), neon(2.6, 1.9, 0.5)] };
      const Z = this.cfg.zones, cut = Z ? Z.map(z => Math.round(z[1] / this.step)) : [];
      for (const [a0, b0] of runs(i => Number.isFinite(this.up[i]))) {
        const parts = []; let st = a0;
        for (const c of cut) if (c > st && c <= b0) { parts.push([st, c]); st = c; }
        parts.push([st, b0]);
        for (const [a, b] of parts) {
          const pal = (Z && PAL[Z[this.zoneAt(a)][0]]) || (reef ? [neon(2.6, 0.5, 1.7), neon(0.4, 2.2, 2.4)] : [pink, cyan]);
          for (const sd of [-1, 1]) {
            mesh(this.stripRange(a, b, () => sd * (H - 0.35), () => sd * (H - 0.1), i => upY(i) + 0.03, i => upY(i) + 0.03, 4), pal[sd < 0 ? 0 : 1]);
            if (!this.noWall[a]) mesh(this.stripRange(a, b, () => sd * E, () => sd * E, i => upY(i) + 0.92, i => upY(i) + 1.0, 4), pal[sd < 0 ? 0 : 1]);
          }
        }
      }
    }
    const mk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: dream ? new THREE.Color(2.4, 0.5, 2.2) : canyon ? new THREE.Color(2.6, 1.2, 0.3) : new THREE.Color(0.6, 1.6, 2.6), toneMapped: false }), marks.length);
    marks.forEach(([x, y, z], k) => mk.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, y, z)));
    group.add(mk);
  }

  buildStreetLights(group) {
    const spacing = 30, every = Math.round(spacing / this.step), count = Math.floor(this.N / every);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.7, roughness: 0.4 }), count);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), pole.material, count);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.6, 1.3), toneMapped: false }), count);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,120,0.4)', 'rgba(255,170,90,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), count);
    pool.renderOrder = 1;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    for (let n = 0; n < count; n++) {
      const i = n * every, s = n % 2 ? 1 : -1;
      const nx = this.nx[i], nz = this.nz[i];
      const off = s * (this.edge + WALL_T + 1.2);
      const bx = this.px[i] + nx * off, bz = this.pz[i] + nz * off, y = this.py[i];
      const yaw = Math.atan2(-s * nx, -s * nz); // arm points toward road
      e.set(0, yaw, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(bx, y + 4.5, bz), q, one); pole.setMatrixAt(n, m);
      m.compose(new THREE.Vector3(bx - s * nx * 1.5, y + 8.9, bz - s * nz * 1.5), q, one); arm.setMatrixAt(n, m);
      m.compose(new THREE.Vector3(bx - s * nx * 2.9, y + 8.8, bz - s * nz * 2.9), q, one); head.setMatrixAt(n, m);
      e.set(-Math.PI / 2, 0, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(bx - s * nx * 5.5, y + 0.04, bz - s * nz * 5.5), q, one); pool.setMatrixAt(n, m);
    }
    group.add(pole, arm, head, pool);
  }

  buildMountainRoad(group) {
    const H = this.half, E = this.edge;
    group.add(new THREE.Mesh(this.strip(-H, H, 0, 0, 32), new THREE.MeshStandardMaterial({ map: mountainRoadTexture(H * 2), roughness: 0.82, metalness: 0.02, envMapIntensity: 0.7 })));
    const gravel = new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1, color: 0xb0a490 });
    // gravel shoulders everywhere except on bridges (where it would hang off the deck)
    const spans = (this.cfg.bridges || []).map(([a, b]) => [Math.round(a / this.step), Math.round(b / this.step)]).sort((p, q) => p[0] - q[0]);
    const runs = []; let at = 0;
    for (const [a, b] of spans) { if (a > at) runs.push([at, a]); at = b; }
    runs.push([at, this.N]);
    for (const [a, b] of runs) for (const s of [-1, 1]) group.add(new THREE.Mesh(this.stripRange(a, b, s * H, s * (E + 1.6), -0.02, -0.12, 6), gravel));

    // W-beam guardrails on both sides, posts every 4 m, amber reflectors every 20 m
    const railMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide, envMapIntensity: 1.2 });
    const railX = E + 0.15;
    for (const s of [-1, 1]) {
      group.add(new THREE.Mesh(this.strip(s * railX, s * railX, 0.48, 0.82, 4), railMat));
      group.add(new THREE.Mesh(this.strip(s * railX, s * (railX + 0.12), 0.82, 0.86, 4), railMat));
    }
    const every = Math.max(1, Math.round(4 / this.step)), count = Math.floor(this.N / every) * 2;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6d7178, metalness: 0.6, roughness: 0.5 });
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), postMat, count);
    const refl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.3), toneMapped: false }), Math.ceil(count / 5) + 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    let n = 0, r = 0;
    for (let i = 0; i < this.N - every / 2; i += every) for (const s of [-1, 1]) {
      const x = this.px[i] + this.nx[i] * s * (railX + 0.18), z = this.pz[i] + this.nz[i] * s * (railX + 0.18), y = this.py[i];
      e.set(0, Math.atan2(this.tx[i], this.tz[i]), 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y + 0.4, z), q, one); posts.setMatrixAt(n++, m);
      if ((i / every) % 5 === 0 && r < refl.count) {
        m.compose(new THREE.Vector3(this.px[i] + this.nx[i] * s * (railX - 0.02), y + 0.66, this.pz[i] + this.nz[i] * s * (railX - 0.02)), q, one); refl.setMatrixAt(r++, m);
      }
    }
    posts.count = n; refl.count = r;
    group.add(posts, refl);

    if (this.cfg.gallery) this.buildGallery(group, postMat);

    // chevron boards on the outside of tight bends
    const chevL = chevronTexture(true), chevR = chevronTexture(false);
    const boardGeo = new THREE.PlaneGeometry(1.1, 0.8);
    const matL = new THREE.MeshStandardMaterial({ map: chevL, emissiveMap: chevL, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5 });
    const matR = new THREE.MeshStandardMaterial({ map: chevR, emissiveMap: chevR, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5 });
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6);
    for (let i = 0; i < this.N; i += 7) {
      const k = this.k[i];
      if (Math.abs(k) < 1 / 45) continue;
      const s = k > 0 ? 1 : -1; // left bend → outside is the right side
      const off = s * (railX + 0.9), y = this.py[i];
      const x = this.px[i] + this.nx[i] * off, z = this.pz[i] + this.nz[i] * off;
      const b = new THREE.Mesh(boardGeo, k > 0 ? matL : matR);
      b.position.set(x, y + 1.55, z);
      b.lookAt(x - this.tx[i] * 4 - this.nx[i] * s * 3, y + 1.55, z - this.tz[i] * 4 - this.nz[i] * s * 3);
      const p = new THREE.Mesh(poleGeo, postMat); p.position.set(x, y + 0.7, z);
      group.add(b, p);
    }
  }

  // Rock shed: concrete wall on the mountain side, roof slab, open pillars on the valley side, ceiling lamps.
  buildGallery(group, postMat) {
    const [s0, s1] = this.cfg.gallery, [pkx, pkz] = this.cfg.peak;
    const i0 = Math.round(s0 / this.step), i1 = Math.round(s1 / this.step);
    this.galleryRange = [i0, i1];
    const mid = this.wrap(Math.round((i0 + i1) / 2));
    // +1 if the right-hand side faces the summit
    const sIn = (pkx - this.px[mid]) * this.nx[mid] + (pkz - this.pz[mid]) * this.nz[mid] > 0 ? 1 : -1, sOut = -sIn;
    const E = this.edge, H = 6.2, T = 0.9;
    const concrete = concreteTexture();
    const conc = new THREE.MeshStandardMaterial({ map: concrete, color: 0xa8a49c, roughness: 0.9, side: THREE.DoubleSide });
    const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh; };
    add(this.stripRange(i0, i1, sIn * (E + 0.35), sIn * (E + 0.35), 0, H, 6), conc);                       // inner wall
    add(this.stripRange(i0, i1, sIn * (E + 1.2), sOut * (E + 1.3), H, H, 6), conc);                        // ceiling
    add(this.stripRange(i0, i1, sIn * (E + 1.2), sOut * (E + 1.3), H + T, H + T, 6), new THREE.MeshStandardMaterial({ map: gravelTexture(), color: 0x7a6e5c, roughness: 1, side: THREE.DoubleSide })); // roof top
    add(this.stripRange(i0, i1, sOut * (E + 1.3), sOut * (E + 1.3), H - 0.9, H + T, 6), conc);             // fascia beam
    add(this.stripRange(i0, i1, sIn * (E + 0.35), sIn * (E + 1.2), H, H + T, 6), conc);
    // pillars on the valley side
    const every = Math.round(7 / this.step), pillars = [];
    for (let i = i0; i <= i1; i += every) pillars.push(i);
    const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, H, 0.9), conc, pillars.length);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.12, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.4, 1.4), toneMapped: false }), pillars.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    let l = 0;
    pillars.forEach((i, k) => {
      const w = this.wrap(i); e.set(0, Math.atan2(this.tx[w], this.tz[w]), 0); q.setFromEuler(e);
      const off = sOut * (E + 0.85);
      m.compose(new THREE.Vector3(this.px[w] + this.nx[w] * off, this.py[w] + H / 2, this.pz[w] + this.nz[w] * off), q, one); pil.setMatrixAt(k, m);
      for (const lo of [-2.4, 2.4]) {
        m.compose(new THREE.Vector3(this.px[w] + this.nx[w] * lo, this.py[w] + H - 0.08, this.pz[w] + this.nz[w] * lo), q, one); lamps.setMatrixAt(l++, m);
      }
    });
    pil.castShadow = pil.receiveShadow = true;
    group.add(pil, lamps);
    // warm light pools under the lamps (darker interior reads as a tunnel)
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,110,0.42)', 'rgba(255,170,90,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), pillars.length);
    pillars.forEach((i, k) => { const w = this.wrap(i); e.set(-Math.PI / 2, 0, 0); q.setFromEuler(e); m.compose(new THREE.Vector3(this.px[w], this.py[w] + 0.05, this.pz[w]), q, one); pool.setMatrixAt(k, m); });
    pool.renderOrder = 1; group.add(pool);
  }

  inGallery(i) {
    const g = this.galleryRange; if (g && i >= g[0] && i <= g[1]) return true;
    const s = i * this.step, t = this.cfg.tunnel, u = this.cfg.tube;
    return !!(t && s >= t[0] && s <= t[1]) || !!(u && s >= u[0] && s <= u[1]);
  }

  // which dream layer (坠梦) a sample is in, and how far into it
  zoneAt(i) { const s = i * this.step, Z = this.cfg.zones; let k = 0; for (let n = 0; n < Z.length; n++) if (s >= Z[n][1]) k = n; return k; }

  buildStart(group) {
    if (this.cfg.style === 'ancient') return this.buildPaifang(group);
    const i = 0, yaw = Math.atan2(this.tx[i], this.tz[i]), y = this.py[i], W = this.edge;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.half * 2, 2), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.5 }));
    line.rotation.order = 'YXZ'; line.rotation.y = yaw; line.rotation.x = -Math.PI / 2;
    line.position.set(this.px[i], y + 0.02, this.pz[i]);
    group.add(line);
    const g = new THREE.Group();
    g.position.set(this.px[i], y, this.pz[i]); g.rotation.y = yaw;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.8, roughness: 0.35 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), metal); p.position.set(s * (W + 1.4), 4.5, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((W + 1.8) * 2, 1.6, 0.9), metal); beam.position.y = 8.4; g.add(beam);
    // the map name on the start board follows the language; the rest ('START / FINISH', '▲ SECRET ▲') is already English
    const tex = gantryTexture(LANG === 'zh' ? this.cfg.gantry : this.cfg.gantry.replace(/^[^·]+/, s => T(s.trim()).toUpperCase() + '  '));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(16, W * 2), 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    panel.position.set(0, 8.4, -0.46); panel.rotation.y = Math.PI; g.add(panel);
    const panel2 = panel.clone(); panel2.position.z = 0.46; panel2.rotation.y = 0; g.add(panel2);
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x220000, toneMapped: false }));
      l.position.set(-3.2 + k * 1.6, 7.1, -0.5); l.rotation.y = Math.PI; g.add(l); this.startLights.push(l);
    }
    group.add(g);
  }

  // Start/finish arch for 长安: a three-bay memorial gateway (牌坊) with tiled roofs and a gold plaque.
  buildPaifang(group) {
    const i = 0, yaw = Math.atan2(this.tx[i], this.tz[i]), y = this.py[i], W = this.edge;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.half * 2, 2), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.5 }));
    line.rotation.order = 'YXZ'; line.rotation.y = yaw; line.rotation.x = -Math.PI / 2; line.position.set(this.px[i], y + 0.02, this.pz[i]);
    group.add(line);
    const g = new THREE.Group(); g.position.set(this.px[i], y, this.pz[i]); g.rotation.y = yaw;
    const red = new THREE.MeshStandardMaterial({ color: 0x9e1b14, roughness: 0.45 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 0.8 });
    const tile = new THREE.MeshStandardMaterial({ color: 0x1f3a33, roughness: 0.55, metalness: 0.2 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a63a, roughness: 0.35, metalness: 0.8 });
    const X = [-(W + 1.6), -4.2, 4.2, W + 1.6];
    for (const x of X) {
      const h = Math.abs(x) > 5 ? 8 : 10.5;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, h, 14), red); p.position.set(x, h / 2, 0); g.add(p);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.6), stone); base.position.set(x, 0.6, 0); g.add(base);
    }
    const roof = (w, x, yy) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.9), red); beam.position.set(x, yy - 0.9, 0); g.add(beam);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.6, 1.4, 4, 1).rotateY(Math.PI / 4), tile); r.scale.set(w * 0.42, 1, 1.25); r.position.set(x, yy + 0.4, 0); g.add(r);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.25, 0.25), gold); ridge.position.set(x, yy + 1.1, 0); g.add(ridge);
    };
    roof(8.4 + 1.2, 0, 11.6);
    roof((W + 1.6 - 4.2) + 1.6, -(W + 1.6 + 4.2) / 2, 9.1);
    roof((W + 1.6 - 4.2) + 1.6, (W + 1.6 + 4.2) / 2, 9.1);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.45), new THREE.MeshBasicMaterial({ map: plaqueTexture(this.cfg.gantry), toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
    plaque.position.set(0, 9.6, -0.48); plaque.rotation.y = Math.PI; g.add(plaque);
    const p2 = plaque.clone(); p2.position.z = 0.48; p2.rotation.y = 0; g.add(p2);
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshBasicMaterial({ color: 0x220000, toneMapped: false }));
      l.position.set(-2.4 + k * 1.2, 8.0, -0.55); g.add(l); this.startLights.push(l);
    }
    group.add(g);
  }

  setStartLights(n, green) {
    this.startLights.forEach((l, k) => l.material.color.set(green ? new THREE.Color(0.2, 3, 0.6) : k < n ? new THREE.Color(4, 0.15, 0.1) : new THREE.Color(0.13, 0, 0)));
  }
}
