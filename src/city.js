import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { windowTexture, neonSignTexture } from './textures.js';
import { WALL_T, WALK } from './track.js';

const SIGNS = ['夜宵', '烧烤', '网吧', 'KTV', '酒店', '便利店', '台球', '奶茶', '火锅', '24H', 'HOTEL', 'BAR', '牛肉面', '足浴', '电玩城', '炸鸡', '药店', 'CLUB', '修车', '麻辣烫'];
const NEON = ['#ff3d7f', '#2de1ff', '#ffd23d', '#9b6bff', '#3dff9e', '#ff7a2d'];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildCity(scene, track) {
  const r = rng(42);
  const group = new THREE.Group();
  const clear = track.edge + WALL_T + WALK + 1.5;
  // Coarse track samples for clearance tests.
  const sx = [], sz = [];
  for (let i = 0; i < track.N; i += 3) { sx.push(track.px[i]); sz.push(track.pz[i]); }
  const minDist = (x, z) => { let d = Infinity; for (let k = 0; k < sx.length; k++) { const dx = x - sx[k], dz = z - sz[k]; d = Math.min(d, dx * dx + dz * dz); } return Math.sqrt(d); };

  const variants = [1, 2, 3, 4].map(windowTexture);
  const mats = variants.map(t => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0.2, envMapIntensity: 0.9 }));
  const geos = [[], [], [], []];
  const signs = [];
  const roofLights = [];
  const placed = [];

  const addBuilding = (cx, cz, yaw, w, d, h, variant) => {
    const g = new THREE.BoxGeometry(d, h, w);
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const faceW = f < 2 ? w : d;
      for (let v = 0; v < 4; v++) {
        const k = f * 4 + v;
        if (f === 2 || f === 3) uv.setXY(k, 0.004, 0.004);
        else uv.setXY(k, uv.getX(k) * faceW / 32, uv.getY(k) * h / 56 + 8 / 512);
      }
    }
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(cx, h / 2, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1)));
    geos[variant].push(g);
    if (h > 45 && r() < 0.6) roofLights.push(new THREE.Vector3(cx, h + 0.6, cz));
  };

  // Rows of buildings along both sides of the circuit.
  for (let i = 0; i < track.N; i += 14) {
    for (const s of [-1, 1]) {
      if (r() < 0.12) continue;
      const nx = track.nx[i], nz = track.nz[i], yaw = Math.atan2(track.tx[i], track.tz[i]);
      const w = 14 + r() * 16, d = 14 + r() * 22;
      const off = clear + 1 + r() * 6 + d / 2;
      const cx = track.px[i] + nx * off * s, cz = track.pz[i] + nz * off * s;
      // all four corners and centre must stay clear of the road
      const tx = track.tx[i], tz = track.tz[i];
      let ok = true;
      for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = cx + nx * a * d / 2 + tx * b * w / 2, z = cz + nz * a * d / 2 + tz * b * w / 2;
        if (minDist(x, z) < clear) { ok = false; break; }
      }
      if (!ok) continue;
      if (placed.some(([px, pz, pr]) => Math.hypot(px - cx, pz - cz) < (pr + Math.min(w, d) / 2) * 0.8)) continue;
      placed.push([cx, cz, Math.min(w, d) / 2]);
      const h = 12 + Math.pow(r(), 1.6) * 75;
      addBuilding(cx, cz, yaw, w, d, h, Math.floor(r() * 4));
      // neon sign on the face toward the road
      if (r() < 0.62) {
        const text = SIGNS[Math.floor(r() * SIGNS.length)], color = NEON[Math.floor(r() * NEON.length)];
        const vertical = r() < 0.5 && [...text].length <= 4 && !/[A-Z0-9]/.test(text);
        const tex = neonSignTexture(text, color, vertical);
        const aspect = tex.image.width / tex.image.height;
        const sh = vertical ? 2.2 * [...text].length + 0.7 : 2.4, sw = sh * aspect;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) }));
        const face = d / 2 + (vertical ? sw / 2 + 0.25 : 0.15);
        mesh.position.set(cx - nx * s * face + tx * (r() - 0.5) * (w - sw) * 0.6, Math.min(h - sh / 2 - 1, (vertical ? 5 : 4) + r() * 8 + sh / 2), cz - nz * s * face + tz * (r() - 0.5) * (w - sw) * 0.6);
        // flat signs face the road; vertical blade signs stick out and face oncoming traffic
        mesh.rotation.y = vertical ? Math.atan2(-tx, -tz) : Math.atan2(-nx * s, -nz * s);
        signs.push(mesh);
      }
    }
  }

  // Distant skyline ring for depth.
  const { minx, maxx, minz, maxz } = track.bounds;
  const cx0 = (minx + maxx) / 2, cz0 = (minz + maxz) / 2;
  for (let k = 0; k < 140; k++) {
    const a = (k / 140) * Math.PI * 2 + r() * 0.03, rad = 620 + r() * 380;
    const w = 30 + r() * 50, h = 40 + Math.pow(r(), 1.3) * 190;
    addBuilding(cx0 + Math.cos(a) * rad, cz0 + Math.sin(a) * rad, -a, w, 30 + r() * 30, h, Math.floor(r() * 4));
  }
  // Inner blocks: fill spaces far from the road with low buildings.
  for (let x = minx - 120; x < maxx + 120; x += 46) for (let z = minz - 120; z < maxz + 120; z += 46) {
    const px = x + (r() - 0.5) * 14, pz = z + (r() - 0.5) * 14;
    const dd = minDist(px, pz);
    if (dd < clear + 26 || dd > 220) continue;
    if (placed.some(([qx, qz, qr]) => Math.hypot(qx - px, qz - pz) < qr + 16)) continue;
    addBuilding(px, pz, 0, 22 + r() * 12, 22 + r() * 12, 10 + r() * 50, Math.floor(r() * 4));
  }

  geos.forEach((list, v) => { if (list.length) group.add(new THREE.Mesh(mergeGeometries(list), mats[v])); });
  signs.forEach(s => group.add(s));
  if (roofLights.length) {
    const red = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.2, 0.15), toneMapped: false }), roofLights.length);
    roofLights.forEach((p, k) => red.setMatrixAt(k, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    group.add(red); group.userData.roofLights = red;
  }

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
  group.add(ground);

  scene.add(group);
  return group;
}

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(3000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x03040a) }, mid: { value: new THREE.Color(0x0d0a1e) }, horizon: { value: new THREE.Color(0x3a1d40) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float y = max(vP.y, 0.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.7, y));
        vec3 q = floor(vP * 420.0); float s = step(0.9975, h(q)) * smoothstep(0.12, 0.5, y);
        gl_FragColor = vec4(c + s * 0.8, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  return sky;
}

// Tiny emissive scene baked into a PMREM env map so wet asphalt and car paint pick up neon reflections.
export function buildEnv(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x07070c);
  const cols = [0xff3d7f, 0x2de1ff, 0xffd23d, 0x9b6bff, 0xffb070, 0xffb070];
  cols.forEach((c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), side: THREE.DoubleSide }));
    const a = (k / cols.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * 12, 2 + (k % 3) * 2, Math.sin(a) * 12); m.lookAt(0, 0, 0);
    env.add(m);
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x241a38, side: THREE.DoubleSide }));
  top.position.y = 14; top.rotation.x = Math.PI / 2; env.add(top);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02);
  pm.dispose();
  return rt.texture;
}
