import * as THREE from 'three';

export function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

export function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Asphalt: 512px across = 16 m, 1024px along = 32 m.
export function roadTexture() {
  return tex(canvas(512, 1024, (g, w, h) => {
    g.fillStyle = '#26282c'; g.fillRect(0, 0, w, h);
    const r = rand(7);
    for (let i = 0; i < 26000; i++) {
      const v = 20 + r() * 40;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.35 + r() * 0.4})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // tyre-worn darker lanes
    g.fillStyle = 'rgba(10,10,12,0.18)';
    for (const x of [70, 182, 330, 442]) g.fillRect(x - 22, 0, 44, h);
    const px = 32; // px per metre
    g.fillStyle = '#d9d6cc';
    g.fillRect(0.35 * px, 0, 0.18 * px, h);
    g.fillRect(w - 0.53 * px, 0, 0.18 * px, h);
    for (const lane of [4, 12]) for (let y = 0; y < h; y += 8 * px) g.fillRect(lane * px - 0.08 * px, y, 0.16 * px, 4 * px);
    g.fillStyle = '#d7a326';
    g.fillRect(8 * px - 0.32 * px, 0, 0.14 * px, h);
    g.fillRect(8 * px + 0.18 * px, 0, 0.14 * px, h);
    // cracks / patches
    g.strokeStyle = 'rgba(8,8,10,0.6)'; g.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += r() * 26; g.lineTo(x, y); }
      g.stroke();
    }
  }));
}

// Roughness map: wet sheen with puddles (dark = smooth = mirror-like).
export function puddleTexture() {
  return tex(canvas(256, 512, (g, w, h) => {
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, w, h);
    const r = rand(3);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 8 + r() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(70,70,70,0.8)'); gr.addColorStop(0.6, 'rgba(70,70,70,0.45)'); gr.addColorStop(1, 'rgba(70,70,70,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r()), r() * 3, 0, 7); g.fill();
    }
  }), { srgb: false });
}

export function curbTexture() {
  return tex(canvas(16, 128, (g, w, h) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#e8e4dc' : '#c42a22'; g.fillRect(0, i * 32, w, 32); }
  }));
}

export function concreteTexture() {
  return tex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, w, h);
    const r = rand(11);
    for (let i = 0; i < 6000; i++) { const v = 55 + r() * 40; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(20,20,20,.7)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
  }));
}

// Wall banner: u runs bottom→top of the wall, v along the track. Text drawn rotated.
export function bannerTexture() {
  const words = ['NIGHT CIRCUIT', '霓虹街区', 'TURBO', '夜行者', 'NEON', '极速', 'APEX', '城市赛'];
  const cols = ['#ff3d7f', '#2de1ff', '#ffd23d', '#9b6bff', '#3dff9e'];
  return tex(canvas(64, 2048, (g, w, h) => {
    g.fillStyle = '#bdbab2'; g.fillRect(0, 0, w, h);
    const seg = h / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = '#121218'; g.fillRect(14, i * seg + 8, 40, seg - 16);
      g.save(); g.translate(34, i * seg + seg / 2); g.rotate(Math.PI / 2);
      g.fillStyle = cols[i % cols.length]; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(words[i], 0, 0); g.restore();
    }
    g.fillStyle = '#e6e2d8'; g.fillRect(0, 0, 6, h);
  }));
}

export function fenceTexture() {
  return tex(canvas(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,205,215,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.fillStyle = 'rgba(180,185,195,1)'; g.fillRect(0, h - 3, w, 3);
  }), { srgb: false });
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  return tex(canvas(size, size, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }), { repeat: false });
}

