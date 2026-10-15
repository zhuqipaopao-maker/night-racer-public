// Lay out a map's centreline from straights and arcs, close the loop, and print the ctrl points for maps.js.
//   node tools/track-layout.mjs tools/tracks/<map>.mjs [plot.svg]
// Two straights (marked `solve`) get their lengths solved so the loop ends where it started, heading the same way.
// Angles in degrees, + = left.
import fs from 'fs';
import path from 'path';

const SEG = (await import(path.resolve(process.argv[2]))).default;

function walk(lengths) {
  let x = 0, z = 0, h = 0, k = 0; const P = [[0, 0]], marks = [];
  const STEP = 36;
  for (const s of SEG) {
    marks.push(P.length > 1 ? +(P.length - 1) * STEP : 0);
    if (s[0] === 'S') {
      const L = s[1] === 'solve' ? lengths[k++] : s[1];
      const n = Math.max(1, Math.round(L / STEP));
      for (let i = 0; i < n; i++) { x += Math.cos(h) * L / n; z += Math.sin(h) * L / n; P.push([x, z]); }
    } else {
      const [, R, deg] = s, a = deg * Math.PI / 180, L = R * Math.abs(a), n = Math.max(2, Math.round(L / STEP));
      for (let i = 0; i < n; i++) { const da = a / n, c = 2 * R * Math.sin(Math.abs(da) / 2); h += da / 2; x += Math.cos(h) * c; z += Math.sin(h) * c; h += da / 2; P.push([x, z]); }
    }
  }
  return { P, x, z, h };
}
// position is linear in the two solved lengths (their headings are fixed), so solve the 2x2 system
const f = l => { const w = walk(l); return [w.x, w.z]; };
const base = f([0, 0]), e1 = f([1, 0]), e2 = f([0, 1]);
const a = e1[0] - base[0], b = e2[0] - base[0], c = e1[1] - base[1], d = e2[1] - base[1], det = a * d - b * c;
const L1 = (-base[0] * d + b * base[1]) / det, L2 = (-a * base[1] + c * base[0]) / det;
const { P, h } = walk([L1, L2]);
P.pop();   // last point is back on the first
const turn = h * 180 / Math.PI;
let len = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; len += Math.hypot(q[0] - P[i][0], q[1] - P[i][1]); }
// closest approach between parts of the loop more than 300 m apart along it
let minGap = 1e9, at = null; const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const ds = Math.min(s[j] - s[i], len - (s[j] - s[i])); if (ds < 300) continue; const g = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (g < minGap) { minGap = g; at = [Math.round(s[i]), Math.round(s[j])]; } }
console.error(`solved straights ${L1.toFixed(0)} m, ${L2.toFixed(0)} m · total turn ${turn.toFixed(1)}° · lap ${len.toFixed(0)} m · ${P.length} points · closest other part ${minGap.toFixed(0)} m (at ${at})`);
console.log(JSON.stringify(P.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)])));
const out = process.argv[3];
if (out) {   // a quick top-down plot (SVG, rendered by the caller)
  const xs = P.map(p => p[0]), zs = P.map(p => p[1]), x0 = Math.min(...xs) - 100, z0 = Math.min(...zs) - 100, W = Math.max(...xs) - x0 + 100, H = Math.max(...zs) - z0 + 100;
  const pts = P.map(([x, z]) => `${(x - x0).toFixed(0)},${(z - z0).toFixed(0)}`).join(' ');
  const ticks = []; let acc = 0; for (let i = 1; i < P.length; i++) { const prev = acc; acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (Math.floor(acc / 500) > Math.floor(prev / 500)) ticks.push(`<circle cx="${P[i][0] - x0}" cy="${P[i][1] - z0}" r="14" fill="#e33"/><text x="${P[i][0] - x0 + 18}" y="${P[i][1] - z0 + 10}" font-size="40">${Math.floor(acc / 500) * 500}</text>`); }
  fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${W / 3}" height="${H / 3}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><polygon points="${pts}" fill="none" stroke="#246" stroke-width="16"/><circle cx="${-x0}" cy="${-z0}" r="24" fill="#2a2"/>${ticks.join('')}</svg>`);
}
