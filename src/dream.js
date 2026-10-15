import * as THREE from 'three';

// 霓虹梦境 — a synthwave dreamscape: endless glowing grid, a striped retro sun that never sets,
// wireframe mountains, neon palms. Everything glows to `beat` (0..1, set from the music each frame).

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildDream(scene, track) {
  const group = new THREE.Group();
  const r = rng(1985);
  const beat = track.beat || { value: 0 };
  const time = { value: 0 };
  const sunDir = new THREE.Vector3(0, 0.12, -1).normalize();

  // ---- sky: deep indigo to hot pink at the horizon, stars, and the big striped sun ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir }, time, beat },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; uniform float time; uniform float beat; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = vP.y;
        vec3 top = vec3(0.02,0.01,0.08), mid = vec3(0.16,0.03,0.28), hor = vec3(0.95,0.22,0.55);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y)); c = mix(c, top, smoothstep(0.22, 0.75, y));
        if (y < 0.0) c = vec3(0.05,0.0,0.1);
        // stars
        vec3 q = floor(vP * 300.0); c += step(0.997, h(q)) * smoothstep(0.15, 0.5, y) * (0.6 + 0.4 * sin(time * 2.0 + h(q) * 40.0));
        // the sun: yellow→pink disc with horizontal cut-out bands in its lower half, plus a glow
        vec3 sd = normalize(sun); vec3 rgt = normalize(cross(vec3(0.0,1.0,0.0), sd)); vec3 up = cross(sd, rgt);
        vec2 uv = vec2(dot(vP, rgt), dot(vP, up)) / 0.28;
        float d = length(uv);
        if (dot(vP, sd) > 0.0) {
          float band = step(0.0, -uv.y) * step(0.5, fract((uv.y + time * 0.05) * 9.0)) * smoothstep(0.0, -0.9, uv.y) ;
          float disc = (1.0 - smoothstep(0.98, 1.0, d)) * (1.0 - band);
          vec3 sc = mix(vec3(1.0,0.25,0.6), vec3(1.0,0.9,0.25), smoothstep(-1.0, 1.0, uv.y));
          c = mix(c, sc * 1.6, disc);
          c += vec3(1.0,0.3,0.6) * 0.35 * exp(-max(d - 1.0, 0.0) * 3.0) * (0.85 + beat * 0.3);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  group.add(sky);

  // ---- the endless grid floor ----
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.ShaderMaterial({
    fog: false, uniforms: { time, beat },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform float beat; varying vec3 vW;
      void main(){
        vec2 g = abs(fract(vW.xz / 24.0 - 0.5) - 0.5) / fwidth(vW.xz / 24.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float dist = length(vW.xz - cameraPosition.xz);
        float fade = exp(-dist * 0.0009);
        vec3 base = vec3(0.04, 0.0, 0.08);
        vec3 lc = mix(vec3(1.0,0.2,0.85), vec3(0.3,0.8,1.0), 0.5 + 0.5 * sin(vW.x * 0.004 + time * 0.3));
        vec3 c = base + lc * line * fade * (0.9 + beat * 0.8);
        c = mix(c, vec3(0.6,0.12,0.4), 1.0 - exp(-dist * 0.00035));   // haze toward the horizon
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = -2; group.add(grid);

  // ---- wireframe mountains in a ring ----
  {
    const seg = 220, rows = 6, pos = [], idx = [];
    for (let k = 0; k <= seg; k++) for (let j = 0; j <= rows; j++) {
      const a = (k / seg) * Math.PI * 2, R = 1500 + j * 90 + Math.sin(a * 5) * 60;
      const ridge = Math.abs(Math.sin(a * 7.3 + 1.1)) * 160 + Math.abs(Math.sin(a * 17.1)) * 70 + r() * 35;
      const hgt = j === 0 || j === rows ? -2 : ridge * Math.sin((j / rows) * Math.PI);
      pos.push(Math.cos(a) * R, hgt, Math.sin(a) * R);
      if (k < seg && j < rows) { const p = k * (rows + 1) + j, q = p + rows + 1; idx.push(p, q, p + 1, q, q + 1, p + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0d0420, fog: false })));
    const wire = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 2.2), wireframe: true, fog: false, toneMapped: false, transparent: true, opacity: 0.55 }));
    wire.scale.setScalar(1.001); group.add(wire);
  }

  // ---- neon palm trees scattered around the track ----
  {
    const trunkPts = [], frondPts = [];
    const N = track.N;
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < 90; tries++) {
      const i = Math.floor(r() * N), sd = r() < 0.5 ? -1 : 1, off = sd * (track.edge + 14 + r() * 60);
      const x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
      let ok = true; for (let j = 0; j < N; j += 6) if (Math.hypot(track.px[j] - x, track.pz[j] - z) < track.edge + 10) { ok = false; break; }
      if (!ok) continue;
      placed++;
      const H = 14 + r() * 10, lean = (r() - 0.5) * 0.4;
      let px = x, py = -2, pz = z;
      for (let k = 1; k <= 8; k++) { const t = k / 8, nx = x + Math.sin(lean) * H * t * t, ny = -2 + H * t, nz = z + Math.cos(lean * 2) * 0.5 * t; trunkPts.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz; }
      for (let f = 0; f < 7; f++) {
        const a = (f / 7) * Math.PI * 2 + r() * 0.3; let fx = px, fy = py, fz = pz;
        for (let k = 1; k <= 6; k++) { const t = k / 6, nx = px + Math.cos(a) * 7 * t, ny = py + 2.5 * Math.sin(t * Math.PI * 0.8) - 4 * t * t, nz = pz + Math.sin(a) * 7 * t; frondPts.push(fx, fy, fz, nx, ny, nz); fx = nx; fy = ny; fz = nz; }
      }
    }
    const line = (pts, c) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: c, toneMapped: false, fog: false })); group.add(m); return m; };
    line(trunkPts, new THREE.Color(2.4, 0.45, 1.7)); line(frondPts, new THREE.Color(0.35, 2.2, 1.6));
  }

  scene.add(group);
  return { time, beat, sunDir, update(t) { time.value = t; } };
}