// Building facade: 8 windows × 16 floors over 32 m × 56 m; bottom 8px row is plain wall (used for roofs).
export function windowTexture(seed) {
  const r = rand(seed);
  return tex(canvas(256, 512, (g, w, h) => {
    const wall = ['#20242d', '#262321', '#1d2430', '#2a2a2e'][seed % 4];
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const cw = w / 10, ch = (h - 8) / 16;
    const warm = ['#ffd49a', '#ffe3b8', '#ffc77a'], cool = ['#bfe3ff', '#d8ecff', '#9fd0ff'], odd = ['#ff9ad1', '#9affd8'];
    const style = r();
    for (let y = 0; y < 16; y++) {
      const floorLit = r() < 0.75;
      for (let x = 0; x < 10; x++) {
        const lit = floorLit && r() < (style < 0.3 ? 0.4 : 0.24);
        const pal = style < 0.5 ? warm : style < 0.85 ? cool : odd;
        g.fillStyle = lit ? pal[Math.floor(r() * pal.length)] : (r() < 0.5 ? '#141821' : '#10131a');
        const pad = style < 0.5 ? 5 : 3;
        g.fillRect(x * cw + pad, y * ch + pad, cw - pad * 2, ch - pad * 2.4);
        if (lit && r() < 0.4) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x * cw + pad, y * ch + pad, (cw - pad * 2) * r(), ch - pad * 2.4); }
      }
    }
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let y = 0; y < 16; y++) g.fillRect(0, y * ch + ch - 2, w, 2);
    g.fillStyle = '#0b0d12'; g.fillRect(0, h - 8, w, 8);
  }));
}

export function neonSignTexture(text, color, vertical) {
  const chars = [...text];
  const W = vertical ? 128 : 128 * Math.max(3, chars.length) * 0.9;
  const H = vertical ? 128 * chars.length + 40 : 150;
  return tex(canvas(W, H, (g, w, h) => {
    g.fillStyle = 'rgba(8,8,12,0.88)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 18;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff'; g.font = 'bold 92px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowBlur = 26;
    if (vertical) chars.forEach((ch, i) => { g.fillStyle = color; g.fillText(ch, w / 2, 20 + 128 * i + 64); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(ch, w / 2, 20 + 128 * i + 64); });
    else { g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(text, w / 2, h / 2 + 4); }
  }), { repeat: false });
}

export function checkerTexture() {
  return tex(canvas(256, 32, (g, w, h) => {
    const s = 16;
    for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * s, y * s, s, s); }
  }), { repeat: false });
}

