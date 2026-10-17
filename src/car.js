import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { radialTexture } from './textures.js';

// Sculpted bodies (Tripo meshes, cut and decimated in Blender: tools/gt-model.py, tools/car-model.py), for maps built in
// the same detailed style; since 2026-10-16 every map uses them (main.js calls useSculptedCars). Each model loads the first time
// a car of that kind appears and is shared by all of them; until it arrives, or if it fails, the extruded body stands in.
// Lamps and tailpipes in car space: head [x, y, z, bar width] and tilt of the headlight bars, pipes [x, y], glow: where the
// model's own tail lamps are (see paintedModelMaterial); tail [x, y, z, width] is only used by the ghost car.
const SCULPTED = {
  gt: { file: 'models/gt.glb', head: [0.61, 0.66, 1.93, 0.3], tail: [0.64, 0.81, -2.17, 0.3], pipes: [0.51, 0.33], tilt: -0.6, glow: { red: true, zMax: -1.9, xMax: 1.1 } },
  // the hypercar's tail lamp is one bar right across the back, and its twin pipes sit together in the middle
  hyper: { file: 'models/hyper.glb', head: [0.6, 0.52, 1.98, 0.32], tail: [0.42, 0.78, -2.12, 0.75], pipes: [0.09, 0.53], tilt: -0.3, glow: { strip: [0.695, 0.735], zMax: -1.95, xMax: 0.85 } },
};
let sculptedOn = false;
const sculpt = {};   // id → { scene, waiting }
export function useSculptedCars() { sculptedOn = true; }
function wantModel(id, car) {
  let m = sculpt[id];
  if (!m) {
    m = sculpt[id] = { scene: null, waiting: new Set() };
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(SCULPTED[id].file,
      g => { m.scene = g.scene; for (const c of m.waiting) c.useModel(m.scene, SCULPTED[id]); m.waiting.clear(); },
      undefined, e => console.warn(SCULPTED[id].file, e));
  }
  if (m.scene) car.useModel(m.scene, SCULPTED[id]); else m.waiting.add(car);
}

