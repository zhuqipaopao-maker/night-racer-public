import * as THREE from 'three';
import { canvas, tex } from './textures.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// value noise + fbm, deterministic
function makeNoise(seed) {
  const r = rng(seed), P = new Float32Array(512 * 512);
  for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & 511) << 9) | (x & 511)];
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
  return (x, y, oct = 5) => { let a = 0, f = 1, amp = 1, sum = 0; for (let o = 0; o < oct; o++) { a += amp * n2(x * f, y * f); sum += amp; f *= 2.03; amp *= 0.5; } return a / sum; };
}

// Road proximity query on a coarse grid of centreline samples. Returns the nearest sample, an
// inverse-distance-weighted road height (smooth between stacked switchback legs), and the distance
// to the nearest sample on a *different* stretch of road (so cliffs only form where a road stands alone).
function roadField(track) {
  const cell = 24, B = track.bounds, pad = 200;
  const gx0 = Math.floor((B.minx - pad) / cell), gz0 = Math.floor((B.minz - pad) / cell);
  const GW = Math.ceil((B.maxx + pad) / cell) - gx0 + 1, GH = Math.ceil((B.maxz + pad) / cell) - gz0 + 1;
  const grid = Array.from({ length: GW * GH }, () => []);
  for (let i = 0; i < track.N; i += 2) grid[(Math.floor(track.pz[i] / cell) - gz0) * GW + (Math.floor(track.px[i] / cell) - gx0)].push(i);
  const N = track.N;
  return (x, z, reach = 4) => {
    const cx = Math.floor(x / cell) - gx0, cz = Math.floor(z / cell) - gz0;
    let bd = Infinity, bi = -1;
    const near = [];
    for (let b = -reach; b <= reach; b++) {
      const zz = cz + b; if (zz < 0 || zz >= GH) continue;
      for (let a = -reach; a <= reach; a++) {
        const xx = cx + a; if (xx < 0 || xx >= GW) continue;
        for (const i of grid[zz * GW + xx]) {
          const dx = x - track.px[i], dz = z - track.pz[i], d = dx * dx + dz * dz;
          near.push(i, d);
          if (d < bd) { bd = d; bi = i; }
        }
      }
    }
    if (bi < 0) return null;
    let ws = 0, ys = 0, d2 = Infinity;
    for (let k = 0; k < near.length; k += 2) {
      const i = near[k], d = near[k + 1];
      if (d < 85 * 85) { const w = 1 / (d + 4); ws += w; ys += w * track.py[i]; }
      let di = Math.abs(i - bi); di = Math.min(di, N - di);
      if (di > 70 && d < d2) d2 = d;
    }
    return { d: Math.sqrt(bd), i: bi, y: track.py[bi], R: ws ? ys / ws : track.py[bi], d2: Math.sqrt(d2) };
  };
}

