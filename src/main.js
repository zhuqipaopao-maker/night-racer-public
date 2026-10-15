import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Track } from './track.js';
import { buildCity, buildSky, buildEnv } from './city.js';
import { buildMountain, buildDuskSky } from './mountain.js';
import { buildCoast, buildDaySky } from './coast.js';
import { buildChangan, buildMoonSky, warmEnv } from './changan.js';
import { buildSkySite, buildDuskNightSky } from './sky.js';
import { buildDream } from './dream.js';
import { buildDeep } from './deep.js';
import { buildCanyon, buildDesertSky } from './canyon.js';
import { buildMetro } from './metro.js';
import { buildReef } from './reef.js';
import { buildIce, buildAuroraSky } from './ice.js';
import { createProfile } from './profile.js';
import { openGarage } from './garage.js';
import { MAPS } from './maps.js';
import { installHeightFog } from './heightfog.js';
import { isTouchDevice, setupTouch } from './touch.js';
import { Net, newRoomCode, cleanCode } from './net.js';
import { createBoard } from './leaderboard.js';
import { beam, applyHeadlight } from './headlight.js';
import { Car, useSculptedCars } from './car.js';
import { RaceLine, AIDriver } from './ai.js';
import { Smoke, Skids, Rain } from './effects.js';
import { radialTexture } from './textures.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const fmt = t => { if (t == null) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

// ---------- renderer & scene ----------
const canvas = $('gl');
const TOUCH = isTouchDevice;
if (TOUCH) document.body.classList.add('touch');
// Game viewport. On a phone held in portrait (WeChat's browser never rotates) the game is drawn turned
// 90° inside #app, so its width is the screen's height.
let VW = innerWidth, VH = innerHeight, ROT = false;
function layout() {
  ROT = TOUCH && innerHeight > innerWidth;
  document.body.classList.toggle('rot', ROT);
  VW = ROT ? innerHeight : innerWidth; VH = ROT ? innerWidth : innerHeight;
  const app = $('app'); app.style.width = VW + 'px'; app.style.height = VH + 'px';
  document.documentElement.style.setProperty('--gw', VW / 100 + 'px');
  document.documentElement.style.setProperty('--gh', VH / 100 + 'px');
}
layout();
// Graphics presets. iPhones default to the top preset (the user's friends mostly play on iPhones);
// the adaptive loop below can still step down at run time.
const GFX_LEVELS = {
  low:  { label: '流畅',   pr: 0.8, aa: false, bloom: false, shadow: 0,    trees: 0.4, rain: 1200, smoke: 0.35 },
  mid:  { label: '均衡',   pr: 1.1, aa: false, bloom: true,  shadow: 1024, trees: 0.7, rain: 2500, smoke: 0.7 },
  high: { label: '高画质', pr: 1.5, aa: true,  bloom: true,  shadow: 2048, trees: 1,   rain: 5000, smoke: 1 },
  ultra: { label: '极高',  pr: 2.0, aa: true,  bloom: true,  shadow: 2048, trees: 1,   rain: 5000, smoke: 1 },
};
function autoGfx() {
  if (!TOUCH) return 'high';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return 'ultra';
  return (navigator.deviceMemory || 4) <= 4 || (navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'mid';
}
const gfxId = GFX_LEVELS[store.get('nr-gfx')] ? store.get('nr-gfx') : autoGfx();
const GFX = GFX_LEVELS[gfxId];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: GFX.aa, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, GFX.pr);
let useBloom = GFX.bloom;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(VW, VH);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// owner's back door: …/#<key>-deep or …/#<key>-dream jumps straight into a secret map. Only the key's hash
// lives in the code, so reading the source doesn't give it away. The key is removed from the address bar at once.
{
  const m = location.hash.match(/^#([a-z0-9]{6,20})-(deep|dream)$/);
  if (m) {
    const h = s => { let a = 0xdeadbeef, b = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
      a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return 4294967296 * (2097151 & b) + (a >>> 0); };
    if (h(m[1]) === 2173172146822299) {
      const cur = store.get('nr-map');
      if (MAPS[cur] && !MAPS[cur].secret) store.set('nr-prev-map', cur);
      store.set('nr-map', m[2]); store.set('nr-secret', 1);
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
}
const mapId = MAPS[store.get('nr-map')] ? store.get('nr-map') : 'city';
const MAP = MAPS[mapId];
const LAPS = MAP.laps;
const KEY = k => (mapId === 'city' ? 'nr-' + k : `nr-${k}-${mapId}`);   // per-map records (city keeps its original keys)
// garage + wallet; 标准组 = everyone on equal standard cars (only looks differ), 改装组 = your upgraded car
const profile = createProfile(store);
const group = store.get('nr-group') === 'mod' ? 'mod' : 'std';
const LKEY = k => KEY(group === 'mod' ? k + '-mod' : k);   // lap records / ghosts are kept per group
const STD = { top: 1, accel: 1, grip: 1, nitro: 1 };
const myStats = () => (group === 'mod' ? profile.statsOf() : { ...STD });

if (MAP.style === 'mountain') installHeightFog({ base: 0, falloff: 0.045, density: 0.0075, color: [0.82, 0.72, 0.76] });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, VW / VH, 0.1, 5000);
let reflect = store.get('nr-refl') ?? 0.7;
scene.environmentIntensity = reflect;
const track = new Track(MAP);
track.build(scene);
let city = { userData: {} };
let sun = null, sunDir = null, coastScene = null, ancientScene = null, ancientHemi = null, skyScene = null, skyHemi = null, dreamScene = null, deepScene = null, deepHemi = null, deepKey = null, canyonScene = null, metroScene = null, reefScene = null, iceScene = null;
let crackT = 4, beatT = 0, beatN = 0;
if (MAP.style === 'city') {
  scene.fog = new THREE.FogExp2(0x120d1f, 0.0028);
  scene.environment = buildEnv(renderer);
  scene.add(new THREE.HemisphereLight(0x5a6aa8, 0x120e18, 0.55));
  const moon = new THREE.DirectionalLight(0x8090ff, 0.35); moon.position.set(-200, 300, 100); scene.add(moon);
  city = buildCity(scene, track);
  buildSky(scene);
} else if (MAP.style === 'sky') {
  // time of day runs with race progress: tod 0 = afternoon … 0.55 = golden sunset … 1 = night
  sunDir = new THREE.Vector3(-0.5, 0.65, 0.57).normalize();
  scene.fog = new THREE.FogExp2(0xbcd2e6, 0.00045);
  scene.environment = buildEnv(renderer);
  skyHemi = new THREE.HemisphereLight(0xcfe4ff, 0x6a6458, 1.5); scene.add(skyHemi);
  sun = new THREE.DirectionalLight(0xfff3e2, 3.2);
  sun.castShadow = GFX.shadow > 0;
  sun.shadow.mapSize.set(GFX.shadow || 512, GFX.shadow || 512);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = GFX.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  skyScene = buildSkySite(scene, track, { quality: GFX.trees });
  // two skies: the dusk/night dome behind, the cloudy day dome in front fading out at sunset
  const nightSky = buildDuskNightSky(scene, sunDir, skyScene.night);
  const daySky = buildDaySky(scene, sunDir);
  daySky.scale.setScalar(0.995); daySky.renderOrder = 1;
  daySky.material.transparent = true;
  daySky.material.uniforms.alpha = { value: 1 };
  daySky.material.fragmentShader = daySky.material.fragmentShader.replace('uniform float time;', 'uniform float time; uniform float alpha;').replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(c, alpha);');
  skyScene.skies = { day: daySky, night: nightSky };
  track.group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
} else if (MAP.style === 'dream') {
  // synthwave dream: violet haze, pink key light from the retro sun, cyan fill from below
  scene.fog = new THREE.FogExp2(0x3a0c4a, 0.0011);
  scene.environment = buildEnv(renderer);
  scene.add(new THREE.HemisphereLight(0xff5fd0, 0x20c8ff, 0.9));
  const key = new THREE.DirectionalLight(0xff8ac8, 1.6); key.position.set(0, 120, -900); scene.add(key);
  dreamScene = buildDream(scene, track);
  renderer.toneMappingExposure = 1.1;
} else if (MAP.style === 'deep') {
  // 坠梦: fog, sky and light are re-blended every frame from the dream layer the player is in
  scene.fog = new THREE.FogExp2(0x3a0c4a, 0.0011);
  scene.environment = buildEnv(renderer);
  deepHemi = new THREE.HemisphereLight(0xff5fd0, 0x20c8ff, 0.9); scene.add(deepHemi);
  deepKey = new THREE.DirectionalLight(0xff8ac8, 1.6); scene.add(deepKey, deepKey.target);
  const tb = performance.now();
  deepScene = buildDeep(scene, track, { quality: GFX.trees });
  window.__terrainMs = Math.round(performance.now() - tb);
} else if (MAP.style === 'reef') {
  // under the sea: blue-green haze, light from the surface above, caustics on the sand
  scene.background = new THREE.Color(0x0c4554);
  scene.fog = new THREE.FogExp2(0x0c4554, 0.0075);
  scene.environment = buildEnv(renderer);
  scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x1a3a40, 1.5));
  sunDir = new THREE.Vector3(0.2, 1, 0.15).normalize();
  sun = new THREE.DirectionalLight(0xbff4ff, 2.2);
  sun.castShadow = GFX.shadow > 0;
  sun.shadow.mapSize.set(GFX.shadow || 512, GFX.shadow || 512);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = GFX.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tb = performance.now();
  reefScene = buildReef(scene, track, { quality: GFX.trees });
  window.__terrainMs = Math.round(performance.now() - tb);
  renderer.toneMappingExposure = 1.05;
} else if (MAP.style === 'metro') {
  // a city at golden hour: low warm sun raking down the streets, long building shadows
  sunDir = new THREE.Vector3(0.55, 0.3, -0.78).normalize();
  scene.fog = new THREE.FogExp2(0xc9b8a6, 0.0009);
  const sky = buildDesertSky(scene, sunDir);
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x6a5a4a, 1.05));
  sun = new THREE.DirectionalLight(0xffc890, 3.4);
  sun.castShadow = GFX.shadow > 0;
  sun.shadow.mapSize.set(GFX.shadow || 512, GFX.shadow || 512);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = GFX.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tb = performance.now();
  metroScene = buildMetro(scene, track, { quality: GFX.trees });
  window.__terrainMs = Math.round(performance.now() - tb);
  renderer.toneMappingExposure = 1.0;
} else if (MAP.style === 'canyon') {
  // desert at sunset: low warm sun, dusty haze
  sunDir = new THREE.Vector3(-0.62, 0.2, 0.76).normalize();
  scene.fog = new THREE.FogExp2(0xd8a27a, 0.0008);
  const sky = buildDesertSky(scene, sunDir);
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xffd8b4, 0x7a4a30, 1.25));
  sun = new THREE.DirectionalLight(0xffb878, 3.3);
  sun.castShadow = GFX.shadow > 0;
  sun.shadow.mapSize.set(GFX.shadow || 512, GFX.shadow || 512);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = GFX.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tb = performance.now();
  canyonScene = buildCanyon(scene, track, { quality: GFX.trees });
  canyonScene.sky = sky;
  window.__terrainMs = Math.round(performance.now() - tb);
  track.group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  renderer.toneMappingExposure = 1.0;
} else if (MAP.style === 'ice') {
  // icefield at night: aurora overhead, cold blue haze, moonlight on the snow
  scene.fog = new THREE.FogExp2(0x0e1a2c, 0.0014);
  const sky = buildAuroraSky(scene);
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0x7f9fd8, 0x2a3448, 1.1));
  const moon = new THREE.DirectionalLight(0xc4d4ff, 1.1); moon.position.set(-300, 400, 200); scene.add(moon);
  const tb = performance.now();
  iceScene = buildIce(scene, track, { quality: GFX.trees });
  iceScene.sky = sky;
  window.__terrainMs = Math.round(performance.now() - tb);
  renderer.toneMappingExposure = 1.05;
} else if (MAP.style === 'ancient') {
  scene.fog = new THREE.FogExp2(0x120a14, 0.0009);
  scene.environment = warmEnv(renderer);
  ancientHemi = new THREE.HemisphereLight(0x4a4f86, 0x3a160a, 0.75); scene.add(ancientHemi);
  const moonLight = new THREE.DirectionalLight(0xaab8ff, 0.3); moonLight.position.set(350, 300, -890); scene.add(moonLight);
  buildMoonSky(scene, new THREE.Vector3(0.12, 0.2, -0.97));
  ancientScene = buildChangan(scene, track, {
    quality: GFX.trees,
    onBoom: (x, y, z, type) => {
      const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
      // left/right from the camera's point of view, for stereo placement
      const v = new THREE.Vector3(x, y, z).sub(camera.position).normalize(), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      setTimeout(() => sound.boom(Math.max(0.06, 1 - d / 1400), type, Math.max(-0.85, Math.min(0.85, v.dot(right)))), d / 0.34);
    },
    onLaunch: (x, z) => { const d = Math.hypot(x - camera.position.x, z - camera.position.z); if (d < 260) setTimeout(() => sound.whistle(1 - d / 260), d / 0.34); },
  });
} else {
  const coast = MAP.style === 'coast';
  // mountain: low golden dusk sun · coast: high midday sun over a hazy sea
  sunDir = coast ? new THREE.Vector3(0.45, 0.62, 0.62).normalize() : new THREE.Vector3(-0.75, 0.2, 0.55).normalize();
  scene.fog = coast ? new THREE.FogExp2(0xb9d3e6, 0.00042) : new THREE.FogExp2(0xb08a92, 0.0010);
  const sky = coast ? buildDaySky(scene, sunDir) : buildDuskSky(scene, sunDir);
  if (coast) sky.userData.isDay = true;
  // environment map baked from the sky alone
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.04).texture; pm.dispose();
  scene.add(coast ? new THREE.HemisphereLight(0xbfdcff, 0x6b6250, 1.35) : new THREE.HemisphereLight(0xc8b8e8, 0x4a3a2a, 1.25));
  // sun with a shadow box that follows the player
  sun = new THREE.DirectionalLight(coast ? 0xfff2dd : 0xffc08a, coast ? 3.0 : 3.4);
  sun.castShadow = GFX.shadow > 0;
  sun.shadow.mapSize.set(GFX.shadow || 512, GFX.shadow || 512);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = GFX.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tb = performance.now();
  if (coast) coastScene = buildCoast(scene, track, { trees: Math.round(1600 * GFX.trees) });
  else buildMountain(scene, track, { trees: Math.round(4200 * GFX.trees) });
  window.__terrainMs = Math.round(performance.now() - tb);
  if (coast) { const t0 = performance.now(); setInterval(() => { sky.material.uniforms.time.value = (performance.now() - t0) / 1000; }, 100); }
  track.group.traverse(o => { if (o.isMesh) { o.receiveShadow = true; if (o.isInstancedMesh) o.castShadow = true; } });
  renderer.toneMappingExposure = coast ? 0.95 : 1.08;
}
const line = new RaceLine(track);
const smoke = new Smoke(scene);
const rain = new Rain(scene, GFX.rain);
const sound = new Sound(store.get('nr-vol'));

