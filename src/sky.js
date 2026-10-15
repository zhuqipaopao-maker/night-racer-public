import * as THREE from 'three';
import { windowTexture, concreteTexture, radialTexture, dayFacadeTexture } from './textures.js';

// 天空工地 — a high-rise construction site at dusk turning to night. The road runs 110–171 m up;
// everything under it is built here: rooftops it sits on, pylons, a tower crane whose jib is the road,
// an unfinished tower it drives through, a helix ramp tower, and the city far below.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildSkySite(scene, track, { quality = 1 } = {}) {
  const group = new THREE.Group();
  const r = rng(77);
  const cfg = track.cfg, N = track.N, E = track.edge, idx = m => Math.round(m / track.step);
  const night = { value: 0 };                      // 0 = golden dusk … 1 = night
  const winMats = [1, 2, 3, 4].map(k => {
    const t = windowTexture(k);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.55, metalness: 0.25 });
    m.onBeforeCompile = sh => { sh.uniforms.night = night; sh.fragmentShader = 'uniform float night;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 0.25 + night * 1.6;'); };
    return m;
  });
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0xb9b5ad, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5c626b, roughness: 0.5, metalness: 0.6 });
  const craneY = new THREE.MeshStandardMaterial({ color: 0xf0b400, roughness: 0.45, metalness: 0.4 });
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const boxes = [[], [], [], []];                  // window-textured building boxes per material
  const addBox = (cx, cz, yaw, w, d, h, y0 = 0, mat = Math.floor(r() * 4)) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const j = f * 4 + k;
      if (f === 2 || f === 3) uv.setXY(j, 0.004, 0.004);                         // roof: plain
      else uv.setXY(j, uv.getX(j) * (f < 2 ? d : w) / 32, uv.getY(j) * h / 56 + 8 / 512);
    }
    g.applyMatrix4(m4.compose(v3.set(cx, y0 + h / 2, cz), q4.setFromEuler(e4.set(0, yaw, 0)), s3.set(1, 1, 1)));
    boxes[mat].push(g);
  };
  const yawAt = i => Math.atan2(track.tx[i], track.tz[i]);
  const inRange = (m, [a, b]) => m >= a && m <= b;
  const tower = cfg.tower, hx = cfg.helix;
  const helixRange = [hx.from, hx.to];

  // ---------- rooftops the road sits on ----------
  const roofs = [[-5, 205], [275, 392], [515, 610], [945, 1170]];
  for (const [a, b] of roofs) {
    for (let m = a; m < b; m += 55) {
      const m1 = Math.min(b, m + 55), i0 = track.wrap(idx(m)), i1 = track.wrap(idx(m1)), im = track.wrap(idx((m + m1) / 2));
      let top = Infinity; for (let i = i0; i !== i1; i = track.wrap(i + 1)) top = Math.min(top, track.up[i] - 1.15);
      addBox(track.px[im], track.pz[im], yawAt(im), m1 - m + 4, 2 * (E + 7), top, 0);
    }
  }
  // ---------- pylons under the rest (not the tower, not the helix, not over gaps) ----------
  const pyl = [];
  for (let i = 0; i < N; i += 12) {
    const m = i * track.step;
    if (roofs.some(z => inRange(m, z)) || inRange(m, tower) || inRange(m, helixRange) || inRange(m, [392, 515])) continue;
    for (const [arr, w] of [[track.up, E], [track.low, E]]) {
      if (!Number.isFinite(arr[i])) continue;
      for (const sd of [-1, 1]) pyl.push([track.px[i] + track.nx[i] * sd * (w - 1.2), arr[i] - 1.15, track.pz[i] + track.nz[i] * sd * (w - 1.2), 1.4]);
    }
  }
  // helix: slim columns just outside the barriers, from the ground up to each turn's deck
  const hi0 = idx(hx.from), hi1 = idx(hx.to);
  for (let i = hi0; i <= hi1; i += 10) for (const sd of [-1, 1]) {
    const x = track.px[i] + track.nx[i] * sd * (E + 1.1), z = track.pz[i] + track.nz[i] * sd * (E + 1.1);
    pyl.push([x, track.up[i] - 0.6, z, 0.9, 0]);
  }
  const pylMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), concrete, pyl.length);
  pyl.forEach(([x, top, z, w, base = 0], k) => { pylMesh.setMatrixAt(k, m4.compose(v3.set(x, base, z), q4.identity(), s3.set(w, Math.max(0.5, top - base), w))); });
  pylMesh.castShadow = true; group.add(pylMesh);
  // helix core
  {
    const [cx, cz] = hx.centre, core = hx.radius - E - 2.5;
    const t = windowTexture(9); t.repeat.set(5, 3.2);
    const coreMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0.3 });
    coreMat.onBeforeCompile = winMats[0].onBeforeCompile;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(core, core, 178, 32, 1), coreMat); c.position.set(cx, 89, cz); group.add(c);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(core + 1, core + 1, 1.5, 32), steel); cap.position.set(cx, 178.7, cz); group.add(cap);
  }

  // ---------- the tower crane whose jib carries the road ----------
  {
    const a = idx(392), b = idx(515), w = 4.6;
    // truss under the jib: two bottom chords + zig-zag diagonals
    const chords = [], diag = [];
    for (let i = a; i < b; i += 3) {
      const j = Math.min(b, i + 3);
      for (const sd of [-1, 1]) {
        const p = new THREE.Vector3(track.px[i] + track.nx[i] * sd * (w - 0.3), track.up[i] - 3.4, track.pz[i] + track.nz[i] * sd * (w - 0.3));
        const q = new THREE.Vector3(track.px[j] + track.nx[j] * sd * (w - 0.3), track.up[j] - 3.4, track.pz[j] + track.nz[j] * sd * (w - 0.3));
        const tp = new THREE.Vector3(track.px[j] + track.nx[j] * sd * (w - 0.3), track.up[j] - 1.1, track.pz[j] + track.nz[j] * sd * (w - 0.3));
        chords.push([p, q]); diag.push([p, tp]);
      }
    }
    const beam = (list, t) => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(t, 1, t), craneY, list.length); list.forEach(([p, q], k) => { const d = q.clone().sub(p); im.setMatrixAt(k, m4.compose(p.clone().add(q).multiplyScalar(0.5), q4.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), s3.set(1, d.length(), 1))); }); im.castShadow = true; group.add(im); };
    beam(chords, 0.35); beam(diag, 0.22);
    // mast beside the jib root, from the ground up past the deck, with the cab and the counter-jib
    const root = a + 2, mx = track.px[root] + track.nx[root] * -(w + 3.5), mz = track.pz[root] + track.nz[root] * -(w + 3.5);
    const mast = new THREE.Group(); mast.position.set(mx, 0, mz);
    const H = track.up[root] + 22;
    for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, 0.4), craneY); leg.position.set(ox, H / 2, oz); mast.add(leg); }
    for (let y = 4; y < H; y += 4) { const ring = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 3.6), craneY); ring.position.y = y; mast.add(ring); }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3, 3.5), new THREE.MeshStandardMaterial({ color: 0xf0b400, emissive: 0x332200 })); cab.position.y = H - 4; mast.add(cab);
    group.add(mast);
    const ang = yawAt(root);
    const cj = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 40), craneY); cj.position.set(mx - Math.sin(ang) * 20, H - 1, mz - Math.cos(ang) * 20); cj.rotation.y = ang; group.add(cj);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 6), concrete); cw.position.set(mx - Math.sin(ang) * 38, H - 3.5, mz - Math.cos(ang) * 38); cw.rotation.y = ang; group.add(cw);
    // tie cables from the mast top to the jib
    const ties = [];
    for (const m of [430, 470, 512]) { const i = idx(m); for (const sd of [-1, 1]) ties.push([new THREE.Vector3(mx, H + 1, mz), new THREE.Vector3(track.px[i] + track.nx[i] * sd * w, track.up[i] + 0.2, track.pz[i] + track.nz[i] * sd * w)]); }
    const cab2 = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 4), steel, ties.length);
    ties.forEach(([p, q], k) => { const d = q.clone().sub(p); cab2.setMatrixAt(k, m4.compose(p.clone().add(q).multiplyScalar(0.5), q4.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), s3.set(1, d.length(), 1))); });
    group.add(cab2);
    // a steel beam hanging off a hook beside the jib
    const hook = idx(455), hxp = track.px[hook] + track.nx[hook] * (w + 9), hzp = track.pz[hook] + track.nz[hook] * (w + 9);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 30), steel); rope.position.set(hxp, track.up[hook] + 2, hzp); group.add(rope);
    const ib = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xa83a1e, roughness: 0.6 })); ib.position.set(hxp, track.up[hook] - 13, hzp); ib.rotation.y = ang + 0.7; group.add(ib);
  }

  // ---------- the unfinished tower the road runs through ----------
  {
    const [a, b] = tower.map(idx), im = Math.round((a + b) / 2), yaw = yawAt(im);
    const len = (b - a) * track.step + 10, wid = 2 * E + 26, roadY = track.up[im];
    const cx = track.px[im], cz = track.pz[im];
    const slabs = [], cols = [];
    for (let y = 4.5; y < 180; y += 4.5) {
      if (y > roadY - 1.6 && y < roadY + 8) continue;               // the storey the road passes through is left open
      const built = y < 150 || r() < 0.5;
      if (!built) continue;
      slabs.push(y);
    }
    const slabMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(wid, 0.5, len), concrete, slabs.length);
    slabs.forEach((y, k) => slabMesh.setMatrixAt(k, m4.compose(v3.set(cx, y, cz), q4.setFromEuler(e4.set(0, yaw, 0)), s3.set(1, 1, 1))));
    slabMesh.castShadow = slabMesh.receiveShadow = true; group.add(slabMesh);
    // columns: a grid, but none in the lane the road takes
    for (let u = -len / 2 + 2; u <= len / 2 - 2; u += 8) for (let v = -wid / 2 + 1.5; v <= wid / 2 - 1.5; v += 7) {
      const lane = Math.abs(v) < E + 1.2;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const x = cx + v * c + u * sn, z = cz - v * sn + u * c;
      if (lane) { cols.push([x, 0, z, roadY - 1.2]); cols.push([x, roadY + 7.9, z, 172 - roadY]); }
      else cols.push([x, 0, z, 172]);
    }
    const colMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1, 0.9).translate(0, 0.5, 0), concrete, cols.length);
    cols.forEach(([x, y, z, h], k) => colMesh.setMatrixAt(k, m4.compose(v3.set(x, y, z), q4.identity(), s3.set(1, h, 1))));
    colMesh.castShadow = true; group.add(colMesh);
    // work lights strung along the open storey
    const lamps = [];
    for (let i = a; i <= b; i += 6) for (const sd of [-1, 1]) lamps.push([track.px[i] + track.nx[i] * sd * (E + 1.5), roadY + 7.4, track.pz[i] + track.nz[i] * sd * (E + 1.5)]);
    const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.15, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.8), toneMapped: false }), lamps.length);
    lamps.forEach(([x, y, z], k) => lm.setMatrixAt(k, m4.makeTranslation(x, y, z))); group.add(lm);
    track.galleryRange = [a, b];
  }

  // ---------- the city below ----------
  const B = track.bounds, cityLights = [];
  const nearRoad = (x, z) => { for (let i = 0; i < N; i += 6) if (Math.hypot(track.px[i] - x, track.pz[i] - z) < E + 18) return track.up[i] || track.py[i]; return 0; };
  for (let x = B.minx - 600; x < B.maxx + 600; x += 34) for (let z = B.minz - 500; z < B.maxz + 500; z += 34) {
    if (r() < 0.12) continue;
    const px = x + (r() - 0.5) * 8, pz = z + (r() - 0.5) * 8, w = 16 + r() * 12, d = 16 + r() * 12;
    const deck = nearRoad(px, pz);
    const far = Math.max(0, Math.hypot(px - (B.minx + B.maxx) / 2, pz - (B.minz + B.maxz) / 2) - 500);
    let h = 18 + Math.pow(r(), 1.7) * 85 + far * 0.08;
    if (deck) h = Math.min(h, deck - 25);
    if (h < 8) continue;
    addBox(px, pz, 0, w, d, h);
    if (r() < 0.3) cityLights.push([px, h + 1, pz]);
  }
  // distant skyscraper ring
  for (let k = 0; k < 120; k++) {
    const a = (k / 120) * Math.PI * 2, rad = 1300 + r() * 500;
    addBox(Math.cos(a) * rad, -125 + Math.sin(a) * rad, -a, 40 + r() * 40, 40 + r() * 30, 120 + r() * 260);
  }
  boxes.forEach((list, k) => { if (!list.length) return; const g = mergeAll(list); const m = new THREE.Mesh(g, winMats[k]); m.receiveShadow = true; group.add(m); });
  // streets: dark ground with a glowing grid of street lights and streams of traffic
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, -125); group.add(ground);
  const TRAF = Math.round(1600 * Math.max(0.4, quality)), tPos = new Float32Array(TRAF * 3), tCol = new Float32Array(TRAF * 3), tData = [];
  for (let k = 0; k < TRAF; k++) {
    const alongX = r() < 0.5, lane = Math.round((r() - 0.5) * 60) * 34 + 17 + (r() < 0.5 ? -2 : 2);
    tData.push({ alongX, lane, p: (r() - 0.5) * 3000, v: (r() < 0.5 ? -1 : 1) * (8 + r() * 10) });
    const head = tData[k].v > 0; tCol.set(head ? [2.4, 2.2, 1.8] : [2.4, 0.25, 0.15], k * 3);
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  const traffic = new THREE.Points(tg, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  traffic.frustumCulled = false; group.add(traffic);

  // ---------- aviation warning lights on everything tall ----------
  const av = [...cityLights.filter(() => r() < 0.4)];
  for (const m of [0, 300, 530, 690, 1200]) { const i = idx(m); av.push([track.px[i] + track.nx[i] * (E + 6), track.py[i] + 12, track.pz[i] + track.nz[i] * (E + 6)]); }
  av.push([hx.centre[0], 180, hx.centre[1]]);
  const avMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.15), toneMapped: false }), av.length);
  av.forEach(([x, y, z], k) => avMesh.setMatrixAt(k, m4.makeTranslation(x, y, z))); group.add(avMesh);

  // day ↔ night facades blended in the shader: dayK 1 = pale walls and sky-coloured glass, 0 = night windows
  const dayK = { value: 1 };
  {
    const mats = new Set([...winMats, ...group.children.filter(o => o.material && o.material.emissiveMap).map(o => o.material)]);
    let k = 0;
    for (const m of mats) {
      const dayMap = dayFacadeTexture(k++); dayMap.repeat.copy(m.map.repeat);
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, rr) => {
        sh.uniforms.night = night; sh.uniforms.dayK = dayK; sh.uniforms.dayMap = { value: dayMap };
        sh.fragmentShader = 'uniform float night; uniform float dayK; uniform sampler2D dayMap;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(dayMap, vMapUv).rgb, dayK);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= (0.25 + night * 1.6) * (1.0 - dayK);');
      };
      m.customProgramCacheKey = () => 'skyfacade';
      m.needsUpdate = true;
    }
  }
  scene.add(group);
  return {
    night,
    setDayK(v) { dayK.value = v; },
    update(t, dt, raceT) {
      for (let k = 0; k < TRAF; k++) {
        const T = tData[k]; T.p += T.v * dt; if (T.p > 1500) T.p -= 3000; if (T.p < -1500) T.p += 3000;
        if (T.alongX) tPos.set([T.p, 0.6, -125 + T.lane], k * 3); else tPos.set([T.lane, 0.6, -125 + T.p], k * 3);
      }
      tg.attributes.position.needsUpdate = true;
      avMesh.visible = (t % 1.6) < 0.5;
      if (track.boostTex) track.boostTex.offset.y = -t * 2.5;
    },
  };
}

function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}

// Sky that goes from golden dusk to night as `night` rises 0→1.
export function buildDuskNightSky(scene, sunDir, night) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() }, night },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = vP.y;
        vec3 zD = vec3(0.16,0.20,0.45), mD = vec3(0.75,0.42,0.42), hD = vec3(1.0,0.62,0.32);
        vec3 zN = vec3(0.01,0.015,0.05), mN = vec3(0.04,0.05,0.14), hN = vec3(0.16,0.10,0.18);
        vec3 zen = mix(zD, zN, night), mid = mix(mD, mN, night), hor = mix(hD, hN, night);
        vec3 c = y > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.2, y)) : hor * 0.6;
        c = mix(c, zen, smoothstep(0.2, 0.8, y));
        float d = max(dot(vP, sun), 0.0);
        c += vec3(1.0,0.6,0.3) * (pow(d, 6.0) * 0.6 + pow(d, 800.0) * 6.0) * (1.0 - night);
        vec3 q = floor(vP * 380.0); c += step(0.9975, h(q)) * smoothstep(0.1, 0.5, y) * night;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  scene.add(sky);
  return sky;
}