export function gantryTexture(text = '霓虹街区  ·  START / FINISH') {
  return tex(canvas(1024, 128, (g, w, h) => {
    g.fillStyle = '#07080c'; g.fillRect(0, 0, w, h);
    let size = 76;   // shrink long (English) names to fit the board
    g.font = `bold ${size}px "PingFang SC",sans-serif`;
    while (size > 30 && g.measureText(text).width > w - 40) { size -= 2; g.font = `bold ${size}px "PingFang SC",sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#2de1ff'; g.shadowBlur = 24; g.fillStyle = '#2de1ff';
    g.fillText(text, w / 2, h / 2 + 4);
  }), { repeat: false });
}

// Mountain asphalt: `widthM` metres across at 32 px/m, 32 m per tile. Solid white edges, double yellow centre.
export function mountainRoadTexture(widthM) {
  const px = 32;
  return tex(canvas(widthM * px, 1024, (g, w, h) => {
    g.fillStyle = '#4a4b4e'; g.fillRect(0, 0, w, h);
    const r = rand(17);
    for (let i = 0; i < 22000; i++) { const v = 52 + r() * 50; g.fillStyle = `rgba(${v},${v},${v + 3},${0.3 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.fillStyle = 'rgba(25,25,28,0.22)';
    for (const x of [0.27, 0.73]) g.fillRect(w * x - 26, 0, 52, h);
    // tar seams
    g.strokeStyle = 'rgba(20,20,22,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 10; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 24; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = '#e8e4d8';
    g.fillRect(0.25 * px, 0, 0.15 * px, h); g.fillRect(w - 0.4 * px, 0, 0.15 * px, h);
    g.fillStyle = '#e0a922';
    g.fillRect(w / 2 - 0.3 * px, 0, 0.12 * px, h); g.fillRect(w / 2 + 0.18 * px, 0, 0.12 * px, h);
  }));
}

export function gravelTexture() {
  return tex(canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#6f675b'; g.fillRect(0, 0, w, h);
    const r = rand(23);
    for (let i = 0; i < 3000; i++) { const v = 70 + r() * 90; g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.85})`; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
  }));
}

export function chevronTexture(left) {
  return tex(canvas(128, 96, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd400';
    for (const x0 of [22, 62]) {
      g.beginPath();
      if (left) { g.moveTo(x0 + 30, 12); g.lineTo(x0, 48); g.lineTo(x0 + 30, 84); g.lineTo(x0 + 44, 84); g.lineTo(x0 + 14, 48); g.lineTo(x0 + 44, 12); }
      else { g.moveTo(x0 + 14, 12); g.lineTo(x0 + 44, 48); g.lineTo(x0 + 14, 84); g.lineTo(x0, 84); g.lineTo(x0 + 30, 48); g.lineTo(x0, 12); }
      g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffd400'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }), { repeat: false });
}

// ---------- 长安 (ancient city) ----------
// Bluestone slab paving: `widthM` across at 32 px/m, 32 m per tile.
export function stoneRoadTexture(widthM) {
  const px = 32;
  return tex(canvas(widthM * px, 1024, (g, w, h) => {
    const r = rand(31);
    g.fillStyle = '#3a3c40'; g.fillRect(0, 0, w, h);
    // staggered slabs, 1.6 m long, rows across the road
    const slabL = 1.6 * px, cols = Math.round(widthM / 1.2), slabW = w / cols;
    for (let y = 0, row = 0; y < h; y += slabL, row++) {
      for (let c = -1; c <= cols; c++) {
        const x = c * slabW + (row % 2 ? slabW / 2 : 0);
        const v = 58 + r() * 26;
        g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
        g.fillRect(x + 2, y + 2, slabW - 4, slabL - 4);
        // worn centre and grain
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.fillRect(x + 6, y + 6, slabW - 12, slabL - 12);
        for (let k = 0; k < 30; k++) { const t = 40 + r() * 60; g.fillStyle = `rgba(${t},${t},${t + 4},.5)`; g.fillRect(x + r() * slabW, y + r() * slabL, 2, 2); }
      }
    }
    // a carriage-rut darkening down each lane
    g.fillStyle = 'rgba(10,8,8,0.18)';
    for (const f of [0.25, 0.75]) g.fillRect(w * f - 30, 0, 60, h);
  }));
}

export function brickTexture() {
  return tex(canvas(256, 256, (g, w, h) => {
    const r = rand(41);
    g.fillStyle = '#2b2624'; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 48;
    for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = -bw; x < w + bw; x += bw) {
      const v = 70 + r() * 30;
      g.fillStyle = `rgb(${v},${v * 0.86},${v * 0.78})`;
      g.fillRect(x + (row % 2 ? bw / 2 : 0) + 1, y + 1, bw - 2, bh - 2);
    }
  }));
}

// Paper lattice windows lit from inside. One storey: dark timber frame, warm panes, cross bars.
export function latticeTexture(seed) {
  const r = rand(seed);
  return tex(canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#3a1712'; g.fillRect(0, 0, w, h);                // lacquered timber
    const bays = 4, bw = w / bays;
    for (let b = 0; b < bays; b++) {
      const lit = r() < 0.82, warm = 0.75 + r() * 0.25;
      const x0 = b * bw + 8, y0 = 18, ww = bw - 16, hh = h - 34;
      g.fillStyle = lit ? `rgb(${255 * warm},${170 * warm},${90 * warm})` : '#1c0d0a';
      g.fillRect(x0, y0, ww, hh);
      g.strokeStyle = '#4a1d14'; g.lineWidth = 3;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0 + ww * k / 4, y0); g.lineTo(x0 + ww * k / 4, y0 + hh); g.stroke(); }
      for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(x0, y0 + hh * k / 5); g.lineTo(x0 + ww, y0 + hh * k / 5); g.stroke(); }
    }
    g.fillStyle = '#6e1f16'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 12, w, 12);   // beams
  }));
}

export function bannerCharTexture(text, bg = '#a3201a', fg = '#ffe7b0') {
  const chars = [...text];
  return tex(canvas(96, 96 * chars.length + 40, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = 'bold 66px "Songti SC","STSong","SimSun","Noto Serif SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((c, i) => g.fillText(c, w / 2, 20 + 96 * i + 48));
  }), { repeat: false });
}

export function plaqueTexture(text) {
  return tex(canvas(512, 160, (g, w, h) => {
    g.fillStyle = '#1b2a4a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d4a63a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#f0c95a'; g.font = 'bold 104px "Songti SC","STSong","SimSun","Noto Serif SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  }), { repeat: false });
}

// Daytime facade with the same layout as windowTexture (10 × 16 windows, plain 8 px roof strip at the bottom):
// pale walls, glass that reflects the sky (lighter towards the top of each pane).
export function dayFacadeTexture(seed) {
  const r = rand(seed + 101);
  return tex(canvas(256, 512, (g, w, h) => {
    const walls = ['#d9d4c9', '#c9ced6', '#e2ddd2', '#b9c0c8', '#d6cfc2'];
    g.fillStyle = walls[seed % walls.length]; g.fillRect(0, 0, w, h);
    const cw = w / 10, ch = (h - 8) / 16, style = r();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) {
      const pad = style < 0.5 ? 5 : 2.5, x0 = x * cw + pad, y0 = y * ch + pad, ww = cw - pad * 2, hh = ch - pad * 2.4;
      const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
      const tint = 0.85 + r() * 0.15;
      gr.addColorStop(0, `rgb(${Math.round(150 * tint)},${Math.round(185 * tint)},${Math.round(215 * tint)})`);
      gr.addColorStop(1, `rgb(${Math.round(70 * tint)},${Math.round(92 * tint)},${Math.round(118 * tint)})`);
      g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
      if (r() < 0.12) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, y0, ww, hh * 0.3); }   // sun glint
    }
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < 16; y++) g.fillRect(0, y * ch + ch - 2, w, 2);
    g.fillStyle = '#8f8d88'; g.fillRect(0, h - 8, w, 8);
  }));
}

// 霓虹梦境 road: glossy black with a faint grid and glowing lane dashes.
export function neonRoadTexture(widthM) {
  const px = 32;
  return tex(canvas(widthM * px, 1024, (g, w, h) => {
    g.fillStyle = '#0b0614'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,80,255,0.18)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#ff4fd8'; g.shadowColor = '#ff4fd8'; g.shadowBlur = 12;
    for (let y = 0; y < h; y += 8 * px) g.fillRect(w / 2 - 0.12 * px, y, 0.24 * px, 4 * px);
  }));
}

// Forest track: packed brown dirt with two darker wheel ruts, a mossy strip between them, gravel, puddles in the ruts
// and moss creeping in from both edges. `widthM` metres across at 32 px/m, 32 m per tile (like mountainRoadTexture).
export function forestRoadTexture(widthM) {
  // neutral grey = "plain soil": the photo supplies colour and grain. Darker where the ruts and damp edges are; roots,
  // tread marks and pine needles are drawn as darker / lighter grey; grass and moss are drawn in colour (the road
  // shader keeps those colours and puts the soil photo everywhere else).
  const px = 32, W = Math.round(widthM * px), H = 1024;
  return tex(canvas(W, H, (g, w, h) => {
    const r = rand(77), img = g.createImageData(w, h), d = img.data;
    const P = new Float32Array(4096); for (let i = 0; i < 4096; i++) P[i] = r();
    const hs = (x, y) => P[(x * 73 + y * 151) & 4095];
    const vn = (x, y, px2, py2) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const X = n => ((n % px2) + px2) % px2, Y = n => ((n % py2) + py2) % py2;
      const a = hs(X(xi), Y(yi)), b = hs(X(xi + 1), Y(yi)), c = hs(X(xi), Y(yi + 1)), e = hs(X(xi + 1), Y(yi + 1)); return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x / w, fy = y / h;
      let n = 0, amp = 0.5, f = 1; for (let o = 0; o < 4; o++) { n += vn(fx * 5 * f, fy * 20 * f, 5 * f, 20 * f) * amp; amp *= 0.5; f *= 2; }
      const wob = Math.sin(fy * 6.283 * 2) * 0.02;
      const rut = Math.max(Math.exp(-((fx - 0.3 - wob) ** 2) / 0.0035), Math.exp(-((fx - 0.7 - wob) ** 2) / 0.0035));
      const edge = Math.min(fx, 1 - fx), damp = Math.max(0, 1 - edge / 0.14) * 0.55 + rut * 0.4;
      const v = 158 + (n - 0.5) * 34 - damp * 62;
      const i4 = (y * w + x) * 4; d[i4] = v; d[i4 + 1] = v; d[i4 + 2] = v; d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const c of [0.3, 0.7]) for (let y = 0; y < h; y += 4) { const x = w * c + Math.sin(y / h * 6.283 * 2) * w * 0.02;   // tread marks
      g.strokeStyle = 'rgba(70,70,70,0.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - w * 0.045, y); g.lineTo(x + w * 0.045, y + 2); g.stroke(); }
    for (let i = 0; i < 10; i++) { const fromL = r() < 0.5; let x = fromL ? 0 : w, y = r() * h;   // roots from the edges, darker
      g.strokeStyle = 'rgba(55,55,55,0.75)'; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (fromL ? 1 : -1) * w * (0.02 + r() * 0.03); y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h, l = 4 + r() * 12, a = r() * 6.283;   // fallen pine needles and twigs
      g.strokeStyle = r() < 0.7 ? 'rgba(215,215,215,0.5)' : 'rgba(80,80,80,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 2600; i++) { const crown = r() < 0.18, fx = r() < 0.5 ? Math.pow(r(), 2.4) * 0.12 : 1 - Math.pow(r(), 2.4) * 0.12;   // grass at the edges and (sparser) the crown
      const x = (crown ? 0.5 + (r() - 0.5) * 0.1 : fx) * w, y = r() * h, l = 3 + r() * 9;
      g.strokeStyle = `rgba(${55 + r() * 40},${85 + r() * 50},${25 + r() * 20},${0.6 + r() * 0.4})`; g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 5, y - l); g.stroke(); }
  }));
}

// Real forest-track soil (Poly Haven "Forest Ground 04", CC0), tiled in world space (3.15 m per tile). Two samples at
// different rotation and scale are blended by noise so the tiling never shows. Shared by the track and the verge.
let _dirt = null;
export function forestDirt() {
  if (_dirt) return _dirt;
  const ld = new THREE.TextureLoader(), mk = (f, srgb) => { const t = ld.load(`models/forest/${f}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return (_dirt = { diff: mk('dirt_diff', true), nor: mk('dirt_nor', false) });
}
export const DIRT_GLSL = `
uniform sampler2D uDirt; uniform sampler2D uDirtN;
float dnh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dnh(i), dnh(i + vec2(1, 0)), f.x), mix(dnh(i + vec2(0, 1)), dnh(i + vec2(1, 1)), f.x), f.y); }
vec2 dirtRot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float dirtMixK(vec2 p){ return smoothstep(0.3, 0.7, dn(p * 0.23)); }
vec3 dirtAlbedo(vec2 p){ vec2 q = p / 3.15; return mix(texture2D(uDirt, q).rgb, texture2D(uDirt, dirtRot(q, 1.1) * 0.63 + 0.37).rgb, dirtMixK(p)); }
// the detail's effect on a flat surface's normal, in world space (x, up, z): zero where the map is flat
vec3 dirtNormalW(vec2 p){ vec2 q = p / 3.15, q2 = dirtRot(q, 1.1) * 0.63 + 0.37;
  vec3 a = texture2D(uDirtN, q).xyz * 2.0 - 1.0, b = texture2D(uDirtN, q2).xyz * 2.0 - 1.0; b.xy = dirtRot(b.xy, -1.1) * 1.0;
  vec3 n = mix(a, b, dirtMixK(p)); return vec3(n.x, 0.0, n.y); }
`;