// build every 坠梦 shader now, so no layer stalls the game the first time it comes into view
if (deepScene) { const tc = performance.now(); deepScene.precompile(renderer, camera); window.__compileMs = Math.round(performance.now() - tc); }
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let BLOOM = MAP.style === 'reef' ? 0.35 : MAP.style === 'canyon' || MAP.style === 'metro' ? 0.22 : MAP.style === 'dream' || MAP.style === 'deep' ? 0.4 : MAP.style === 'sky' ? 0.25 : MAP.style === 'city' ? 0.7 : MAP.style === 'ancient' ? 0.55 : MAP.style === 'coast' ? 0.25 : 0.45;
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), BLOOM, MAP.style === 'ancient' ? 0.4 : 0.5, MAP.style === 'city' ? 0.92 : MAP.style === 'ancient' ? 0.9 : 0.96);
composer.addPass(bloomPass);
rain.visible = MAP.rain;
composer.addPass(new OutputPass());

function resize() {
  layout();
  renderer.setSize(VW, VH);
  composer.setSize(VW, VH);
  camera.aspect = VW / VH; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 300));

// ---------- racers ----------
const START_I = 6;
const AI_SPECS = [
  { name: '疾风', paint: 0x1f5fff, glow: 'rgba(80,140,255,.9)', skill: 1.0, drifter: true, bias: -0.6 },
  { name: '白鲨', paint: 0xe4e6ea, ui: '#e4e6ea', glow: 'rgba(220,240,255,.75)', skill: 0.985, bias: 0.8 },
  { name: '夜猫', paint: 0x16161a, ui: '#b47bff', glow: 'rgba(180,90,255,.9)', skill: 0.97, drifter: true, bias: 0.2 },
  { name: '阿杰', paint: 0xffaa00, glow: 'rgba(255,190,60,.9)', skill: 0.955, bias: -1.0 },
  { name: '老K', paint: 0x18a85a, glow: 'rgba(60,255,150,.9)', skill: 0.94, bias: 1.1 },
];
// AI pace multipliers. easy/normal also hold back hard when they get ahead of you (see stepRace).
const DIFF = { easy: 0.6, normal: 0.74, hard: 1.0 };
const diffOf = d => (DIFF[d] ? d : 'normal');
const PLAYER_COLOR = '#ff3d7f';

if (MAP.sculpted) useSculptedCars();   // detailed maps race the sculpted GT; the older maps keep their extruded cars
const player = makeRacer(new Car(scene, { ...profile.look(), stats: myStats() }), '你', true, PLAYER_COLOR);
player.skids = new Skids(scene, 1400);
const rivals = AI_SPECS.map(s => {
  const r = makeRacer(new Car(scene, { paint: s.paint, lights: false, glow: s.glow, model: ['gt', 'muscle', 'hatch', 'hyper', 'gt'][AI_SPECS.indexOf(s) % 5], stats: myStats() }), s.name, false, s.ui || '#' + new THREE.Color(s.paint).getHexString());
  r.spec = s; r.skids = new Skids(scene, 500);
  r.ai = new AIDriver(r.car, line, { skill: s.skill, bias: s.bias, drifter: s.drifter, name: s.name });
  r.car.root.visible = false;
  r.label = document.createElement('div'); r.label.className = 'tag'; r.label.textContent = s.name; $('labels').append(r.label);
  return r;
});
const ghost = new Car(scene, { ghost: true }); ghost.root.visible = false;
// Real headlight spots wash out the tails of cars just ahead, so they're off; at night a soft painted
// pool on the road ahead (it never lights other cars) gives the headlight look instead.
for (const b of player.car.beams) { b.intensity = 0; b.visible = false; }
let headPool = null;
if (MAP.style !== 'coast') {
  // near pool: wide and bright just ahead; far beam: a longer, narrower throw down the road
  const beamTex = radialTexture('rgba(255,246,228,0.75)', 'rgba(255,240,210,0)');
  const add = (w, l, z, op) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.06, z); m.renderOrder = 2; player.car.root.add(m); return m;
  };
  // a faint glow just ahead (the shader beam below does the real lighting of the road)
  headPool = add(9, 14, 8, MAP.style === 'mountain' ? 0.25 : 0.4);
  // light the road surface, kerbs and roadside barriers in the beam
  track.group.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) applyHeadlight(o.material); });
  beam.strength.value = MAP.style === 'mountain' ? 0.6 : MAP.style === 'ancient' ? 1.0 : 0.9;
}
if (MAP.style !== 'city') for (const r of [player, ...rivals]) r.car.glowMesh.material.opacity *= MAP.style === 'coast' ? 0.25 : 0.6;   // underglow barely shows in daylight
if (sun) for (const r of [player, ...rivals]) r.car.root.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
let racers = [player];

function makeRacer(car, name, isPlayer, color) {
  return { car, name, isPlayer, color, lapsDone: 0, halfway: false, lapStart: 0, lastLap: null, bestLap: null, finished: false, finishTime: null };
}
function resetRacer(r, i, off, lapsDone, halfway) {
  const h = Math.atan2(track.tx[i], track.tz[i]);
  r.car.reset(track.px[i] + track.nx[i] * off, track.pz[i] + track.nz[i] * off, h, track.py[i]);
  r.car.hint = i; r.car.trackI = i; r.car.trackOff = off;
  Object.assign(r, { lapsDone, halfway, lapStart: 0, lastLap: null, bestLap: null, finished: false, finishTime: null });
  r.skids && (r.skids.last = [null, null]);
}

// ---------- input ----------
const keys = new Set();
let nitroLatch = false;
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  onKey(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const down = (...c) => c.some(k => keys.has(k));
let autoGas = store.get('nr-auto') ?? true;
let steerSens = store.get('nr-sens') ?? 1;
addEventListener('storage', () => { steerSens = store.get('nr-sens') ?? 1; });
if (TOUCH && store.get('nr-steer') === 'buttons') document.body.classList.add('steer-buttons');
let touch = null;
function readInput() {
  const nitroNow = down('Space');
  const pressed = nitroNow && !nitroLatch; nitroLatch = nitroNow;
  const brake = down('KeyS', 'ArrowDown');
  const keySteer = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
  return {
    throttle: down('KeyW', 'ArrowUp') || (TOUCH && autoGas && !brake),
    brake,
    steer: keySteer || (touch ? Math.max(-1, Math.min(1, touch.steer * steerSens)) : 0),
    // Shift, or J / X: on Windows, Shift can be taken by the Chinese input method (中/英 switch) or Sticky Keys
    drift: down('ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyX'),
    nitroPressed: pressed,
  };
}
const idle = { throttle: false, brake: false, steer: 0, drift: false, nitroPressed: false };

// ---------- game state ----------
let state = 'title';          // title | countdown | race | paused | finished
let mode = store.get('nr-mode') || 'race';
let diff = store.get('nr-diff') || 'normal';
let countT = 0, raceTime = 0, finishedT = 0;
let best = store.get(LKEY('best-lap'));
let ghostData = store.get(LKEY('ghost'));   // { t, f: [[x,z,h,d,y], ...] } at 30 Hz
let ghostRec = [], recT = 0;
let camMode = Math.min(3, Math.max(0, store.get('nr-cam') ?? 0)), shake = 0;
let playerAuto = null;
const CAM_NAMES = ['追尾视角', '远景追尾', '驾驶舱（第一人称）', '引擎盖视角'];
function nextCam() { camMode = (camMode + 1) % CAM_NAMES.length; store.set('nr-cam', camMode); flash(CAM_NAMES[camMode]); }

function setupGrid() {
  if (mode === 'race') {
    racers = [...rivals, player];
    const mult = DIFF[diffOf(diff)];
    // two-wide staggered grid behind the line; player starts last
    racers.forEach((r, k) => {
      const row = Math.floor(k / 2), side = k % 2 ? 3.3 : -3.3;
      resetRacer(r, track.wrap(-5 - row * 8 - (k % 2) * 3), side, -1, true);
      if (r.ai) { r.ai.skill = r.spec.skill * mult; r.ai.relaxed = diff !== 'hard'; r.ai.avoid = 0; r.ai.stuckT = 0; r.ai.rubber = 0; r.car.root.visible = true; }
    });
    ghost.root.visible = false;
  } else {
    racers = [player];
    rivals.forEach(r => { r.car.root.visible = false; r.label.hidden = true; });
    resetRacer(player, START_I, 3.2, 0, false);
  }
  player.car.bottles = 1;
  playerAuto = null;
}
function resetToTrack(r) {
  const c = r.car;
  let i = c.trackI ?? START_I;
  if (track.layered) i = track.respawnIndex(c.fell ? (c.lastGroundI ?? i) : i);   // back on solid deck, before the jump
  if (track.paths && c.path) {
    const p = track.pose(c.path, (c.pathK ?? 0) - 8), { bottles, nitro } = c;
    c.reset(p.x, p.z, p.h, p.y); c.bottles = bottles; c.nitro = nitro; c.hint = p.i; c.trackI = p.i;
    if (r.isPlayer) flash('复位');
    return;
  }
  const h = Math.atan2(track.tx[i], track.tz[i]);
  const { bottles, nitro } = c;
  const off = r.ai ? Math.max(-3, Math.min(3, line.off[i] * 0.8)) : 0;
  c.reset(track.px[i] + track.nx[i] * off, track.pz[i] + track.nz[i] * off, h, track.layered ? track.up[i] : track.py[i]);
  c.bottles = bottles; c.nitro = nitro; c.hint = i; c.trackI = i;
  if (r.isPlayer) flash('复位');
}
setupGrid();

function refreshTitle() {
  document.querySelectorAll('[data-map]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.map === mapId)));
  $('best').textContent = best ? `你的最快圈：${fmt(best)}` : '';
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.querySelectorAll('[data-diff]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.diff === diff)));
  $('diffrow').style.visibility = mode === 'race' ? 'visible' : 'hidden';
  $('start').textContent = mode === 'race' ? `开始比赛 · ${LAPS} 圈 ▸` : (ghostData ? '开始计时赛 · 挑战幽灵车 ▸' : '开始计时赛 ▸');
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; store.set('nr-mode', mode); setupGrid(); refreshTitle(); }));
document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { diff = b.dataset.diff; store.set('nr-diff', diff); refreshTitle(); }));
// the secret map never sits in the map list: the only way in is driving the wrong way (its button shows only while you're there)
for (const id of ['dream']) document.querySelectorAll(`[data-map=${id}],[data-lbmap=${id}]`).forEach(b => { b.hidden = mapId !== id; });
$('mapname').textContent = MAP.name; $('mapsub').textContent = MAP.sub; $('blurb').textContent = MAP.blurb; document.title = MAP.name;
document.querySelectorAll('[data-map]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.map === mapId) return;
  store.set('nr-map', b.dataset.map);
  $('loading').hidden = false;
  setTimeout(() => location.reload(), 30);
}));
refreshTitle();