export function buildMountain(scene, track, { trees = 4200 } = {}) {
  const group = new THREE.Group();
  const noise = makeNoise(9);
  const field = roadField(track);
  const B = track.bounds;
  const cx = (B.minx + B.maxx) / 2, cz = (B.minz + B.maxz) / 2;
  const [peakX, peakZ] = track.cfg.peak; // the mountain the switchbacks climb

  // ---- terrain heightfield ----
  const SIZE = 2600, RES = 340, half = SIZE / 2;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES, RES);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.attributes.position, count = pos.count;
  const heights = new Float32Array(count);
  const roadSide = track.edge + 2.2;
  const base = (x, z) => {
    // a broad massif centred on the switchbacks, falling away into valleys, plus ridged detail
    const dm = Math.hypot(x - peakX, z - peakZ);
    const massif = 150 * Math.exp(-(dm * dm) / (2 * 380 * 380)) - 30;
    const ridge = 1 - Math.abs(noise(x / 420 + 7, z / 420 - 3, 4) * 2 - 1);
    const far = Math.hypot(x - cx, z - cz);
    const rim = Math.max(0, far - 900) * 0.32 * (0.6 + noise(x / 300, z / 300, 3));   // distant ranges
    return massif + ridge * 70 - 35 + (noise(x / 90, z / 90, 5) - 0.5) * 26 + rim;
  };
  const S = THREE.MathUtils.smoothstep;
  for (let v = 0; v < count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    let h = base(x, z);
    const f = field(x, z, 4);
    if (f) {
      const i = f.i;
      if (f.d < roadSide) h = f.y - 0.35;
      else {
        // which side of the road is this — toward the summit (cut into rock) or away (drop-off)?
        const vx = x - track.px[i], vz = z - track.pz[i];
        const outward = vx * (track.px[i] - peakX) + vz * (track.pz[i] - peakZ) > 0;
        // cliffs only where this stretch of road stands alone; between switchback legs the ground just
        // slopes smoothly from one leg to the next (R interpolates their heights)
        const iso = S(f.d2, 45, 95);
        const e = f.d - roadSide;
        const shaped = outward
          ? f.R - 0.35 - Math.min(48, e * 1.35 + e * e * 0.004) * iso      // steep drop beyond the guardrail
          : f.R - 0.35 + Math.min(20, Math.max(0, e - 3) * 1.15) * iso;    // rock cut rising above the road, set back from the rail
        const t = S(f.d, roadSide + 45, roadSide + 95);
        h = shaped * (1 - t) + (outward ? Math.min(h, shaped + 30) : Math.max(h, shaped - 8)) * t;
      }
    }
    heights[v] = h;
    pos.setY(v, h);
  }
  geo.computeVertexNormals();
  // vertex colours: dry grass on gentle slopes, rock on steep ones, darker in valleys
  const nrm = geo.attributes.normal, col = new Float32Array(count * 3);
  const grass = new THREE.Color(0x58603a), dry = new THREE.Color(0x7d6f45), rock = new THREE.Color(0x8a8079), dark = new THREE.Color(0x2c3324);
  const c = new THREE.Color();
  for (let v = 0; v < count; v++) {
    const ny = nrm.getY(v), x = pos.getX(v), z = pos.getZ(v), h = heights[v];
    const n = noise(x / 40, z / 40, 3);
    c.copy(grass).lerp(dry, n);
    c.lerp(rock, THREE.MathUtils.smoothstep(1 - ny, 0.18, 0.4));
    c.lerp(dark, THREE.MathUtils.clamp((-h - 10) / 80, 0, 0.6));
    col.set([c.r, c.g, c.b], v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = tex(canvas(256, 256, (g, w, h) => {
    const r = rng(5); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 90 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  }));
  detail.repeat.set(SIZE / 12, SIZE / 12);
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  group.add(terrain);
  window.__terrain = terrain;   // debug/test hook

  const step = SIZE / RES;
  const heightAt = (x, z) => {
    const gx = (x - (cx - half)) / step, gz = (z - (cz - half)) / step;
    const i = Math.max(0, Math.min(RES - 1, Math.floor(gx))), j = Math.max(0, Math.min(RES - 1, Math.floor(gz)));
    const u = gx - i, w = gz - j, k = j * (RES + 1) + i;
    return (heights[k] * (1 - u) + heights[k + 1] * u) * (1 - w) + (heights[k + RES + 1] * (1 - u) + heights[k + RES + 2] * u) * w;
  };

  // ---- pine forest (instanced) ----
  const r = rng(77);
  const MAXT = trees;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 3, 6).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 1 }), MAXT);
  const crownGeo = new THREE.ConeGeometry(2.4, 6.5, 7).translate(0, 5.6, 0);
  const crown2 = new THREE.ConeGeometry(1.7, 4.6, 7).translate(0, 8.4, 0);
  const crowns = new THREE.InstancedMesh(mergeTwo(crownGeo, crown2), new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.9, flatShading: true }), MAXT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < 60000 && n < MAXT; tries++) {
    const x = cx + (r() - 0.5) * 1700, z = cz + (r() - 0.5) * 1500;
    if (noise(x / 160 + 30, z / 160, 3) < 0.45) continue;           // clumps and clearings
    const f = field(x, z, 3);
    if (f && f.d < track.edge + 6) continue;
    const y = heightAt(x, z);
    if (y < -40) continue;
    if (Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) + Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3)) > 7) continue; // too steep

    const sc = 0.7 + r() * 0.8;
    e.set(0, r() * 6.28, 0); q.setFromEuler(e); s.set(sc, sc * (0.85 + r() * 0.4), sc); p.set(x, y - 0.2, z);
    m.compose(p, q, s); trunk.setMatrixAt(n, m); crowns.setMatrixAt(n, m);
    tint.setHSL(0.27 + r() * 0.06, 0.35 + r() * 0.15, 0.6 + r() * 0.5); crowns.setColorAt(n, tint);
    n++;
  }
  trunk.count = crowns.count = n;
  trunk.castShadow = crowns.castShadow = true;
  group.add(trunk, crowns);

  // ---- town lights down in the valleys ----
  const lights = [];
  for (let k = 0; k < 9000 && lights.length < 2600; k++) {
    const a = r() * Math.PI * 2, d = 700 + r() * 600;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const y = heightAt(x, z);
    if (y > -8 || noise(x / 120, z / 120 + 9, 3) < 0.5) continue;
    lights.push(x, y + 1.5, z);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
  const dot = tex(canvas(32, 32, (g, w) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(1, 'rgba(255,180,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }), { repeat: false });
  group.add(new THREE.Points(lg, new THREE.PointsMaterial({ map: dot, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.2, 1.6, 1.0), toneMapped: false })));

  scene.add(group);
  return group;
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  const pa = a.toNonIndexed(), pb = b.toNonIndexed();
  const P = new Float32Array(pa.attributes.position.count * 3 + pb.attributes.position.count * 3);
  P.set(pa.attributes.position.array, 0); P.set(pb.attributes.position.array, pa.attributes.position.array.length);
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

// Dusk sky: sun low on the horizon, warm band below a violet zenith.
export function buildDuskSky(scene, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vP;
      void main(){
        float y = vP.y;
        vec3 zen = vec3(0.10,0.12,0.30), mid = vec3(0.55,0.33,0.52), hor = vec3(1.0,0.55,0.30), low = vec3(0.30,0.20,0.28);
        vec3 c = y > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.18, y)) : mix(hor, low, smoothstep(0.0, -0.15, y));
        c = mix(c, zen, smoothstep(0.18, 0.75, y));
        float d = max(dot(vP, sun), 0.0);
        c += vec3(1.0,0.6,0.3) * pow(d, 6.0) * 0.55 + vec3(1.0,0.85,0.6) * pow(d, 900.0) * 6.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  scene.add(sky);
  return sky;
}