// The model is painted white; recolour only the bright, unsaturated texels so glass, tyres and lamps keep their colour.
// The repainted panels get a metallic lacquer, so their reflections carry the paint colour instead of washing it out
// toward white. The tail lamps glow from the model itself (brighter when braking): `tail` picks them out either by
// their red lenses (red: true) or as a strip along the dark tail panel (strip: [y0, y1]), behind zMax, inside |x| < xMax.
function paintedModelMaterial(base, paint, own, tail = null, toCar = new THREE.Matrix4()) {
  const m = base.clone();
  m.envMapIntensity = own ? 1.3 : 0.9;
  const U = {
    paint: { value: new THREE.Color(paint) }, brake: { value: 0 }, toCar: { value: toCar },
    tailMode: { value: tail ? (tail.red ? 1 : 2) : 0 }, tailBox: { value: new THREE.Vector4(...(tail?.strip || [0, 0]), tail?.zMax ?? 0, tail?.xMax ?? 9) },
  };
  m.userData.lamp = U;
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = 'uniform mat4 toCar; varying vec3 vCar;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCar = (toCar * vec4(position, 1.0)).xyz;');
    s.fragmentShader = 'uniform vec3 paint; uniform float brake, tailMode; uniform vec4 tailBox; varying vec3 vCar; float paintK, tailK;\n' + s.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 t = diffuseColor.rgb; float l = dot(t, vec3(0.299, 0.587, 0.114));
        float sat = max(t.r, max(t.g, t.b)) - min(t.r, min(t.g, t.b));
        paintK = smoothstep(0.3, 0.55, l) * (1.0 - smoothstep(0.05, 0.15, sat));
        diffuseColor.rgb = mix(t, paint * l * 1.25, paintK);
        bool back = vCar.z < tailBox.z && abs(vCar.x) < tailBox.w;
        tailK = 0.0;
        if (tailMode > 0.5 && tailMode < 1.5 && back) tailK = smoothstep(1.15, 1.6, t.r / max(max(t.g, t.b), 0.004)) * step(0.012, t.r);
        if (tailMode > 1.5 && back) tailK = smoothstep(tailBox.x, tailBox.x + 0.006, vCar.y) * (1.0 - smoothstep(tailBox.y - 0.006, tailBox.y, vCar.y)) * (1.0 - smoothstep(0.25, 0.45, l));
      }`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.55, paintK);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.3, paintK);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.04, 0.03) * tailK * (0.55 + brake * 4.0);');
  };
  m.customProgramCacheKey = () => 'sculpted-paint';
  return m;
}

const WHEEL_R = 0.36;
export const TOP_SPEED = 64;     // m/s ≈ 230 km/h
const BOOST_TOP = 84;            // m/s ≈ 300 km/h
const GEARS = [0, 13, 24, 35, 46, 57, 90];

function sideShape(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
// Extrude a side profile (x = length axis, y = height) across `width`, then turn it so +z is the car's nose.
function profile(pts, width, bevel) {
  const g = new THREE.ExtrudeGeometry(sideShape(pts), { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 8 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// Body styles. lower / cabin / roof: side profiles [x, y] with the nose toward -x (x is negated into +z later);
// head / tail: [y, z] of the light bars; wing: [y, z, width, stand height] or null.
const MODELS = {
  gt: { width: 1.82, cabinW: 1.46,
    lower: [[-2.25, 0.32], [2.15, 0.32], [2.3, 0.5], [2.22, 0.7], [1.0, 0.9], [-1.5, 0.98], [-2.22, 0.96], [-2.32, 0.62]],
    cabin: [[0.9, 0.9], [-1.45, 0.96], [-1.0, 1.3], [0.05, 1.33]], roof: [[0.0, 1.31], [-0.95, 1.29], [-0.9, 1.35], [-0.05, 1.37]],
    head: [0.66, 2.25], tail: [0.86, -2.36], wing: [1.25, -2.05, 1.9, 0.3] },
  // short hot hatch: tall glasshouse, chopped tail, roof spoiler
  hatch: { width: 1.76, cabinW: 1.52,
    lower: [[-1.92, 0.34], [1.95, 0.34], [2.05, 0.52], [1.98, 0.74], [0.95, 0.92], [-1.7, 1.0], [-1.95, 0.98], [-2.0, 0.6]],
    cabin: [[0.9, 0.92], [-1.72, 1.0], [-1.58, 1.5], [0.0, 1.52]], roof: [[-0.02, 1.5], [-1.58, 1.48], [-1.52, 1.55], [-0.04, 1.57]],
    head: [0.7, 1.98], tail: [0.95, -2.02], wing: [1.56, -1.66, 1.5, 0],
    extra: (b, paint, black) => { const g = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.05), black); g.position.set(0, 0.5, 2.06); b.add(g); } },
  // muscle car: long hood with a scoop, short deck, ducktail, twin stripes
  muscle: { width: 1.92, cabinW: 1.5,
    lower: [[-2.42, 0.34], [2.28, 0.34], [2.4, 0.56], [2.36, 0.86], [0.75, 0.94], [-1.55, 0.98], [-2.36, 1.0], [-2.46, 0.64]],
    cabin: [[0.6, 0.94], [-1.5, 0.98], [-1.15, 1.32], [-0.1, 1.34]], roof: [[-0.12, 1.32], [-1.12, 1.3], [-1.08, 1.37], [-0.14, 1.39]],
    head: [0.72, 2.38], tail: [0.9, -2.44], wing: [1.06, -2.3, 1.8, 0],
    extra: (b, paint, black) => {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.8), paint); scoop.position.set(0, 0.98, 1.35); b.add(scoop);
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.05), black); hole.position.set(0, 1.0, 1.76); b.add(hole);
      const stripe = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4 });
      for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 4.6), stripe); st.position.set(s * 0.2, 1.0, 0); st.scale.y = 1; b.add(st); }
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.05), black); grille.position.set(0, 0.62, 2.42); b.add(grille);
    } },
  // hypercar: low wedge, bubble canopy, side intakes, tall wing
  hyper: { width: 1.98, cabinW: 1.32,
    lower: [[-2.3, 0.28], [2.32, 0.28], [2.44, 0.4], [2.22, 0.58], [0.6, 0.86], [-1.5, 0.92], [-2.28, 0.88], [-2.38, 0.5]],
    cabin: [[1.0, 0.86], [-1.25, 0.92], [-0.75, 1.2], [0.2, 1.22]], roof: [[0.15, 1.2], [-0.7, 1.19], [-0.66, 1.25], [0.1, 1.26]],
    head: [0.55, 2.3], tail: [0.78, -2.4], wing: [1.38, -2.05, 2.0, 0.42],
    extra: (b, paint, black) => { for (const s of [-1, 1]) { const in_ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.9), black); in_.position.set(s * 1.0, 0.62, -0.6); b.add(in_); }
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 1.4), paint); fin.position.set(0, 1.12, -1.4); b.add(fin); } },
};

export class Car {
  // opts.lights: real headlight spots (player only — they are expensive); opts.ghost: translucent replay car
  constructor(scene, { paint = 0xc8102e, lights = true, ghost = false, glow = 'rgba(60,220,255,0.9)', model = 'gt', stats = null } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.opts = { lights: lights && !ghost, ghost, glow };
    this.model = MODELS[model] ? model : 'gt';
    this.stats = stats || { top: 1, accel: 1, grip: 1, nitro: 1 };   // performance multipliers (garage upgrades)
    this.paint = paint;
    this.build(paint);
    this.exterior = this.body.children.slice();   // shell parts; hidden from the driver's seat
    if (this.opts.lights) this.buildInterior();
    if (ghost) {
      const gm = this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
      this.root.traverse(o => { if (o.isMesh) o.material = gm; });
      this.glowMesh.visible = this.shadowMesh.visible = false;
    }
    if (sculptedOn && SCULPTED[this.model]) wantModel(this.model, this);
    scene.add(this.root);
    this.reset(0, 0, 0);
  }

  // Swap the extruded shell and wheels for the sculpted model, and move the lamps and flames onto it.
  useModel(model, spec) {
    const cockpit = !!(this.interior && this.interior.visible);
    for (const m of this.shell) this.body.remove(m);
    this.exterior = this.exterior.filter(m => !this.shell.includes(m));
    // the body has its own baked normal map, so body and wheels each keep their material
    const src = model.getObjectByName('body'); src.updateMatrix();
    const mat = this.ghostMat || paintedModelMaterial(src.material, this.paint, this.opts.lights, spec.glow, src.matrix);
    const wheelMat = this.ghostMat || paintedModelMaterial(model.getObjectByName('wheel_FL').material, this.paint, this.opts.lights);
    this.lampU = mat.userData.lamp;
    const body = src.clone();
    body.material = mat; body.visible = !cockpit;
    this.body.add(body); this.exterior.push(body);
    const [hx, hy, hz, hw] = spec.head, [tx, ty, tz, tw] = spec.tail, [px, py] = spec.pipes;
    this.headBars.forEach((h, i) => { h.position.set((i ? 1 : -1) * hx, hy, hz); h.scale.x = hw / 0.42; h.rotation.x = spec.tilt; });
    if (this.ghostMat) {
      this.tailBar.position.set(-tx, ty, tz); this.tailBar.scale.x = tw / 1.6;
      const tail2 = this.tailBar.clone(); tail2.position.x = tx; tail2.visible = !cockpit;
      this.body.add(tail2); this.exterior.push(tail2);
    } else { this.body.remove(this.tailBar); this.exterior = this.exterior.filter(m => m !== this.tailBar); }
    this.flames.forEach((f, i) => f.position.set((i ? 1 : -1) * px, py, f.position.z));
    for (const w of this.wheels) {
      const n = model.getObjectByName('wheel_' + (w.front ? 'F' : 'R') + (w.steer.position.x > 0 ? 'L' : 'R'));
      w.steer.position.copy(n.position);
      const m = n.clone(); m.position.set(0, 0, 0); m.material = wheelMat;
      w.spin.clear(); w.spin.add(m);
    }
  }

  build(paint) {
    // other cars use a softer lacquer: up close in front of your headlights a mirror-like clearcoat blows out to white
    const own = this.opts.lights;
    const paintMat = this.paintMat = new THREE.MeshPhysicalMaterial({ color: paint, metalness: own ? 0.5 : 0.35, roughness: own ? 0.36 : 0.48, clearcoat: own ? 1 : 0.45, clearcoatRoughness: own ? 0.16 : 0.32, envMapIntensity: own ? 1.3 : 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.5, metalness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0d14, metalness: 0.9, roughness: 0.05, envMapIntensity: 2.2 });
    const M = MODELS[this.model];
    // profiles are drawn nose-at-negative-x; the lists below are [x, y] along the car's side
    this.body.add(new THREE.Mesh(profile(M.lower, M.width, 0.08), paintMat));
    this.body.add(new THREE.Mesh(profile(M.cabin, M.cabinW, 0.06), glass));
    this.body.add(new THREE.Mesh(profile(M.roof, M.cabinW - 0.16, 0.04), paintMat));
    if (M.extra) M.extra(this.body, paintMat, black);
    // splitter, side skirts, diffuser
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.4), black); splitter.position.set(0, 0.27, 2.2); this.body.add(splitter);
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 2.6), black); sk.position.set(s * 0.98, 0.33, 0); this.body.add(sk); }
    const diff = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.3), black); diff.position.set(0, 0.32, -2.3); this.body.add(diff);
    // rear wing
    if (M.wing) {
      const [wy, wz, ww, sh] = M.wing;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.05, 0.36), black); wing.position.set(0, wy, wz); this.body.add(wing);
      if (sh) for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, sh, 0.16), black); st.position.set(s * 0.6, wy - sh / 2, wz + 0.05); this.body.add(st); }
    }
    this.shell = this.body.children.slice();   // the bodywork a sculpted model replaces
    // lights
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 4.6), toneMapped: false });
    this.headBars = [-1, 1].map(s => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.06), this.headMat); h.position.set(s * 0.62, M.head[0], M.head[1]); h.rotation.x = -0.35; this.body.add(h); return h; });
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.03, 0.03), toneMapped: false });
    const tail = this.tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.05), this.tailMat); tail.position.set(0, M.tail[0], M.tail[1]); this.body.add(tail);
    // exhaust flames (nitro)
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 5), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 10), flameMat); f.rotation.x = -Math.PI / 2; f.position.set(s * 0.45, 0.36, -2.75); f.visible = false;
      this.body.add(f); this.flames.push(f);
    }
    // underglow + contact shadow
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.6), new THREE.MeshBasicMaterial({ map: radialTexture(this.opts.glow, 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; this.root.add(glow); this.glowMesh = glow;
    glow.material.opacity = this.opts.lights ? 1 : 0.4;   // other cars' underglow is subtler (it washes over their tail up close)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04; this.root.add(shadow); this.shadowMesh = shadow;
    // wheels
    const tire = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.85 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.95, roughness: 0.25 });
    this.wheels = [];
    for (const [x, z] of [[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.38], [0.86, -1.38]]) {
      const steer = new THREE.Group(); steer.position.set(x, WHEEL_R, z);
      const spin = new THREE.Group(); steer.add(spin);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 24), tire); t.rotation.z = Math.PI / 2; spin.add(t);
      const rimDisc = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R * 0.68, WHEEL_R * 0.68, 0.29, 20), rim); rimDisc.rotation.z = Math.PI / 2; spin.add(rimDisc);
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), black);
        sp.position.x = Math.sign(x) * 0.15; sp.rotation.x = (k / 5) * Math.PI * 2; sp.scale.set(0.2, 1, 9); spin.add(sp);
      }
      this.root.add(steer);
      this.wheels.push({ steer, spin, front: z > 0 });
    }
    // headlight beams: real spotlights for the player, a cheap light pool on the road for everyone else
    this.beams = []; this.tailLight = null;
    if (!this.opts.lights) {
      if (!this.opts.ghost) {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 16), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,244,220,0.55)', 'rgba(255,240,210,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.05, 10); this.root.add(pool);
      }
      return;
    }
    for (const s of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff2dc, 170, 90, 0.42, 0.6, 1.4);
      l.position.set(s * 0.6, 0.7, 2.0);
      l.target.position.set(s * 1.2, 0, 22);
      this.root.add(l, l.target); this.beams.push(l);
    }
    const tl = new THREE.PointLight(0xff2020, 0.6, 5, 2); tl.position.set(0, 0.8, -2.8); this.root.add(tl); this.tailLight = tl;
  }

  // Cockpit for the first-person camera (player car only; shown only in that view). Driver sits on the left (+x).
  // Eye is at about (0.38, 1.17, -0.32) in car space, looking down +z.
  buildInterior() {
    const g = this.interior = new THREE.Group();
    g.visible = false;
    const M = (color, rough = 0.75, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.4 });
    const dashMat = M(0x2e3038), trimMat = M(0x4a4d57, 0.5, 0.3), leather = M(0x1d1e22, 0.6), metal = M(0xa9adb6, 0.3, 0.9), liner = M(0x3a3b40, 0.95);
    const glove = M(0x2a2b30, 0.8), cuff = M(0x3a3c44, 0.7), accent = M(0xc8102e, 0.5);
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };

    // dashboard: top surface, the face toward you, and a soft lip
    add(new THREE.BoxGeometry(1.72, 0.06, 0.62), dashMat, 0, 1.0, 0.78, -0.12);
    add(new THREE.BoxGeometry(1.72, 0.22, 0.06), dashMat, 0, 0.88, 0.5);
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.72, 10), trimMat, 0, 0.99, 0.48, 0, 0, Math.PI / 2);
    // instrument binnacle with a live digital cluster
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
    this.clusterCtx = cv.getContext('2d'); this.clusterTex = new THREE.CanvasTexture(cv); this.clusterTex.colorSpace = THREE.SRGBColorSpace;
    const screen = add(new THREE.PlaneGeometry(0.36, 0.135), new THREE.MeshBasicMaterial({ map: this.clusterTex, toneMapped: false }), 0.38, 1.05, 0.56, 0, Math.PI, 0);   // sits on the dash, clear of the wheel rim from the driver's eye
    screen.rotation.order = 'YXZ'; screen.rotation.set(-0.22, Math.PI, 0);   // leans back, facing the driver
    this.clusterT = 0; this.drawCluster(0, 1, 0, false);
    // centre console with a glowing nav screen
    add(new THREE.BoxGeometry(0.34, 0.42, 0.5), dashMat, 0, 0.72, 0.5);
    const navCv = document.createElement('canvas'); navCv.width = 256; navCv.height = 160;
    const n = navCv.getContext('2d'); const gr = n.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#0b1a2e'); gr.addColorStop(1, '#06101c'); n.fillStyle = gr; n.fillRect(0, 0, 256, 160);
    n.strokeStyle = '#2de1ff'; n.lineWidth = 6; n.beginPath(); n.moveTo(30, 140); n.bezierCurveTo(80, 60, 150, 130, 230, 30); n.stroke();
    n.fillStyle = '#ff3d7f'; n.beginPath(); n.arc(70, 104, 9, 0, 7); n.fill(); n.fillStyle = '#8fa6c4'; n.font = '20px sans-serif'; n.fillText('NAV', 196, 150);
    const navTex = new THREE.CanvasTexture(navCv); navTex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ map: navTex, color: 0x9aa4b4, toneMapped: false }), 0, 0.96, 0.47, -0.3, Math.PI, 0).rotation.order = 'YXZ';
    // roof liner, door tops, floor
    add(new THREE.BoxGeometry(1.5, 0.03, 1.6), liner, 0, 1.43, -0.4);                         // roof liner
    add(new THREE.BoxGeometry(1.5, 0.05, 0.08), trimMat, 0, 1.41, 0.46);                      // windscreen header
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.06, 1.2), trimMat, s * 0.69, 1.2, 0.52, 0.76);     // A-pillar
      // side mirror housings, just outside the A-pillars
      add(new THREE.BoxGeometry(0.2, 0.12, 0.08), M(0xc8102e, 0.35, 0.5), s * 1.0, 1.02, 0.42, 0, s * 0.3);
      add(new THREE.PlaneGeometry(0.16, 0.09), new THREE.MeshStandardMaterial({ color: 0x9fb2c8, metalness: 1, roughness: 0.05, envMapIntensity: 1.5 }), s * 1.0, 1.02, 0.375, 0, Math.PI + s * 0.3);
    }
    // the exterior shell is a solid block, so from inside we build the cabin we can actually see
    add(new THREE.BoxGeometry(1.66, 0.04, 2.3), M(0x1a1b1f, 0.95), 0, 0.42, -0.3);                 // floor
    add(new THREE.BoxGeometry(1.7, 0.55, 0.05), M(0x15161a, 0.95), 0, 0.7, 1.0);                   // firewall under the dash
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.56, 2.3), M(0x2b2d33, 0.8), s * 0.86, 0.7, -0.3);           // door card
      add(new THREE.BoxGeometry(0.1, 0.03, 2.3), trimMat, s * 0.84, 0.985, -0.3);                   // window sill
    }
    // bonnet and wing tops, in the car's paint, seen over the dash
    add(new THREE.BoxGeometry(1.84, 0.05, 1.32), this.paintMat, 0, 0.84, 1.62, 0.16);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 14, 1, false, 0, Math.PI), this.paintMat, s * 0.78, 0.8, 1.62, Math.PI / 2 + 0.16, 0, 0);
    // steering wheel with two gloved hands; the whole assembly turns with your steering
    this.wheelPivot = new THREE.Group(); this.wheelPivot.position.set(0.38, 0.84, 0.36); this.wheelPivot.rotation.x = -0.5;
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 12, 40), leather));
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.025), metal);
      sp.rotation.z = a; sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.005); wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 20), leather); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.4, 0.9), toneMapped: false })); badge.position.z = -0.027; badge.rotation.y = Math.PI; wheel.add(badge);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.034), accent); mark.position.set(0, 0.185, 0); wheel.add(mark);
    for (const s of [-1, 1]) {   // hands at quarter to three
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glove); palm.scale.set(1, 1.35, 0.9); hand.add(palm);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.09, 10), cuff); wrist.position.set(0, -0.02, -0.075); wrist.rotation.x = Math.PI / 2 - 0.3; hand.add(wrist);
      hand.position.set(s * 0.185, 0.02, -0.02); wheel.add(hand);
    }
    this.wheelPivot.add(wheel); this.steeringWheel = wheel;
    g.add(this.wheelPivot);
    // dim warm cabin light so the interior reads at night
    const lamp = new THREE.PointLight(0xffe2c4, 0.45, 2.2, 1.5); lamp.position.set(0.1, 1.1, 0.25); g.add(lamp);
    this.body.add(g);
  }

  setCockpit(on) {
    if (!this.interior || this.interior.visible === on) return;
    this.interior.visible = on;
    for (const m of this.exterior) m.visible = !on;
  }

  // Digital instrument cluster: speed, gear, rev bar, boost tag.
  drawCluster(kmh, gear, rpm, boost) {
    const c = this.clusterCtx, W = 512, H = 192;
    c.fillStyle = '#05070b'; c.fillRect(0, 0, W, H);
    const bars = 24;
    for (let k = 0; k < bars; k++) {
      const on = k / bars < rpm;
      c.fillStyle = on ? (k > bars * 0.82 ? '#ff3d5a' : k > bars * 0.6 ? '#ffd23d' : '#2de1ff') : '#1a2230';
      c.fillRect(24 + k * 19, 18, 14, 22 + k * 0.6);
    }
    c.fillStyle = '#e9edf5'; c.font = 'bold 92px sans-serif'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.fillText(String(kmh), 330, 160);
    c.fillStyle = '#8a93a6'; c.font = '24px sans-serif'; c.textAlign = 'left'; c.fillText('km/h', 340, 160);
    c.fillStyle = '#ffd23d'; c.font = 'bold 64px sans-serif'; c.fillText(String(gear), 430, 150);
    if (boost) { c.fillStyle = '#9b6bff'; c.font = 'bold 26px sans-serif'; c.fillText('NITRO', 30, 160); }
    this.clusterTex.needsUpdate = true;
  }

  reset(x, z, heading, y = 0) {
    this.x = x; this.z = z; this.h = heading; this.y = y; this.slope = 0;
    this.vy = 0; this.air = false; this.airT = 0; this.landImpact = 0; this.fell = false; this.layer = 'up'; this.lastGroundI = undefined;
    this.vx = 0; this.vz = 0; this.steer = 0; this.yawRate = 0;
    this.drifting = false; this.driftDir = 0; this.driftTime = 0;
    this.nitro = 0; this.bottles = 1; this.boostT = 0; this.miniT = 0;
    this.roll = 0; this.pitch = 0; this.spin = 0; this.hint = -1;
    this.lastVF = 0; this.impact = 0; this.events = [];
    // previous physics pose, for interpolated rendering between fixed steps
    this.prev = { x, y, z, h: heading, slope: 0, roll: 0, pitch: 0, spin: 0 };
    this.rx = x; this.ry = y; this.rz = z; this.rh = heading;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }

  gearInfo() {
    const v = Math.abs(this.forwardSpeed) / (this.speedMul || 1);
    let g = 1; while (g < 6 && v > GEARS[g]) g++;
    const lo = GEARS[g - 1], hi = GEARS[g];
    return { gear: this.forwardSpeed < -0.5 ? 'R' : g, rpm: Math.min(1, 0.22 + 0.78 * (v - lo) / (hi - lo)) };
  }

  update(dt, inp, track) {
    const P = this.prev;
    P.x = this.x; P.y = this.y; P.z = this.z; P.h = this.h; P.slope = this.slope; P.roll = this.roll; P.pitch = this.pitch; P.spin = this.spin;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz, vL = this.vx * rx + this.vz * rz;
    const spd = Math.abs(vF);
    this.events.length = 0;

    // steering input smoothing (faster return to centre)
    const target = inp.steer;
    this.steer += (target - this.steer) * Math.min(1, dt * (target === 0 ? 10 : 6));

    // drift state
    if (!this.drifting && inp.drift && Math.abs(inp.steer) > 0.25 && vF > 10) {
      this.drifting = true; this.driftDir = Math.sign(inp.steer); this.driftTime = 0;
      this.events.push('driftStart');
    }
    if (this.drifting && (!inp.drift || vF < 9)) {
      this.drifting = false;
      if (this.driftTime > 0.7 && vF > 12) { this.miniT = 0.55; this.events.push('miniBoost'); }
    }
    if (this.drifting) {
      this.driftTime += dt;
      this.nitro += dt * (16 + Math.min(20, Math.abs(vL)) * 1.6) * this.stats.nitro;
      if (this.nitro >= 100) { if (this.bottles < 2) { this.bottles++; this.nitro = 0; this.events.push('bottle'); } else this.nitro = 100; }
    }

    // nitro
    if (inp.nitroPressed && this.bottles > 0 && this.boostT <= 0) { this.bottles--; this.boostT = 2.6 * this.stats.nitro; this.events.push('boost'); }
    this.boostT = Math.max(0, this.boostT - dt);
    this.miniT = Math.max(0, this.miniT - dt);
    const boosting = this.boostT > 0, mini = this.miniT > 0;
    this.speedMul = track.cfg.speed || 1;

    // longitudinal
    const sm = track.cfg.speed || 1;   // per-map speed multiplier (top speed, nitro and pull all scale together)
    const ST = this.stats;
    const top = (boosting ? BOOST_TOP : mini ? TOP_SPEED + 8 : TOP_SPEED) * sm * ST.top;
    if ((inp.throttle || boosting) && !(this.air && this.airT > 0.1)) {
      const a = (boosting ? 30 : mini ? 26 : 17) * sm * ST.accel * Math.max(0.08, 1 - Math.max(0, vF) / top);
      vF += a * dt;
    }
    if (inp.brake) {
      if (vF > 0.5) vF -= 34 * dt;
      else vF = Math.max(-14, vF - 9 * dt);
    }
    // drag (much less in the air: arcade jumps keep their momentum)
    vF -= (vF * 0.05 * dt + Math.sign(vF) * 0.00085 * vF * vF * dt) * (this.air ? 0.25 : 1);
    if (!inp.throttle && !inp.brake && !boosting) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 2.2 * dt);
    if (vF > top) vF += (top - vF) * Math.min(1, dt * 1.5);
    if (this.drifting) vF -= 1.6 * dt;
    // gravity along the slope: uphill slows you, downhill pulls you
    if (!this.air) vF -= 9.8 * this.slope * dt * 0.85;

    // lateral grip: low while drifting, high otherwise — the slip angle comes from the heading turning faster than the velocity
    const grip = this.air ? 0.4 : this.drifting ? 1.7 : (spd > 30 ? 8 : 11) * ST.grip;
    vL *= Math.exp(-grip * dt);

    // yaw
    let yaw;
    if (this.drifting) yaw = (-this.driftDir * 1.05 - this.steer * 0.95) * Math.min(1, spd / 18);
    else yaw = -this.steer * 2.25 * Math.min(1, spd / 6) / (1 + spd / (42 * ST.grip)) * Math.sign(vF || 1);
    if (this.air) yaw *= 0.25;   // wheels off the ground: barely any steering
    this.yawRate += (yaw - this.yawRate) * Math.min(1, dt * (this.drifting ? 7 : 11));

    this.vx = fx * vF + rx * vL; this.vz = fz * vF + rz * vL;
    this.h += this.yawRate * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // walls
    const q = track.nearest(this.x, this.z, this.hint);
    this.hint = q.i;
    this.impact = 0;
    const wall = (s, limit) => {   // keep the car on the inner side of a wall at lateral offset s*limit
      const nx = (q.nx ?? track.nx[q.i]) * s, nz = (q.nz ?? track.nz[q.i]) * s;
      const push = q.off * s - limit;
      this.x -= nx * push; this.z -= nz * push; q.off -= s * push;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= nx * vn * 1.35; this.vz -= nz * vn * 1.35;
        const scrub = Math.max(0.55, 1 - vn * 0.03);
        this.vx *= scrub; this.vz *= scrub;
        this.impact = Math.max(this.impact, vn);
        if (vn > 6) { this.drifting = false; this.events.push('crash'); }
        // nudge heading parallel to the wall
        const ta = Math.atan2(q.tx ?? track.tx[q.i], q.tz ?? track.tz[q.i]);
        let d = ta - this.h; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < Math.PI / 2) this.h += d * Math.min(1, vn * 0.02);
      }
    };
    const DRIVE_LIMIT = q.lim ?? track.driveLimit;
    if (!(track.layered && track.noWall[q.i]) && Math.abs(q.off) > DRIVE_LIMIT) wall(Math.sign(q.off), DRIVE_LIMIT);
    // split lanes: a wall down the middle while the ramp and the low road are at different heights
    if (track.layered && track.divider[q.i] && !this.air && !(Math.abs(track.up[q.i] - track.low[q.i]) <= 0.8)) {
      if (q.off < 0 && q.off > -0.95) wall(1, -0.95);        // stay on whichever side of the centre wall you're on
      else if (q.off >= 0 && q.off < 0.95) wall(-1, -0.95);
    }
    this.trackI = q.i; this.trackOff = q.off; this.path = q.path || 0; this.pathK = q.k;
    // vertical: follow the road surface; leave it over crests, ramp lips, gaps and open edges
    const G = track.lowG && track.lowG[q.i] ? 5.5 : 13.5, S = track.surfaceAt(q.i, this.x, this.z, q.off, this.y), road = S.y;
    this.landImpact = 0;
    if (this.air) {
      this.vy -= G * dt; this.y += this.vy * dt; this.airT += dt;
      this.slope -= 0.18 * dt;                         // nose drops slowly in flight
      if (road > -Infinity && this.y <= road) {
        const roadVy = S.g * vF;
        this.landImpact = Math.max(0, roadVy - this.vy);
        this.y = road; this.vy = roadVy; this.air = false; this.justLanded = true; this.layer = S.layer;
        this.pitch += Math.min(0.08, this.landImpact * 0.012);
        if (this.airT > 0.12) this.events.push('land');
      } else if (track.layered && road === -Infinity && this.y < track.py[q.i] - 9 && !this.fell) { this.fell = true; this.events.push('fell'); }
    } else {
      const vyRoad = (road - this.y) / dt;
      const canLaunch = track.launch[q.i] && !this.justLanded;
      this.justLanded = false;
      const dropAway = road === -Infinity || road < this.y - 0.6;           // deck ends (ramp lip, gap, open edge)
      if (dropAway || (canLaunch && vyRoad < this.vy - G * dt - 0.25 && spd > 15)) {
        this.air = true; this.airT = 0; this.vy -= G * dt; this.y += this.vy * dt; this.takeoffX = this.x; this.takeoffZ = this.z;
      } else { this.vy = vyRoad; this.y = road; this.layer = S.layer; if (track.layered && S.layer === 'up' && !track.split[q.i]) this.lastGroundI = q.i; }
    }
    if (!this.air) {
      // slope along the car's heading (grade is along the track direction)
      const along = Math.sin(this.h) * track.tx[q.i] + Math.cos(this.h) * track.tz[q.i];
      this.slope += ((track.layered ? S.g : track.gradeAt(q.i, this.x, this.z)) * along - this.slope) * Math.min(1, dt * 8);
      if (track.layered && track.boost[q.i] && S.layer === 'up' && !this.onBoost) { this.miniT = Math.max(this.miniT, 1.8); this.events.push('boostpad'); }
      this.onBoost = track.layered && track.boost[q.i];
    }

    // visuals
    const accel = (vF - this.lastVF) / Math.max(dt, 1e-4); this.lastVF = vF;
    const rollT = THREE.MathUtils.clamp((this.drifting ? -vL * 0.004 : 0) + this.yawRate * Math.min(spd, 50) * 0.0012, -0.065, 0.065);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 6);
    this.pitch += (THREE.MathUtils.clamp(-accel * 0.0028, -0.05, 0.05) - this.pitch) * Math.min(1, dt * 5);
    this.spin += (vF / WHEEL_R) * dt;
    this.slip = Math.abs(vL);
    this.boosting = boosting; this.mini = mini;
    this.braking = inp.brake && vF > 1;
  }

  // alpha: how far the render time sits between the previous and the current physics step (0..1)
  sync(alpha = 1) {
    const P = this.prev, L = (a, b) => a + (b - a) * alpha;
    let dh = this.h - P.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.rx = L(P.x, this.x); this.ry = L(P.y, this.y); this.rz = L(P.z, this.z); this.rh = P.h + dh * alpha;
    this.rslope = L(P.slope, this.slope);
    this.root.position.set(this.rx, this.ry, this.rz);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = this.rh;
    this.root.rotation.x = -Math.atan(this.rslope);
    this.body.rotation.z = L(P.roll, this.roll);
    this.body.rotation.x = L(P.pitch, this.pitch);
    const steerVis = this.drifting ? this.driftDir * 0.32 + this.steer * 0.2 : -this.steer * 0.5;
    if (this.steeringWheel) this.steeringWheel.rotation.z = -steerVis * 2.6;
    if (this.interior && this.interior.visible) {
      this.clusterT = (this.clusterT || 0) + 1;
      if (this.clusterT % 5 === 0) { const g = this.gearInfo(); this.drawCluster(Math.round(Math.abs(this.forwardSpeed) * 3.6), g.gear, g.rpm, this.boosting); }
    }
    for (const w of this.wheels) { w.spin.rotation.x = L(P.spin, this.spin); if (w.front) w.steer.rotation.y = this.drifting ? steerVis : steerVis; }
    this.tailMat.color.setRGB(this.braking ? 2.0 : 1.0, 0.03, 0.03);
    if (this.lampU) this.lampU.brake.value = this.braking ? 1 : 0;
    if (this.tailLight) this.tailLight.intensity = this.braking ? 2.5 : 0.6;
    const fl = this.boosting || this.mini;
    for (const f of this.flames) { f.visible = fl; if (fl) { const k = (this.boosting ? 1.2 : 0.7) * (0.75 + Math.random() * 0.5); f.scale.set(1, k, 1); f.position.z = -2.4 - 0.45 * k; } }
  }

  // world positions of the rear contact patches (for skids & smoke)
  rearWheels() {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    return [-1, 1].map(s => [this.x + rx * s * 0.86 - fx * 1.38, this.z + rz * s * 0.86 - fz * 1.38]);
  }
}