// ---------- group, coins, garage ----------
document.querySelectorAll('[data-group]').forEach(b => {
  b.setAttribute('aria-pressed', String(b.dataset.group === group));
  b.addEventListener('click', () => { if (b.dataset.group === group) return; store.set('nr-group', b.dataset.group); $('loading').hidden = false; setTimeout(() => location.reload(), 30); });
});
const showCoins = () => { $('coins').textContent = `🪙 ${profile.data.coins}`; const t = profile.data.daily.tasks, ready = t.filter(x => !x.claimed && x.prog >= profile.taskDef(x.id)[2]).length; $('garagebtn').textContent = ready ? `🚗 车库 · ${ready} 个奖励待领` : '🚗 车库'; };
profile.onChange(showCoins); showCoins();
$('garagebtn').addEventListener('click', () => openGarage(profile, {
  onClose(changedLook) { showCoins(); if (changedLook) { $('loading').hidden = false; setTimeout(() => location.reload(), 30); } else player.car.stats = myStats(); },
}));
if (profile.loginBonus) setTimeout(() => flash(`连续登录第 ${profile.data.streak.n} 天 · +${profile.loginBonus} 金币`, '#ffd23d'), 1200);

// ---------- the secret: drive the wrong way far enough and you fall into 霓虹梦境 (and back out again) ----------
let backDist = 0, backHint = false;
function wrongWayCheck(c, prevI) {
  const N = track.N; let d = c.trackI - prevI;
  if (d > N / 2) d -= N; else if (d < -N / 2) d += N;
  if (Math.abs(d) > 40) return;   // a reset or a jump between layers, not driving
  if (d < 0) backDist -= d * track.step; else if (d > 0) backDist = Math.max(0, backDist - d * track.step * 2);
  if (backDist > 110 && !backHint) { backHint = true; glitch(0.5); flash('？', '#ff4fd8'); sound.hit(3); }
  if (backDist < 60) backHint = false;
  if (backDist > 220) warp();   // (坠梦: the moon gap is ~240 m behind the grid)
}
function glitch(sec) {
  document.body.classList.add('glitching');
  clearTimeout(glitch.t); glitch.t = setTimeout(() => document.body.classList.remove('glitching'), sec * 1000);
}
// wrong way out of a dream wakes you up; wrong way anywhere else drops you into 霓虹梦境;
// winning a race in 霓虹梦境 (or the wrong way on 霓虹街区) takes you one dream deeper (坠梦)
function warp(deeper) {
  if (state === 'warp') return;
  state = 'warp';
  if (mapId === 'city') deeper = true;   // the wrong way on the first map (霓虹街区) falls straight into 坠梦
  const leaving = !deeper && !!MAP.secret, prev = store.get('nr-prev-map');
  const dest = deeper ? 'deep' : leaving ? (MAPS[prev] && !MAPS[prev].secret ? prev : 'city') : 'dream';
  if (!MAP.secret) store.set('nr-prev-map', mapId);
  store.set('nr-secret', 1); store.set('nr-warp', deeper ? 'deep' : leaving ? 'out' : 'in');
  sound.musicStop(); sound.hit(9);
  $('glitchtext').textContent = deeper ? '坠入更深的梦……' : leaving ? '正在返回现实……' : '检测到异常时空……';
  $('glitch').hidden = false; glitch(2);
  setTimeout(() => { store.set('nr-map', dest); location.reload(); }, 1900);
}
{
  const w = store.get('nr-warp');
  if (w) {
    store.set('nr-warp', null);
    $('glitchtext').textContent = w === 'in' ? '欢迎来到 霓虹梦境' : w === 'deep' ? '坠梦 · 这一次，只有一圈' : '你回来了。刚才那是梦吗？';
    $('glitch').hidden = false; $('glitch').classList.add('out'); glitch(1.2);
    setTimeout(() => { $('glitch').hidden = true; $('glitch').classList.remove('out'); }, 2600);
  }
}
if (dreamScene || deepScene) {
  // the music starts with the first touch (browsers don't allow sound before one)
  const go = () => { sound.init(); sound.musicStart(); };
  addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true });
}

function startRace() {
  resetRun(); lastPay = null;
  sound.init();
  if (ancientScene) sound.bank();   // pre-render firework/drum sounds before the lights go out
  if (dreamScene || deepScene) sound.musicStart();
  $('title').hidden = true; $('results').hidden = true; $('pause').hidden = true; $('hud').hidden = false;
  document.body.dataset.mode = mode;
  setupGrid();
  raceTime = 0; ghostRec = []; recT = 0;
  state = 'countdown'; countT = 0; camInit = false; $('volume').hidden = true;
  keys.clear(); $('touch').hidden = false;
  if (TOUCH && document.fullscreenEnabled && !document.fullscreenElement)
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  setTimeout(() => { $('keys').style.opacity = '0'; }, 14000);
}
function toTitle() {
  state = 'title';
  player.car.setCockpit(false);
  $('title').hidden = false; $('results').hidden = true; $('pause').hidden = true; $('hud').hidden = true; $('touch').hidden = true;
  rivals.forEach(r => r.label.hidden = true);
  setupGrid(); refreshTitle();
}
$('start').addEventListener('click', startRace);

// volume panel (title + pause); V toggles it anywhere
const VOL = [['master', '总音量'], ['car', '车辆（引擎、轮胎、风噪）'], ['rain', '雨声'], ['sfx', '音效（碰撞、倒计时、提示）'], ['music', '音乐（霓虹梦境）']];
const volBox = $('volume');
{
  const seg = (title, opts, cur, onPick, note) => {
    const row = document.createElement('div'); row.className = 'srow';
    const h = document.createElement('span'); h.textContent = title; row.append(h);
    const s = document.createElement('div'); s.className = 'seg'; s.setAttribute('role', 'group'); s.setAttribute('aria-label', title);
    for (const [v, txt] of opts) {
      const b = document.createElement('button'); b.textContent = txt; b.setAttribute('aria-pressed', String(v === cur));
      b.addEventListener('click', () => { s.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); onPick(v); });
      s.append(b);
    }
    row.append(s);
    if (note) { const n = document.createElement('span'); n.className = 'note'; n.textContent = note; row.append(n); }
    volBox.append(row);
  };
  const head = t => { const d = document.createElement('div'); d.className = 'shead'; d.textContent = t; volBox.append(d); };
  head('画面');
  seg('画质', Object.entries(GFX_LEVELS).map(([k, v]) => [k, v.label]), gfxId, v => {
    if (v === gfxId) return;
    store.set('nr-gfx', v);
    if (state === 'title') { $('loading').hidden = false; setTimeout(() => location.reload(), 30); }
    else flash('回到主菜单后生效');
  }, '卡顿或手机发烫时选「流畅」。切换后会重新载入。');
  seg('卡顿时自动降画质', [[true, '开'], [false, '关']], store.get('nr-autodeg') ?? true, v => { autoDegrade = v; store.set('nr-autodeg', v); }, '关掉后始终保持你选的画质，哪怕掉帧。');
  {
    const row = document.createElement('label'); row.className = 'vrow'; row.htmlFor = 'refl';
    const name = document.createElement('span'); name.textContent = '反光强度';
    const input = document.createElement('input'); input.type = 'range'; input.id = 'refl'; input.min = 0; input.max = 150; input.value = Math.round(reflect * 100);
    const val = document.createElement('b'); val.className = 'num'; val.textContent = input.value;
    input.addEventListener('input', () => { val.textContent = input.value; reflect = input.value / 100; scene.environmentIntensity = reflect; store.set('nr-refl', reflect); });
    row.append(name, input, val); volBox.append(row);
  }
  if (TOUCH) {
    head('操作');
    seg('转向方式', [['pad', '滑动转向板'], ['buttons', '左右按钮']], store.get('nr-steer') || 'pad', v => { store.set('nr-steer', v); document.body.classList.toggle('steer-buttons', v === 'buttons'); });
    const row = document.createElement('label'); row.className = 'vrow'; row.htmlFor = 'sens';
    const name = document.createElement('span'); name.textContent = '转向灵敏度';
    const input = document.createElement('input'); input.type = 'range'; input.id = 'sens'; input.min = 50; input.max = 150; input.value = Math.round((store.get('nr-sens') ?? 1) * 100);
    const val = document.createElement('b'); val.className = 'num'; val.textContent = input.value;
    input.addEventListener('input', () => { val.textContent = input.value; steerSens = input.value / 100; store.set('nr-sens', steerSens); });
    row.append(name, input, val); volBox.append(row);
  }
  head('声音');
}
for (const [k, label] of VOL) {
  const id = 'vol-' + k;
  const row = document.createElement('label'); row.className = 'vrow'; row.htmlFor = id;
  const name = document.createElement('span'); name.textContent = label;
  const input = document.createElement('input'); input.type = 'range'; input.min = 0; input.max = 100; input.id = id; input.value = Math.round(sound.vol[k] * 100);
  const val = document.createElement('b'); val.className = 'num'; val.textContent = input.value;
  input.addEventListener('input', () => { val.textContent = input.value; sound.setVolume(k, input.value / 100); store.set('nr-vol', sound.vol); });
  row.append(name, input, val); volBox.append(row);
}
const toggleVol = () => { sound.init(); volBox.hidden = !volBox.hidden; };
$('volbtn').addEventListener('click', toggleVol);
$('volbtn2').addEventListener('click', toggleVol);
$('volclose').addEventListener('click', () => { volBox.hidden = true; });
$('again').addEventListener('click', () => (mp ? (mp.isHost && net.send({ t: 'lobby' })) : startRace()));
$('menu').addEventListener('click', () => (mp ? leaveRoom() : toTitle()));

function setPaused(p) {
  if (mp) {   // online the race can't stop for everyone: just show/hide the menu
    const show = $('pause').hidden;
    $('pause').hidden = !show; $('restart').hidden = true; $('pausenote').hidden = false;
    $('quit').textContent = '离开房间';
    return;
  }
  $('restart').hidden = false; $('pausenote').hidden = true; $('quit').textContent = '回主菜单';
  if (!(state === 'race' || state === 'paused')) return;
  state = p ? 'paused' : 'race';
  $('pause').hidden = !p;
  if (!p) $('volume').hidden = true;
  keys.clear();
}
$('resume').addEventListener('click', () => (mp ? ($('pause').hidden = true) : setPaused(false)));
$('restart').addEventListener('click', () => startRace());
$('quit').addEventListener('click', () => (mp ? leaveRoom() : toTitle()));
$('cambtn').addEventListener('click', () => nextCam());
$('cambtn2').addEventListener('click', () => nextCam());
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'race' && !mp) setPaused(true); });
if (TOUCH) {
  touch = setupTouch({ keys, onPause: () => setPaused(state === 'race'), rotated: () => ROT });
  const gasBtn = document.querySelector('.tb.gas');
  const syncAuto = () => {
    document.querySelectorAll('[data-auto]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.auto === '1') === autoGas)));
    gasBtn.hidden = autoGas;
  };
  document.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', () => { autoGas = b.dataset.auto === '1'; store.set('nr-auto', autoGas); syncAuto(); }));
  syncAuto();
  ['title', 'volume', 'results'].forEach(id => $(id).classList.add('scrollable'));
}

function onKey(code) {
  if (state === 'title' && code === 'Enter' && $('lobby').hidden && $('board').hidden) return startRace();
  if (state === 'finished' && code === 'Enter' && !$('results').hidden && !mp) return startRace();
  if (code === 'Escape' && (state === 'race' || state === 'paused')) return setPaused(state === 'race');
  if (state === 'paused' && code === 'KeyR' && !mp) return startRace();
  if (code === 'KeyQ' && mp && !$('pause').hidden) return leaveRoom();
  if (state === 'paused' && code === 'KeyQ') return toTitle();
  if (state === 'race' && code === 'KeyR') resetToTrack(player);
  if (code === 'KeyC') nextCam();
  if (code === 'KeyT') { rain.visible = !rain.visible; flash(rain.visible ? '下雨' : '雨停了'); }
  if (code === 'KeyM') flash(sound.toggleMute() ? '静音' : '声音开');
  if (code === 'KeyV') toggleVol();
}

// ---------- coins and daily tasks ----------
// what the player did this race, paid out at the finish (trial: at every lap)
let run = null, lastPay = null;
function resetRun() { run = { drift: 0, jumps: 0, jumpCoins: 0, nitro: 0, branch: 0, laps: 0, record: false, lastPath: 0 }; }
resetRun();
function payout(pos) {
  const lenF = Math.max(0.6, Math.min(2.2, track.length * LAPS / 3000));
  const lines = [];
  if (pos) lines.push([`第 ${pos} 名`, Math.round([200, 140, 100, 70, 50, 40][Math.min(5, pos - 1)] * lenF)]);
  else lines.push([`跑完 ${run.laps} 圈`, run.laps * 40]);
  if (run.drift > 1) lines.push([`漂移 ${run.drift.toFixed(0)} 秒`, Math.round(run.drift * 3)]);
  if (run.jumps) lines.push([`腾空 ${run.jumps} 次`, run.jumpCoins]);
  if (run.nitro) lines.push([`氮气 ${run.nitro} 次`, run.nitro * 5]);
  if (run.record) lines.push(['刷新最快圈', 100]);
  const total = lines.reduce((a, l) => a + l[1], 0);
  profile.earn(total);
  // daily tasks
  const done = [];
  const tk = (id, n) => { if (n > 0 && profile.task(id, n)) done.push(profile.taskDef(id)[1]); };
  tk('drift', Math.floor(run.drift)); tk('jump', run.jumps); tk('nitro', run.nitro); tk('laps', run.laps);
  if (MAP.style === 'metro') tk('branch', run.branch);
  if (pos) { tk('races', 1); if (pos === 1) tk('win', 1); if (pos <= 3) tk('top3', 1); }
  if (total >= 400) tk('coins', 1);
  return { lines, total, done };
}
let msgTimer = 0;
function flash(text, color) {
  const m = $('msg'); m.textContent = text; m.style.color = color || '#fff'; m.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), 1200);
}

// ---------- race logic ----------
function lapDist(r) { const i = r.car.trackI, N = track.N; return (!r.halfway && i > N / 2) ? i - N : i; }
function progress(r) {
  if (r.finished) return 1e9 - r.finishTime;
  if (r.remote) return r.net ? r.net.lapsDone * track.N + r.net.lapDist : -1e9;
  return r.lapsDone * track.N + lapDist(r);
}
function standings() { return [...racers].sort((a, b) => progress(b) - progress(a)); }

function lapCheck(r, prevI) {
  const i = r.car.trackI, N = track.N;
  if (i > N * 0.4 && i < N * 0.6) r.halfway = true;
  if (!(r.halfway && prevI > N * 0.9 && i < N * 0.1)) return;
  r.halfway = false;
  if (r.lapsDone >= 0 || mode === 'trial') {
    const t = raceTime - r.lapStart;
    r.lastLap = t; if (!r.bestLap || t < r.bestLap) r.bestLap = t;
    if (r.isPlayer) onPlayerLap(t);
  }
  r.lapsDone++; r.lapStart = raceTime;
  if (r.isPlayer) { ghostRec = []; recT = 0; }
  if (mode === 'race' && r.lapsDone >= LAPS && !r.finished) {
    r.finished = true; r.finishTime = mp ? (net.now() - mp.at) / 1000 : raceTime;
    if (r.isPlayer) onPlayerFinish();
  } else if (mode === 'race' && r.isPlayer && LAPS > 1 && r.lapsDone === LAPS - 1) flash('最后一圈！', '#ffd23d');
}

function onPlayerLap(t) {
  const isBest = !best || t < best;
  if (mp && !!mp.mod !== (group === 'mod')) return;   // an online race in the other group doesn't touch this group's records
  if (isBest) { best = t; store.set(LKEY('best-lap'), best); run.record = true; }
  if (isBest || (mode === 'trial' && (!ghostData || t < ghostData.t))) {
    ghostData = { t, f: ghostRec.map(f => f.map(v => Math.round(v * 100) / 100)) };
    store.set(LKEY('ghost'), ghostData);
  }
  if (isBest) {
    flash(`最快圈！${fmt(t)}`, '#ffd23d'); sound.chime();
    if (ancientScene) ancientScene.celebrate(player.car.x, player.car.y, player.car.z, player.car.h);
    board.sync(mapId, group === 'mod').then(r => { if (r && r.rank) setTimeout(() => flash(`排行榜第 ${r.rank} 名`, '#ffd23d'), 1500); });
  }
  else if (mode === 'trial') flash(`单圈 ${fmt(t)}`, '#2de1ff');
  run.laps++;
  if (mode === 'trial') { const p = payout(0); resetRun(); setTimeout(() => flash(`+${p.total} 金币`, '#ffd23d'), isBest ? 1400 : 700); if (p.done.length) setTimeout(() => flash('每日任务完成！去车库领奖励', '#9fff7a'), 2600); }
}

function onPlayerFinish() {
  state = 'finished'; finishedT = 0;
  const pos = standings().indexOf(player) + 1;
  lastPay = payout(pos); resetRun();
  flash(pos === 1 ? '冠军！' : `第 ${pos} 名完赛`, pos === 1 ? '#ffd23d' : '#2de1ff');
  if (pos === 1) sound.chime();
  if (pos === 1 && mapId === 'dream' && mode === 'race' && !mp) setTimeout(() => { if (state === 'finished') warp(true); }, 2200);
  if (ancientScene) ancientScene.celebrate(player.car.x, player.car.y, player.car.z, player.car.h);
  playerAuto = new AIDriver(player.car, line, { skill: 0.85 });
}

function showResults() {
  const rows = standings();
  const leader = rows[0];
  const tb = $('rbody'); tb.replaceChildren();
  rows.forEach((r, k) => {
    const tr = document.createElement('tr'); if (r.isPlayer) tr.className = 'me';
    const time = r.finished ? (k === 0 ? fmt(r.finishTime) : '+' + (r.finishTime - leader.finishTime).toFixed(3)) : '行驶中';
    [k + 1, r.name, time, fmt(r.bestLap)].forEach((v, c) => { const td = document.createElement('td'); td.textContent = v; if (c === 1) td.style.color = r.color; tr.append(td); });
    tb.append(tr);
  });
  const pos = rows.indexOf(player) + 1;
  $('rtitle').textContent = pos === 1 ? '冠军' : `第 ${pos} 名`;
  $('again').hidden = !!mp && !mp.isHost;
  $('again').textContent = mp ? '回到房间再来一局 ▸' : '再来一场 ▸';
  $('menu').textContent = mp ? '离开房间' : '回主菜单';
  $('rwait').hidden = !(mp && !mp.isHost);
  const cs = $('coinsum');
  if (lastPay) { cs.hidden = false; cs.replaceChildren(); const h = document.createElement('div'); h.className = 'ctot'; h.textContent = `+${lastPay.total} 金币`; cs.append(h);
    for (const [k, v] of lastPay.lines) { const d = document.createElement('div'); d.textContent = `${k}  +${v}`; cs.append(d); }
    for (const t of lastPay.done) { const d = document.createElement('div'); d.className = 'ctask'; d.textContent = `✓ 每日任务完成：${t}（去车库领取）`; cs.append(d); }
  } else cs.hidden = true;
}

// car-vs-car: two circles per car, positional separation + inelastic impulse
function collide(list = racers) {
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const A = list[a].car, Bc = list[b].car;
    const dx0 = Bc.x - A.x, dz0 = Bc.z - A.z;
    if (dx0 * dx0 + dz0 * dz0 > 36) continue;
    const afx = Math.sin(A.h), afz = Math.cos(A.h), bfx = Math.sin(Bc.h), bfz = Math.cos(Bc.h);
    for (const sa of [-1.15, 1.15]) for (const sb of [-1.15, 1.15]) {
      const ax = A.x + afx * sa, az = A.z + afz * sa, bx = Bc.x + bfx * sb, bz = Bc.z + bfz * sb;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      if (d >= 2.0 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, push = (2.0 - d) / 2;
      A.x -= nx * push; A.z -= nz * push; Bc.x += nx * push; Bc.z += nz * push;
      const rel = (Bc.vx - A.vx) * nx + (Bc.vz - A.vz) * nz;
      if (rel < 0) {
        const j = -1.25 * rel / 2;
        A.vx -= nx * j; A.vz -= nz * j; Bc.vx += nx * j; Bc.vz += nz * j;
        if ((list[a].isPlayer || list[b].isPlayer) && -rel > 2) { shake = Math.max(shake, Math.min(0.35, -rel * 0.04)); sound.hit(-rel * 1.2); }
      }
    }
  }
}

// push a locally simulated racer out of an obstacle car {x,z,h,vx,vz} that we can't move
function collideStatic(L, o) {
  const A = L.car, dx0 = o.x - A.x, dz0 = o.z - A.z;
  let hit = null;
  if (dx0 * dx0 + dz0 * dz0 > 36) return hit;
  const afx = Math.sin(A.h), afz = Math.cos(A.h), bfx = Math.sin(o.h), bfz = Math.cos(o.h);
  for (const sa of [-1.15, 1.15]) for (const sb of [-1.15, 1.15]) {
    const ax = A.x + afx * sa, az = A.z + afz * sa, bx = o.x + bfx * sb, bz = o.z + bfz * sb;
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
    if (d >= 2.0 || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, push = 2.0 - d;
    A.x -= nx * push; A.z -= nz * push;
    const rel = (o.vx - A.vx) * nx + (o.vz - A.vz) * nz;
    if (rel < 0) {
      const j = -1.25 * rel * 0.5;
      A.vx -= nx * j; A.vz -= nz * j;
      if (L.isPlayer && -rel > 2) { shake = Math.max(shake, Math.min(0.35, -rel * 0.04)); sound.hit(-rel * 1.2); }
      hit = { nx, nz, j: (hit ? hit.j : 0) + j };
    } else if (!hit) hit = { nx, nz, j: 0 };
  }
  return hit;
}

function stepRace(dt, playerInput) {
  for (const r of racers) {
    if (r.remote) continue;
    const c = r.car, prevI = c.trackI ?? START_I;
    let inp;
    if (r.isPlayer) inp = playerAuto ? playerAuto.input(dt, racers.map(x => x.car)) : playerInput;
    else {
      // gentle rubber band so the pack stays close to the player
      const gap = (progress(player) - progress(r)) * track.step;
      r.ai.rubber = r.ai.relaxed ? Math.max(-0.12, Math.min(0.03, gap / 1500)) : Math.max(-0.05, Math.min(0.05, gap / 3000));
      inp = r.ai.input(dt, racers.map(x => x.car));
      if (r.ai.stuckT > 2.5) { resetToTrack(r); r.ai.stuckT = 0; }
    }
    c.update(dt, inp, track);
    if (c.fell) {
      r.fallT = (r.fallT || 0) + dt;
      if (!r.isPlayer && r.fallT > 1.2) { resetToTrack(r); r.fallT = 0; }
      continue;   // no lap progress while falling
    }
    lapCheck(r, prevI);
    if (r.isPlayer && state === 'race') { if (c.drifting) run.drift += dt; if (c.path && c.path !== run.lastPath) run.branch++; run.lastPath = c.path || 0; }
    if (r.isPlayer && !mp && state === 'race') wrongWayCheck(c, prevI);
    if (r.isPlayer) {
      for (const ev of c.events) {
        if (ev === 'miniBoost') flash('小喷！', '#2de1ff');
        if (ev === 'bottle') flash('氮气 +1', '#2de1ff');
        if (ev === 'boost') { flash('氮气！', '#9b6bff'); shake = Math.max(shake, 0.12); run.nitro++; }
        if (ev === 'land') {
          shake = Math.max(shake, Math.min(0.6, 0.08 + c.landImpact * 0.05)); sound.hit(4 + c.landImpact * 2);
          const dist = c.takeoffX != null ? Math.hypot(c.x - c.takeoffX, c.z - c.takeoffZ) : 0;
          if (c.landImpact > 6) for (let k = 0; k < 18; k++) smoke.emit(c.x + (Math.random() - 0.5) * 3, c.y + 0.3, c.z + (Math.random() - 0.5) * 3, c.vx * 0.3, c.vz * 0.3, 1);
          if (c.airT > 0.6 && dist > 20) {
            run.jumps++; run.jumpCoins += Math.floor(dist / 4);
            const rec = store.get(KEY('best-jump')) || 0;
            if (dist > rec && state === 'race') { store.set(KEY('best-jump'), dist); flash(`最远一跳！${dist.toFixed(0)} 米 · ${c.airT.toFixed(1)} 秒`, '#ffd23d'); }
            else flash(`腾空 ${c.airT.toFixed(1)} 秒 · ${dist.toFixed(0)} 米`, '#ffd23d');
          } else if (c.airT > 0.35) flash(`腾空 ${c.airT.toFixed(1)} 秒`, '#ffd23d');
        }
        if (ev === 'boostpad') { shake = Math.max(shake, 0.1); sound.hit(2); }
      }
      if (c.impact > 2) { shake = Math.max(shake, Math.min(0.5, c.impact * 0.03)); sound.hit(c.impact); }
    }
  }
  playerInput.nitroPressed = false;
  if (!mp) { if (racers.length > 1) collide(); }
  else {
    // online: cars this device simulates bump each other normally; each of them also bumps into the
    // other players' cars at their predicted *current* position (only our own car is pushed)
    const local = racers.filter(r => !r.remote);
    if (local.length > 1) collide(local);
    // Contact is against the remote car exactly where it is drawn on this screen, so you can never drive
    // through a car you can see. The other player gets a 'bump' so they're shoved on their screen too.
    const now = performance.now();
    for (const r of racers) {
      if (!r.remote || !r.drawn || !r.buf || !r.buf.length) continue;
      const c = r.car, L = r.buf[r.buf.length - 1];
      const o = { x: c.x, z: c.z, h: c.h, vx: Math.sin(c.h) * L.d[4], vz: Math.cos(c.h) * L.d[4] };
      for (const l of local) {
        const hit = collideStatic(l, o);
        if (hit && l.isPlayer) {
          r.touchAt = now;
          if (r.netId && hit.j > 0.4 && now - (r.bumpSent || 0) > 120) { r.bumpSent = now; net.send({ t: 'bump', to: r.netId, nx: +hit.nx.toFixed(3), nz: +hit.nz.toFixed(3), j: +hit.j.toFixed(2) }); }
        }
      }
    }
  }
  raceTime += dt;
  // record the player's lap for the ghost (30 Hz)
  recT += dt;
  if (recT >= 1 / 30) { recT -= 1 / 30; const c = player.car; ghostRec.push([c.x, c.z, c.h, lapDist(player), c.y]); }
}

// ---------- ghost playback & delta ----------
let deltaT = 0;
function updateGhost(dt) {
  const show = mode === 'trial' && ghostData && (state === 'race' || state === 'paused');
  ghost.root.visible = !!show;
  if (!show) { $('delta').textContent = ''; return; }
  const f = ghostData.f, tt = (raceTime - player.lapStart) * 30;
  const k = Math.floor(tt);
  if (k >= f.length - 1) { ghost.root.visible = false; }
  else {
    const a = f[k], b = f[k + 1], u = tt - k;
    let dh = b[2] - a[2]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    ghost.x = a[0] + (b[0] - a[0]) * u; ghost.z = a[1] + (b[1] - a[1]) * u; ghost.h = a[2] + dh * u; ghost.y = (a[4] ?? 0) + ((b[4] ?? 0) - (a[4] ?? 0)) * u;
    ghost.spin += 0.5; ghost.sync();
    // fade when we're right on top of it
    const near = Math.hypot(ghost.x - player.car.x, ghost.z - player.car.z);
    ghost.root.traverse(o => { if (o.isMesh) o.material.opacity = Math.min(0.22, 0.03 + near * 0.02); });
  }
  deltaT += dt; if (deltaT < 0.2) return; deltaT = 0;
  const d = lapDist(player);
  let lo = 0, hi = f.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (f[m][3] < d) lo = m + 1; else hi = m; }
  if (lo <= 0 || lo >= f.length - 1) { $('delta').textContent = ''; return; }
  const delta = (raceTime - player.lapStart) - lo / 30;
  const el = $('delta');
  el.textContent = (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(2);
  el.className = 'num ' + (delta >= 0 ? 'slow' : 'fast');
}

// ---------- HUD ----------
const ARC0 = Math.PI * 0.75, ARC1 = Math.PI * 2.25;
function arcPath(t) {
  const a1 = ARC0 + (ARC1 - ARC0) * Math.max(0.001, Math.min(1, t)), r = 92, c = 120;
  const p = a => `${c + Math.cos(a) * r} ${c + Math.sin(a) * r}`;
  return `M ${p(ARC0)} A ${r} ${r} 0 ${a1 - ARC0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}
$('arcBg').setAttribute('d', arcPath(1));

const mini = $('mini'), mctx = mini.getContext('2d');
const mapImg = document.createElement('canvas'); mapImg.width = mini.width; mapImg.height = mini.height;
const B = track.bounds, pad = 24;
const ms = Math.min((mini.width - pad * 2) / (B.maxx - B.minx), (mini.height - pad * 2) / (B.maxz - B.minz));
const mx = x => pad + (x - B.minx) * ms + ((mini.width - pad * 2) - (B.maxx - B.minx) * ms) / 2;
const mz = z => pad + (z - B.minz) * ms + ((mini.height - pad * 2) - (B.maxz - B.minz) * ms) / 2;
{
  const g = mapImg.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= track.N; i++) { const k = i % track.N; i ? g.lineTo(mx(track.px[k]), mz(track.pz[k])) : g.moveTo(mx(track.px[k]), mz(track.pz[k])); }
  for (const P of track.paths || []) { g.moveTo(mx(P.px[0]), mz(P.pz[0])); for (let k = 1; k < P.K; k++) g.lineTo(mx(P.px[k]), mz(P.pz[k])); }   // side roads
  g.strokeStyle = 'rgba(45,225,255,.25)'; g.lineWidth = 12; g.stroke();
  g.strokeStyle = 'rgba(233,237,245,.85)'; g.lineWidth = 3; g.stroke();
  const sx = mx(track.px[0]), sz = mz(track.pz[0]);
  g.fillStyle = '#ffd23d'; g.fillRect(sx - 2, sz - 9, 4, 18);
}
function drawMini() {
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.drawImage(mapImg, 0, 0);
  if (ghost.root.visible) { mctx.fillStyle = 'rgba(127,232,255,.7)'; mctx.beginPath(); mctx.arc(mx(ghost.x), mz(ghost.z), 6, 0, 7); mctx.fill(); }
  for (const r of racers) {
    if (r.isPlayer) continue;
    mctx.fillStyle = r.color; mctx.strokeStyle = '#000'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(mx(r.car.x), mz(r.car.z), 6, 0, 7); mctx.fill(); mctx.stroke();
  }
  const c = player.car;
  mctx.save(); mctx.translate(mx(c.x), mz(c.z)); mctx.rotate(-c.h + Math.PI);
  mctx.fillStyle = PLAYER_COLOR; mctx.shadowColor = PLAYER_COLOR; mctx.shadowBlur = 12;
  mctx.beginPath(); mctx.moveTo(0, -12); mctx.lineTo(8, 9); mctx.lineTo(0, 4); mctx.lineTo(-8, 9); mctx.closePath(); mctx.fill();
  mctx.restore();
}

let hudT = 0;
function updateHud(dt) {
  hudT += dt; if (hudT < 1 / 30) return; hudT = 0;
  const c = player.car;
  const kmh = Math.round(Math.abs(c.forwardSpeed) * 3.6);
  $('spd').textContent = kmh;
  $('gear').textContent = c.gearInfo().gear;
  $('arc').setAttribute('d', arcPath(kmh / 300));
  const running = state === 'race' || state === 'paused' || state === 'finished';
  const curLap = running && (player.lapsDone >= 0 || mode === 'trial') ? raceTime - player.lapStart : 0;
  $('tcur').textContent = fmt(state === 'finished' ? player.lastLap : curLap);
  $('tlast').textContent = fmt(player.lastLap);
  $('tbest').textContent = fmt(mode === 'race' ? player.bestLap : best);
  if (mode === 'race') {
    $('lapn').textContent = `第 ${Math.min(LAPS, Math.max(1, player.lapsDone + 1))} / ${LAPS} 圈`;
    const pos = standings().indexOf(player) + 1;
    $('posn').textContent = pos; $('post').textContent = `/${racers.length}`;
    $('total').textContent = fmt(running ? (player.finished ? player.finishTime : raceTime) : 0);
  } else $('lapn').textContent = `第 ${player.lapsDone + 1} 圈`;
  [...$('bottles').children].forEach((b, k) => b.classList.toggle('on', k < c.bottles));
  $('nbar').firstElementChild.style.width = c.nitro + '%';
  $('fx').style.opacity = c.boosting ? 1 : c.mini ? 0.5 : 0;
  drawMini();
}

// floating name tags over nearby rivals
const tmpV = new THREE.Vector3();
function updateLabels() {
  for (const r of [...rivals, ...(typeof remotePool === 'undefined' ? [] : remotePool)]) {
    const vis = (mode === 'race' || mp) && state !== 'title' && r.car.root.visible && racers.includes(r);
    if (!vis) { r.label.hidden = true; continue; }
    tmpV.set(r.car.rx, r.car.ry + 2.3, r.car.rz);
    const dist = tmpV.distanceTo(camera.position);
    tmpV.project(camera);
    if (tmpV.z > 1 || dist > 90 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) { r.label.hidden = true; continue; }
    r.label.hidden = false;
    r.label.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * VW}px, ${(-tmpV.y * 0.5 + 0.5) * VH}px) translate(-50%,-100%) scale(${Math.max(0.6, 1.2 - dist / 90)})`;
    r.label.style.borderColor = r.color;
  }
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const car = player.car;
  const fx = Math.sin(car.rh), fz = Math.cos(car.rh);
  const cx = car.rx, cy = car.ry, cz = car.rz;
  const sp = car.speed;
  // during a drift the camera swings toward the velocity so you see the car's slide angle
  let dx = fx, dz = fz;
  if (sp > 3) { const vx = car.vx / sp, vz = car.vz / sp; const w = car.drifting ? 0.55 : 0.2; dx = fx * (1 - w) + vx * w; dz = fz * (1 - w) + vz * w; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
  car.setCockpit(camMode === 2 && state !== 'title' && !fallCam);
  if (fallCam) { camera.position.copy(fallCam); camera.lookAt(car.rx, car.ry, car.rz); return; }
  airCam += ((track.layered && car.air && car.airT > 0.3 ? 1 : 0) - airCam) * Math.min(1, dt * 3);
  // the glossy hood fills the lower view from the driver's seat; keep it from blooming into a haze
  bloomPass.strength = camMode === 2 ? BLOOM * 0.35 : BLOOM;
  if (camMode === 2) {
    // driver's eye: left seat, just under the roof, riding with the body's pitch and roll
    car.root.updateMatrixWorld(true);
    camPos.set(0.38, 1.25, -0.36).applyMatrix4(car.body.matrixWorld);
    camLook.set(0.38, 0.55, 25).applyMatrix4(car.body.matrixWorld);
  } else if (camMode === 3) {
    camPos.set(cx + fx * 0.6, cy + 1.25, cz + fz * 0.6);
    camLook.set(cx + fx * 20, cy + 1.0 + car.rslope * 20, cz + fz * 20);
  } else {
    const dist = (camMode === 0 ? 7.2 : 11) + airCam * 7, hgt = (camMode === 0 ? 2.5 : 3.8) + airCam * 4;   // pull back and up on big jumps
    const back = dist + sp * 0.025;
    const want = new THREE.Vector3(cx - dx * back, cy + hgt - car.rslope * back * 0.6, cz - dz * back);
    const look = new THREE.Vector3(cx + fx * 4, cy + 0.9 + car.rslope * 4, cz + fz * 4);
    if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
    camPos.lerp(want, 1 - Math.exp(-dt * 7));
    camLook.lerp(look, 1 - Math.exp(-dt * 10));
    // keep the chase camera inside the road corridor so it never ends up inside a rock face or wall
    const q = track.nearest(camPos.x, camPos.z, car.trackI ?? -1), lim = (q.lim != null ? q.lim + 1.05 : track.edge) + 0.5;
    if (Math.abs(q.off) > lim) { const k = q.off - Math.sign(q.off) * lim; camPos.x -= (q.nx ?? track.nx[q.i]) * k; camPos.z -= (q.nz ?? track.nz[q.i]) * k; }
    camPos.y = Math.max(camPos.y, (track.layered ? car.ry : track.py[q.i]) + 1.2);
  }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 2.2); }
  if (car.boosting) { camera.position.x += (Math.random() - 0.5) * 0.06; camera.position.y += (Math.random() - 0.5) * 0.04; }
  camera.lookAt(camLook);
  // cockpit gets a wider base angle (you're sitting low behind the dash) and a gentler speed widening
  const fov = camMode === 2
    ? 74 + Math.min(sp, 85) * 0.12 + (car.boosting ? 6 : car.mini ? 3 : 0)
    : 60 + Math.min(sp, 85) * 0.22 + (car.boosting ? 9 : car.mini ? 4 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ---------- loop ----------
const clock = new THREE.Clock();
let acc = 0, frames = 0, fpsT = 0, fpsLow = 0;
const STEP = 1 / 120;
let todV = 0.15, lastDraw = 0, booted = false, warned30 = false, timeScale = 1, fallCam = null, airCam = 0, gustT = 6, gust = 0, gustDir = 1;
let autoDegrade = store.get('nr-autodeg') ?? true;
function frame(now) {
  requestAnimationFrame(frame);
  // phones: cap at 60 fps — 120 Hz screens would otherwise draw twice as much for no gameplay gain
  // skip only the in-between frames of a 120 Hz screen (8.3 ms apart). The old 15.5 ms threshold also
  // dropped ordinary 60 Hz frames that arrived a little early, halving the frame rate and triggering auto-degrade.
  if (TOUCH && now && now - lastDraw < 11) return;
  lastDraw = now || 0;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  netFrame(dt);
  if (state === 'countdown') {
    if (!mp) countT += dt;
    const n = Math.floor(countT), c = $('count');
    if (countT < 3) {
      if (c.textContent !== String(3 - n)) { c.textContent = String(3 - n); sound.beep(false); }
      track.setStartLights(Math.min(5, Math.floor(countT * 5 / 3) + 1), false);
    } else {
      state = 'race'; c.textContent = 'GO!'; sound.beep(true); track.setStartLights(5, true);
      raceTime = 0; racers.forEach(r => { r.lapStart = 0; });
      setTimeout(() => { if (c.textContent === 'GO!') c.textContent = ''; }, 800);
    }
  }

  if (state === 'race' || state === 'finished') {
    const inp = state === 'race' ? readInput() : idle;
    // slow motion while the player is in the air over a big jump (single player only)
    const pc = player.car, big = track.layered && pc.air && pc.airT > 0.15 && track.bigAir[pc.trackI] && !pc.fell;
    timeScale += ((big && !mp ? 0.45 : 1) - timeScale) * Math.min(1, dt * (big ? 6 : 3));
    acc += dt * timeScale;
    while (acc >= STEP) { stepRace(STEP, inp); acc -= STEP; }
    // the player fell: watch the car drop for a moment, fade to black, put it back before the jump
    if (pc.fell) {
      if (!fallCam) { fallCam = camera.position.clone(); flash('掉下去了！', '#ff3d7f'); }
      const f = player.fallT || 0;
      $('fade').style.opacity = String(Math.max(0, Math.min(1, (f - 1.0) / 0.35)));
      if (f > 1.45) { resetToTrack(player); player.fallT = 0; fallCam = null; camInit = false; }
    } else if (!fallCam) $('fade').style.opacity = String(Math.max(0, Number($('fade').style.opacity || 0) - dt * 3));
  } else acc = 0;

  if (state === 'finished') {
    finishedT += dt;
    if (finishedT > 2.5) { if ($('results').hidden) { showResults(); $('results').hidden = false; $('hud').classList.add('dim'); $('touch').hidden = true; } }
    if (!$('results').hidden && Math.floor(finishedT * 4) !== Math.floor((finishedT - dt) * 4)) showResults();
  } else $('hud').classList.remove('dim');

  const alpha = state === 'race' || state === 'finished' ? acc / STEP : 1;
  for (const r of racers) {
    const c = r.car;
    c.sync(alpha);
    if (!r.isPlayer) c.root.visible = state === 'title' || Math.hypot(c.rx - camera.position.x, c.rz - camera.position.z) > 3.2;
    const near = r.isPlayer || Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 90;
    const sliding = c.drifting || (c.braking && c.speed > 18);
    c.rearWheels().forEach(([x, z], w) => {
      r.skids.add(w, x, z, sliding, c.y);
      if (near && c.drifting && Math.random() < (r.isPlayer ? 0.55 : 0.3) * GFX.smoke) smoke.emit(x, c.y + 0.3, z, c.vx, c.vz, Math.min(1, c.slip / 8));
    });
    if (c.impact > 6 && near) for (let k = 0; k < 6; k++) smoke.emit(c.x, c.y + 0.6, c.z, 0, 0, 0.7);
    r.skids.update();
  }
  updateGhost(dt);
  { const c = player.car; beam.pos.value.set(c.rx + Math.sin(c.rh) * 1.6, c.ry, c.rz + Math.cos(c.rh) * 1.6); beam.dir.value.set(Math.sin(c.rh), Math.cos(c.rh)); }
  if (sun) {
    // follow the player, snapped to whole shadow-map texels in light space so shadow edges don't crawl
    const c = player.car, texel = 150 / sun.shadow.mapSize.x;
    const ld = sunDir.clone(); if (ld.y < 0.12) { ld.y = 0.12; ld.normalize(); }   // once the sun has set, keep the (dim) light coming from above
    const f = ld.clone().negate(), rgt = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), f).normalize(), up = new THREE.Vector3().crossVectors(f, rgt);
    const p = new THREE.Vector3(c.rx, c.ry, c.rz);
    const a = Math.round(p.dot(rgt) / texel) * texel, b = Math.round(p.dot(up) / texel) * texel, d = p.dot(f);
    p.copy(rgt).multiplyScalar(a).addScaledVector(up, b).addScaledVector(f, d);
    sun.target.position.copy(p); sun.position.copy(p).addScaledVector(ld, 800);
  }
  smoke.update(dt, pixelRatio);
  rain.update(dt, camera.position.x, camera.position.z, player.car.vx, player.car.vz, camera.position.y);

  if (state === 'title') {
    player.car.setCockpit(false);   // the showcase always shows the whole car, whatever view you raced in
    const c = player.car, a = t * 0.15;
    if (MAP.style === 'ancient') {
      // slow crane shot over the lantern-lit city towards the pagoda and the fireworks
      const k = t * 0.04;
      camera.position.set(-95 + Math.sin(k) * 35, 42 + Math.sin(t * 0.07) * 4, -300 + Math.cos(k) * 20);
      camera.lookAt(10, 30, -450);
      camera.fov = 58; camera.updateProjectionMatrix();
    } else {
      camera.position.set(c.x + Math.sin(a) * 8, c.y + 2.4 + Math.sin(t * 0.3) * 0.4, c.z + Math.cos(a) * 8);
      camera.lookAt(c.x, c.y + 0.8, c.z);
      camera.fov = 50; camera.updateProjectionMatrix();
    }
  } else updateCamera(dt);

  sound.update(player.car, player.car.gearInfo().rpm, state === 'race' && down('KeyW', 'ArrowUp'), rain.visible, skyScene ? 2.2 + gust * 3 : 1);
  sound.setTunnel(state !== 'title' && track.inGallery(player.car.trackI ?? -1));
  if (state !== 'title') updateHud(dt);
  updateLabels();
  if (city.userData.roofLights) city.userData.roofLights.visible = Math.sin(t * 3) > 0;
  if (coastScene) coastScene.update(t);
  if (metroScene) metroScene.update(t);
  if (iceScene) { iceScene.update(t, dt, camera); iceScene.sky.material.uniforms.time.value = t; }
  if (reefScene) { reefScene.update(t, dt, camera); track.beat.value = 0.45 + 0.25 * Math.sin(t * 1.4); drawSpeedLines(dt); }
  if (canyonScene) {
    canyonScene.update(t, dt, state === 'title' ? null : player.car);
    canyonScene.sky.material.uniforms.time.value = t;
    // a trail of dust off the back wheels on the sand-blown road
    const c = player.car;
    if ((state === 'race' || state === 'finished') && !c.air && c.speed > 12 && Math.random() < 0.08 * GFX.smoke) smoke.emit(c.x - Math.sin(c.h) * 2.4, c.y + 0.15, c.z - Math.cos(c.h) * 2.4, c.vx * 0.5, c.vz * 0.5, 0.25);
    drawSpeedLines(dt);
  }
  if (skyScene) {
    skyScene.update(t, dt);
    // time of day follows race progress (laps), so it's the same however fast you drive
    const prog = state === 'title' ? 0.15 : mode === 'race' || mp ? Math.max(0, (player.lapsDone + Math.max(0, lapDist(player)) / track.N) / LAPS) : (raceTime % 240) / 180;
    todV += (Math.min(1, prog) - todV) * Math.min(1, dt * 0.8);
    applyTimeOfDay(todV);
    // gusts of crosswind up high on exposed stretches
    gustT -= dt;
    if (gustT <= 0) { gust = 1; gustT = 7 + Math.random() * 8; gustDir = Math.random() < 0.5 ? -1 : 1; }
    gust = Math.max(0, gust - dt * 0.6);
    if (state === 'race' && gust > 0 && track.exposed[player.car.trackI] && !player.car.air) {
      const i = player.car.trackI, f = gust * gustDir * 4.5 * dt;
      player.car.vx += track.nx[i] * f; player.car.vz += track.nz[i] * f;
      if (gust > 0.97) flash('侧风！', '#9fd8ff');
    }
    drawSpeedLines(dt);
  }
  if (dreamScene) {
    dreamScene.update(t);
    sound.musicTick();
    // the neon pulses with the kick drum; a slow heartbeat if there's no music yet
    track.beat.value = sound.mus ? sound.beat() : Math.pow(Math.max(0, Math.sin(t * Math.PI * 0.9)), 6);
    drawSpeedLines(dt);
  }
  if (deepScene) {
    const s = (state === 'title' ? 0 : player.car.trackI ?? 0) * track.step;
    const L = deepScene.update(t, dt, camera, s), C = deepScene.cur;
    if (L.event && state !== 'title') {
      // the big crossings: a flash of the new world's colour and a sound
      const col = { splash: 'rgba(170,235,255,1)', breach: 'rgba(200,170,255,1)', portal: 'rgba(255,255,255,1)' }[L.event];
      const f = $('flashfx'); f.style.transition = 'none'; f.style.background = col; f.style.opacity = L.event === 'portal' ? '0.95' : '0.7';
      void f.offsetWidth; f.style.transition = 'opacity 0.9s ease-out'; f.style.opacity = '0';
      sound.swoosh(L.event === 'splash' ? 'splash' : 'whoosh'); shake = Math.max(shake, 0.25);
    }
    scene.fog.color.copy(C.fog); scene.fog.density = L.dens;
    deepHemi.color.copy(C.hemiS); deepHemi.groundColor.copy(C.hemiG); deepHemi.intensity = L.hemiI;
    deepKey.color.copy(C.key); deepKey.intensity = L.keyI;
    deepKey.target.position.set(player.car.x, player.car.y, player.car.z); deepKey.position.copy(deepKey.target.position).addScaledVector(C.sun, 500);
    renderer.toneMappingExposure = L.exp;
    sound.musicMood(L.zone);
    sound.musicTick();
    track.beat.value = sound.mus ? sound.beat() : Math.pow(Math.max(0, Math.sin(t * Math.PI * 0.9)), 6);
    drawSpeedLines(dt);
  }
  if (ancientScene) {
    ancientScene.update(t, dt, camera);
    // lion-dance drums: 咚 咚 锵 · 咚 嗒 锵 · … with a gong every few bars, loud only near the start plaza
    {
      const L = ancientScene.lionSpot, d = camera.position.distanceTo(L), vol = Math.max(0, 1 - d / 160);
      beatT -= dt;
      if (beatT <= 0) {
        beatT += 0.2;
        const PAT = ['dong', 'dong', 'qiang', '', 'dong', 'ka', 'qiang', '', 'dong', 'dong', 'qiang', 'dong', 'ka', 'dong', 'qiang', 'luo'];
        const kind = PAT[beatN % PAT.length]; beatN++;
        if (kind && vol > 0.03) {
          const v = new THREE.Vector3().subVectors(L, camera.position).normalize(), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          sound.drum(kind, vol * vol, Math.max(-0.8, Math.min(0.8, v.dot(right))));
        }
      }
    }
    // a string of firecrackers somewhere in the city every so often
    crackT -= dt; if (crackT <= 0) { crackT = 7 + Math.random() * 12; sound.firecrackers(0.15 + Math.random() * 0.5); }
    // fireworks briefly tint the whole scene
    const f = ancientScene.flash;
    ancientHemi.intensity = 0.75 + f.k * 1.6; ancientHemi.color.setRGB(0.29 + f.color.r * f.k, 0.31 + f.color.g * f.k, 0.53 + f.color.b * f.k);
  }

  if (useBloom) composer.render(); else renderer.render(scene, camera);
  if (!booted) { booted = true; $('boot').hidden = true; }

  // adaptive quality: first lower the resolution, then drop bloom, then shadows, if we can't hold ~40–45 fps
  frames++; fpsT += dt;
  if (fpsT > 2) {
    const fps = frames / fpsT; frames = 0; fpsT = 0;
    // iOS Low Power Mode pins the browser at 30 fps; lowering quality can't help there, so leave it alone
    const capped30 = fps > 27 && fps < 33;
    if (capped30 && state === 'race' && !warned30) { warned30 = true; flash('帧数被系统限制在 30（可能开了低电量模式）'); }
    if (autoDegrade && fps < 40 && !capped30 && state === 'race') {
      fpsLow++;
      if (fpsLow >= 3) {
        fpsLow = 0;
        if (pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.2); renderer.setPixelRatio(pixelRatio); resize(); }
        else if (useBloom && fps < 40) { useBloom = false; flash('画面已自动调低，保持流畅'); }
        else if (sun && sun.castShadow && fps < 40) { sun.castShadow = false; flash('已关闭阴影，保持流畅'); }
      }
    } else fpsLow = 0;
    $('perf').textContent = `${Math.round(fps)} FPS · 渲染倍率 ${pixelRatio.toFixed(2)}`;
  }
}

// test hook: fast-forward the race without rendering. `inp` is a player input object or (car, track) => input.
function sim(seconds, inp) {
  if (state === 'title' || state === 'countdown') {
    $('title').hidden = true; $('hud').hidden = false; $('count').textContent = '';
    if (state === 'title') setupGrid();
    state = 'race'; raceTime = 0; racers.forEach(r => { r.lapStart = 0; });
  }
  for (let k = 0; k < seconds / STEP && (state === 'race' || state === 'finished'); k++) {
    const i = typeof inp === 'function' ? inp(player.car, track) : { ...inp };
    stepRace(STEP, i);
    if (k % 2 === 0) for (const r of racers) r.car.rearWheels().forEach(([x, z], w) => r.skids.add(w, x, z, r.car.drifting, r.car.y));
  }
  if (state === 'finished') finishedT = 3;
  camInit = false;
  return {
    state, raceTime: +raceTime.toFixed(2),
    standings: standings().map(r => ({ n: r.name, laps: r.lapsDone, best: r.bestLap && +r.bestLap.toFixed(2), fin: r.finishTime && +r.finishTime.toFixed(2) })),
    player: { kmh: Math.round(player.car.speed * 3.6), laps: player.lapsDone, last: player.lastLap },
  };
}
window.__RC = THREE.Raycaster; window.__V3 = THREE.Vector3;
window.__game = { deep: () => deepScene, setTod: v => { todV = v; applyTimeOfDay(v); }, renderer, ancient: () => ancientScene, gfx: () => ({ gfxId, pixelRatio, useBloom, shadows: !!(sun && sun.castShadow) }), touchState: () => touch, readInput, player, rivals, track, line, camera, ghostTick: updateGhost, state: () => state, setMode: m => { mode = m; setupGrid(); refreshTitle(); }, start: startRace, keys, sim };

// ---------- multiplayer ----------
// Each client simulates its own car (the host also simulates the AI cars) and streams poses at 15 Hz;
// other cars are drawn ~120 ms in the past, interpolated between received poses. No car-to-car contact online.
const net = new Net();
let room = null;        // last lobby state from the server
let mp = null;          // { at, isHost, host, remotes: Map(id → racer), ai: [racers] } during an online race
let lobbyAi = store.get('nr-mp-ai') ?? 2, lobbyDiff = store.get('nr-mp-diff') || 'normal', lobbyMod = !!store.get('nr-mp-mod');
let sendT = 0;
// human opponents get colours no AI car uses (AI: blue, white, black, yellow, green)
const HUMAN_PAINTS = [[0x8a2be2, '#b77cff', 'rgba(170,90,255,.9)'], [0x00b8c4, '#3fe0ea', 'rgba(40,230,240,.9)'], [0xff5a1f, '#ff8a5c', 'rgba(255,120,60,.9)'], [0xff3fa4, '#ff7ac0', 'rgba(255,90,180,.9)']];
const remotePool = HUMAN_PAINTS.map(([paint, ui, glow]) => {
  const r = makeRacer(new Car(scene, { paint, lights: false, glow }), '', false, ui);
  r.skids = new Skids(scene, 600); r.car.root.visible = false; r.remote = true;
  if (MAP.style !== 'city') r.car.glowMesh.material.opacity *= MAP.style === 'coast' ? 0.25 : 0.6;
  r.label = document.createElement('div'); r.label.className = 'tag'; $('labels').append(r.label); r.label.hidden = true;
  if (sun) r.car.root.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  return r;
});

const ERRS = { nosuch: '没有这个房间，检查一下房间码。', full: '房间满了（最多 5 人）。', started: '这个房间正在比赛，等这一局结束再加入。', network: '连不上联机服务器，检查网络后再试。' };
function lobbyView(v) {
  $('lobby').hidden = !v;
  $('lobbyJoin').hidden = v !== 'join';
  $('lobbyRoom').hidden = v !== 'room';
  $('leaveroom').textContent = v === 'room' ? '离开房间' : '返回';
}
function openLobby(prefill) {
  sound.init();
  $('pname').value = store.get('nr-name') || '';
  if (prefill) $('joincode').value = prefill;
  $('lobbyErr').textContent = '';
  lobbyView(room ? 'room' : 'join');
}
async function joinRoom(code, create) {
  code = cleanCode(code);
  if (code.length < 4) { $('lobbyErr').textContent = '房间码是 4 位字母或数字。'; return; }
  const name = ($('pname').value || '').trim() || '玩家';
  store.set('nr-name', name);
  $('lobbyErr').textContent = '连接中…';
  try {
    const r = await net.connect(code, { name, create, cfg: { map: mapId, ai: lobbyAi, diff: lobbyDiff, mod: lobbyMod } });
    room = { ...r, code };
    $('lobbyErr').textContent = '';
    onRoom(r);
  } catch (e) { $('lobbyErr').textContent = ERRS[e] || ERRS.network; }
}
function inviteText() { return `来玩赛车！打开 https://night-racer.pages.dev/#${room.code} ，点「联机」就能加入，房间码 ${room.code}`; }

function onRoom(r) {
  room = { ...room, ...r };
  // a joiner whose page has a different map loaded switches to the room's map and rejoins
  if (r.cfg && r.cfg.map !== mapId) {
    try { sessionStorage.setItem('nr-join', room.code); } catch {}
    store.set('nr-map', r.cfg.map); net.close();
    $('loading').hidden = false; setTimeout(() => location.reload(), 30);
    return;
  }
  if (mp && !r.started) endOnline();     // host brought everyone back to the room
  if (mp) return;
  renderRoom();
  lobbyView('room');
}
function renderRoom() {
  const isHost = room.host === room.you;
  $('roomcode').textContent = room.code;
  $('roominfo').textContent = `地图：${MAP.name} · ${LAPS} 圈 · 玩家之间不碰撞`;
  const ul = $('plist'); ul.replaceChildren();
  room.players.forEach((p, k) => {
    const li = document.createElement('li');
    li.style.setProperty('--c', p.id === room.you ? PLAYER_COLOR : HUMAN_PAINTS[k % HUMAN_PAINTS.length][1]);
    li.append(p.name);
    if (p.id === room.host) { const h = document.createElement('span'); h.className = 'tagh'; h.textContent = '房主'; li.append(h); }
    if (p.id === room.you) { const m = document.createElement('span'); m.className = 'me'; m.textContent = '（你）'; li.append(m); }
    ul.append(li);
  });
  $('hostctl').style.display = isHost ? '' : 'none';
  $('mpstart').hidden = !isHost; $('waitnote').hidden = isHost;
  $('waitnote').textContent = '等房主开始…';
  document.querySelectorAll('[data-ai]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.ai) === room.cfg.ai)));
  document.querySelectorAll('[data-mpdiff]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mpdiff === room.cfg.diff)));
  document.querySelectorAll('[data-mpmod]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mpmod === (room.cfg.mod ? '1' : '0'))));
}
function leaveRoom() {
  net.close(); room = null;
  if (mp) endOnline();
  lobbyView(null);
  if (state !== 'title') toTitle();
}

function packCar(r) {
  const c = r.car, f = (c.drifting ? 1 : 0) | (c.boosting || c.mini ? 2 : 0) | (c.braking ? 4 : 0);
  const q = v => Math.round(v * 100) / 100;
  return [q(c.x), q(c.z), q(c.y), Math.round(c.h * 1000) / 1000, q(c.speed), f, r.lapsDone, lapDist(r), r.finished ? q(r.finishTime) : 0];
}
function takePose(r, m) {
  const last = r.buf[r.buf.length - 1];
  if (last && m.ts <= last.ts) return;            // out of order / duplicate
  r.buf.push({ ts: m.ts, d: m.d });
  if (r.buf.length > 60) r.buf.shift();
  // map the sender's timeline onto ours: rise fast on early packets, sink slowly; track jitter
  const o = m.ts - performance.now();
  if (r.off == null) { r.off = o; r.jit = 40; r.late = []; }
  else {
    r.off += (o - r.off) * (o > r.off ? 0.3 : 0.01);
    // how late this packet was compared with the fastest recent ones; the 95th percentile sets the cushion
    r.late.push(Math.max(0, r.off - o)); if (r.late.length > 40) r.late.shift();
    const s = [...r.late].sort((x, y) => x - y);
    r.jit = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  }
  r.net = { lapsDone: m.d[6], lapDist: m.d[7] };
  if (m.d[8] && !r.finished) { r.finished = true; r.finishTime = m.d[8]; }
}
function onStart(m) {
  lobbyView(null);
  const others = m.order.filter(id => id !== room.you);
  const isHost = m.host === room.you;
  mp = { at: m.at, host: m.host, isHost, remotes: new Map(), ai: [], mod: !!m.cfg.mod };
  resetRun(); lastPay = null;
  // online: the room decides whether upgraded cars are allowed
  player.car.stats = mp.mod ? profile.statsOf() : { ...STD };
  rivals.forEach(r => { r.car.stats = { ...player.car.stats }; });
  mode = 'race';
  const humans = [];
  for (const id of m.order) {
    if (id === room.you) { humans.push(player); continue; }
    const r = remotePool[others.indexOf(id) % remotePool.length];
    r.name = (room.players.find(p => p.id === id) || {}).name || '玩家';
    r.label.textContent = r.name; r.buf = []; r.net = null; r.off = null; r.pt = null; r.drawn = false;
    r.netId = id; r.touchAt = 0; r.bumpSent = 0;
    mp.remotes.set(id, r); humans.push(r);
  }
  const ai = rivals.slice(0, m.cfg.ai);
  mp.ai = ai;
  rivals.forEach(r => { r.car.root.visible = false; r.label.hidden = true; r.remote = false; });
  // AI fills the front of the grid, humans line up behind in join order
  racers = [...ai, ...humans];
  racers.forEach((r, k) => {
    const row = Math.floor(k / 2), side = k % 2 ? 3.3 : -3.3;
    resetRacer(r, track.wrap(-5 - row * 8 - (k % 2) * 3), side, -1, true);
    r.car.root.visible = true;
    if (r.ai) { r.remote = !isHost; r.ai.skill = r.spec.skill * DIFF[diffOf(m.cfg.diff)]; r.ai.relaxed = m.cfg.diff !== 'hard'; r.ai.avoid = 0; r.ai.stuckT = 0; r.ai.rubber = 0; r.buf = []; r.net = null; r.off = null; r.pt = null; r.drawn = false; }
  });
  player.car.bottles = 1; playerAuto = null; ghost.root.visible = false;
  sound.init();
  $('title').hidden = true; $('results').hidden = true; $('pause').hidden = true; $('hud').hidden = false; $('volume').hidden = true;
  document.body.dataset.mode = 'race';
  raceTime = 0; ghostRec = []; recT = 0; sendT = 0;
  state = 'countdown'; countT = 0; camInit = false;
  keys.clear(); $('touch').hidden = false;
}
function endOnline() {
  for (const r of remotePool) { r.car.root.visible = false; r.label.hidden = true; }
  rivals.forEach(r => { r.remote = false; r.car.stats = myStats(); });
  mp = null; player.car.stats = myStats();
  player.car.setCockpit(false);
  $('results').hidden = true; $('hud').hidden = true; $('touch').hidden = true; $('pause').hidden = true;
  state = 'title'; setupGrid();
  if (room) { $('title').hidden = false; refreshTitle(); renderRoom(); lobbyView('room'); }
}
net.on('room', onRoom).on('start', onStart)
  .on('bump', m => {
    // someone drove into us on their screen: take the shove (unless we already resolved that contact ourselves)
    if (!mp || !room || m.to !== room.you || state !== 'race') return;
    const r = mp.remotes.get(m.id); if (r && performance.now() - (r.touchAt || 0) < 200) return;
    const c = player.car, j = Math.max(0, Math.min(25, m.j)) * 0.85;
    c.vx += m.nx * j; c.vz += m.nz * j; c.x += m.nx * 0.35; c.z += m.nz * 0.35;
    shake = Math.max(shake, Math.min(0.35, j * 0.05)); sound.hit(j * 1.2);
  })
  .on('s', m => { const r = mp && mp.remotes.get(m.id); if (r) takePose(r, m); })
  .on('ai', m => { if (mp && !mp.isHost) m.d.forEach((d, k) => { const r = mp.ai[k]; if (r) takePose(r, { ts: m.ts, d }); }); })
  .on('left', m => {
    if (!mp) return;
    const r = mp.remotes.get(m.id);
    if (r) { r.car.root.visible = false; r.label.hidden = true; racers = racers.filter(x => x !== r); mp.remotes.delete(m.id); flash(`${r.name} 离开了`, '#ffd23d'); }
    if (m.id === mp.host) { for (const a of mp.ai) { a.car.root.visible = false; a.label.hidden = true; } racers = racers.filter(x => !mp.ai.includes(x)); mp.ai = []; mp.host = m.host; mp.isHost = m.host === room?.you; }
  })
  .on('disconnect', () => {
    if (mp) flash('联机断开了，继续单人跑完这一局', '#ff3d7f');
    else if (room) { room = null; openLobby(); lobbyView('join'); $('lobbyErr').textContent = '和服务器的连接断开了。'; }
    room = null;
  });

// per frame: countdown on the shared clock, stream our pose, draw everyone else interpolated
function netFrame(dt) {
  if (!mp) return;
  if (state === 'countdown') countT = Math.max(0, 3 - (mp.at - net.now()) / 1000);
  if (state === 'race' || state === 'finished' || state === 'paused') {
    sendT += dt;
    if (sendT >= 1 / 20) {
      sendT = 0;
      const ts = net.now();
      net.send({ t: 's', ts, d: packCar(player) });
      if (mp.isHost && mp.ai.length) net.send({ t: 'ai', ts, d: mp.ai.map(packCar) });
    }
  }
  for (const r of racers) if (r.remote) drawRemote(r, dt);
}
// where a remote car most likely is right now (latest pose moved on by its speed) — used for contact
function predictNow(r) {
  const L = r.buf[r.buf.length - 1]; if (!L || r.off == null) return null;
  const ahead = Math.max(0, Math.min(0.5, (performance.now() + r.off - L.ts) / 1000 + 0.05));
  const h = L.d[3], v = L.d[4];
  return { x: L.d[0] + Math.sin(h) * v * ahead, z: L.d[1] + Math.cos(h) * v * ahead, h, vx: Math.sin(h) * v, vz: Math.cos(h) * v };
}
function drawRemote(r, dt) {
  const b = r.buf, c = r.car;
  if (!b || !b.length || r.off == null) return;
  // play back a little behind the newest data; the cushion grows with this player's network jitter
  const delay = Math.max(90, Math.min(450, 70 + r.jit));
  // the playback clock runs at normal speed and drifts gently toward its target, so changes in the
  // network estimate never make the car speed up or stall
  const target = performance.now() + r.off - delay;
  if (r.pt == null || Math.abs(target - r.pt) > 600) r.pt = target;
  else { r.pt += dt * 1000; r.pt += (target - r.pt) * Math.min(1, dt * 1.5); }
  const t = r.pt;
  while (b.length > 2 && b[1].ts <= t) b.shift();
  const a = b[0], n = b[1] || b[0];
  let tx, tz, ty, th;
  if (t <= n.ts && n.ts > a.ts) {
    const u = Math.max(0, (t - a.ts) / (n.ts - a.ts));
    let dh = n.d[3] - a.d[3]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    tx = a.d[0] + (n.d[0] - a.d[0]) * u; tz = a.d[1] + (n.d[1] - a.d[1]) * u; ty = a.d[2] + (n.d[2] - a.d[2]) * u; th = a.d[3] + dh * u;
  } else {
    // ran out of data: keep moving along the last heading for a short while
    const e = Math.min(0.3, Math.max(0, (t - n.ts) / 1000));
    th = n.d[3]; tx = n.d[0] + Math.sin(th) * n.d[4] * e; tz = n.d[1] + Math.cos(th) * n.d[4] * e; ty = n.d[2];
  }
  // ease toward the target instead of jumping (snap only after a reset / long gap)
  if (!r.drawn || Math.hypot(tx - c.x, tz - c.z) > 10) { c.x = tx; c.z = tz; c.y = ty; c.h = th; r.drawn = true; }
  else {
    const k = 1 - Math.exp(-dt * 18);
    let dh = th - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    c.x += (tx - c.x) * k; c.z += (tz - c.z) * k; c.y += (ty - c.y) * k; c.h += dh * k;
  }
  const fl = n.d[5];
  c.drifting = !!(fl & 1); c.boosting = !!(fl & 2); c.mini = false; c.braking = !!(fl & 4); c.slip = c.drifting ? 8 : 0;
  c.vx = Math.sin(c.h) * n.d[4]; c.vz = Math.cos(c.h) * n.d[4];
  const q = track.nearest(c.x, c.z, c.hint); c.hint = q.i; c.trackI = q.i;
  c.slope = track.gradeAt(q.i, c.x, c.z) * (Math.sin(c.h) * track.tx[q.i] + Math.cos(c.h) * track.tz[q.i]);
  c.spin += n.d[4] / 0.36 * dt;
  const P = c.prev; P.x = c.x; P.y = c.y; P.z = c.z; P.h = c.h; P.slope = c.slope; P.roll = c.roll; P.pitch = c.pitch; P.spin = c.spin;
}

$('mpbtn').hidden = false;
$('mpbtn').addEventListener('click', () => openLobby());
$('mkroom').addEventListener('click', () => joinRoom(newRoomCode(), true));
$('joinbtn').addEventListener('click', () => joinRoom($('joincode').value, false));
$('joincode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') joinRoom($('joincode').value, false); });
$('pname').addEventListener('keydown', e => e.stopPropagation());
$('leaveroom').addEventListener('click', () => (room ? leaveRoom() : lobbyView(null)));
$('mpstart').addEventListener('click', () => net.send({ t: 'start' }));
$('copycode').addEventListener('click', async () => {
  const text = inviteText();
  try { await navigator.clipboard.writeText(text); $('roomErr').textContent = '已复制，粘贴到微信群发给朋友。'; }
  catch { $('roomErr').textContent = text; }
});
document.querySelectorAll('[data-ai]').forEach(b => b.addEventListener('click', () => { lobbyAi = Number(b.dataset.ai); store.set('nr-mp-ai', lobbyAi); net.send({ t: 'cfg', cfg: { ai: lobbyAi } }); }));
document.querySelectorAll('[data-mpdiff]').forEach(b => b.addEventListener('click', () => { lobbyDiff = b.dataset.mpdiff; store.set('nr-mp-diff', lobbyDiff); net.send({ t: 'cfg', cfg: { diff: lobbyDiff } }); }));
document.querySelectorAll('[data-mpmod]').forEach(b => b.addEventListener('click', () => { lobbyMod = b.dataset.mpmod === '1'; store.set('nr-mp-mod', lobbyMod); net.send({ t: 'cfg', cfg: { mod: lobbyMod } }); }));
// invite links (…/#K7QX) and a rejoin after switching to the room's map open the lobby straight away
{
  let pending = null;
  try { pending = sessionStorage.getItem('nr-join'); sessionStorage.removeItem('nr-join'); } catch {}
  const fromHash = cleanCode(location.hash.slice(1));
  if (pending) { openLobby(pending); joinRoom(pending, false); }
  else if (fromHash.length >= 4) openLobby(fromHash);
}
window.__mp = { takePose, drawRemote, predictNow, collideStatic, remotePool, net, get mp() { return mp; }, get room() { return room; }, joinRoom, packCar, netFrame, standings: () => standings().map(r => r.name + (r.finished ? ':' + r.finishTime.toFixed(2) : '')), state: () => state };

// ---------- leaderboard ----------
const board = createBoard({ store, fmt, maps: MAPS });
$('lbbtn').addEventListener('click', () => board.open(mapId, group === 'mod'));
['board'].forEach(id => TOUCH && $(id).classList.add('scrollable'));
board.syncAll();
// the lobby's name field and the leaderboard name are the same name
$('pname').addEventListener('change', () => board.syncAll());

// speed lines streaking in from the screen edges at high speed / boost (天空工地 only)
const slCanvas = document.createElement('canvas'); slCanvas.id = 'speedfx'; $('app').append(slCanvas);
const slCtx = slCanvas.getContext('2d'), streaks = Array.from({ length: 60 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), v: 0.6 + Math.random() }));
function drawSpeedLines(dt) {
  const c = player.car, sp = c.speed, k = Math.max(0, Math.min(1, (sp - 42) / 30)) + (c.boosting ? 0.5 : c.mini ? 0.3 : 0);
  if (slCanvas.width !== VW) { slCanvas.width = VW; slCanvas.height = VH; }
  slCtx.clearRect(0, 0, VW, VH);
  if (state !== 'race' || k <= 0.02 || camMode === 2) return;
  const cx = VW / 2, cy = VH * 0.45, R = Math.hypot(VW, VH) / 2;
  slCtx.lineCap = 'round';
  for (const s of streaks) {
    s.r += s.v * dt * (1.2 + k * 2.5); if (s.r > 1) { s.r = 0.35 + Math.random() * 0.2; s.a = Math.random() * Math.PI * 2; }
    const r0 = R * s.r, r1 = r0 + R * 0.08 * (0.5 + k);
    slCtx.strokeStyle = `rgba(255,255,255,${(0.10 + 0.25 * k) * (s.r - 0.35)})`; slCtx.lineWidth = 1 + k * 1.5;
    slCtx.beginPath(); slCtx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); slCtx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); slCtx.stroke();
  }
}

// 天空工地 time of day. tod: 0 afternoon → 0.45 late afternoon → 0.62 golden sunset → 1 night.
const TOD = {
  sunDay: new THREE.Vector3(-0.5, 0.65, 0.57).normalize(), sunSet: new THREE.Vector3(-0.8, 0.06, 0.58).normalize(), sunDown: new THREE.Vector3(-0.8, -0.25, 0.58).normalize(),
  fogDay: new THREE.Color(0xbcd2e6), fogSet: new THREE.Color(0x8a5a5a), fogNight: new THREE.Color(0x0b0e1c),
  sunCDay: new THREE.Color(0xfff3e2), sunCSet: new THREE.Color(0xff9a5a),
  hemiDay: new THREE.Color(0xcfe4ff), hemiSet: new THREE.Color(0xc0a0c8), hemiNight: new THREE.Color(0x404a78),
};
function applyTimeOfDay(tod) {
  if (!skyScene || !skyScene.skies) return;
  const S = THREE.MathUtils.smoothstep;
  const sunset = S(tod, 0.3, 0.62), night = S(tod, 0.62, 0.95), dayA = 1 - S(tod, 0.42, 0.66);
  sunDir.copy(TOD.sunDay).lerp(TOD.sunSet, sunset).lerp(TOD.sunDown, S(tod, 0.66, 0.85)).normalize();   // the sun sinks below the horizon at nightfall
  skyScene.skies.day.material.uniforms.sun.value.copy(sunDir); skyScene.skies.day.material.uniforms.alpha.value = dayA;
  skyScene.skies.night.material.uniforms.sun.value.copy(sunDir);
  skyScene.night.value = night;
  skyScene.setDayK(dayA);
  sun.color.copy(TOD.sunCDay).lerp(TOD.sunCSet, sunset);
  sun.intensity = (3.2 - sunset * 0.8) * (1 - night * 0.88);
  skyHemi.color.copy(TOD.hemiDay).lerp(TOD.hemiSet, sunset).lerp(TOD.hemiNight, night);
  skyHemi.intensity = 1.5 - sunset * 0.5 - night * 0.55;
  scene.fog.color.copy(TOD.fogDay).lerp(TOD.fogSet, sunset).lerp(TOD.fogNight, night);
  BLOOM = 0.25 + sunset * 0.2 + night * 0.15;
  if (headPool) headPool.material.opacity = 0.45 * S(tod, 0.55, 0.85);
}

frame();
