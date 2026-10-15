// Pure geometry for street maps (no three.js): polylines with rounded corners, and the side roads
// that leave the main loop and rejoin it. Shared by the game and the leaderboard track generator.

// Dense points along a polyline whose corners are circular arcs of radius R (closed: every vertex is a corner).
export function filletPath(pts, R, closed, step = 4) {
  const n = pts.length, out = [];
  const corner = k => {
    const V = pts[k], P = pts[(k - 1 + n) % n], Nx = pts[(k + 1) % n];
    const ax = V[0] - P[0], az = V[1] - P[1], bx = Nx[0] - V[0], bz = Nx[1] - V[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), d1 = [ax / la, az / la], d2 = [bx / lb, bz / lb];
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    if (Math.abs(turn) < 1e-3) return { S: V, E: V, arc: [] };
    let r = R, t = r * Math.tan(Math.abs(turn) / 2);
    const tmax = Math.min(la, lb) * 0.48; if (t > tmax) { t = tmax; r = t / Math.tan(Math.abs(turn) / 2); }
    const S = [V[0] - d1[0] * t, V[1] - d1[1] * t], E = [V[0] + d2[0] * t, V[1] + d2[1] * t];
    const sg = Math.sign(turn), C = [S[0] - d1[1] * r * sg, S[1] + d1[0] * r * sg];
    const a0 = Math.atan2(S[1] - C[1], S[0] - C[0]), m = Math.max(2, Math.ceil(r * Math.abs(turn) / 2)), arc = [];
    for (let q = 1; q < m; q++) { const a = a0 + turn * q / m; arc.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); }
    return { S, E, arc };
  };
  const line = (A, B) => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]), m = Math.max(1, Math.round(L / step)); for (let q = 0; q < m; q++) out.push([A[0] + (B[0] - A[0]) * q / m, A[1] + (B[1] - A[1]) * q / m]); };
  if (closed) {
    const cs = pts.map((_, k) => corner(k));
    for (let k = 0; k < n; k++) { out.push(...(k ? [cs[k].S] : []), ...cs[k].arc); line(cs[k].E, cs[(k + 1) % n].S); }
    // start exactly at the first vertex when it's a straight-through point
    if (!cs[0].arc.length) { const s = out.findIndex(p => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < 1e-6); if (s > 0) return [...out.slice(s), ...out.slice(0, s)]; }
    return out;
  }
  let prev = pts[0];
  for (let k = 1; k < n - 1; k++) { const c = corner(k); line(prev, c.S); out.push(c.S, ...c.arc); prev = c.E; }
  line(prev, pts[n - 1]); out.push(pts[n - 1]);
  return out;
}

// Main loop ctrl points for a street map.
export const cityCtrl = cfg => filletPath(cfg.corners, cfg.R, true, 5).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);

// Each side road as dense points: it peels off the main road at `from` (a point on a main straight),
// runs through `via`, and merges back at `to`; a short run along the main road at both ends makes the
// junction a real shared stretch of tarmac.
export function cityBranches(cfg) {
  const main = filletPath(cfg.corners, cfg.R, true, 2);
  const dirAt = p => { let b = 0, bd = 1e18; main.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < bd) { bd = d; b = i; } });
    const a = main[(b - 2 + main.length) % main.length], c = main[(b + 2) % main.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]); return [(c[0] - a[0]) / l, (c[1] - a[1]) / l]; };
  return (cfg.branches || []).map(b => {
    const L = b.R + 6, d0 = dirAt(b.from), d1 = dirAt(b.to);
    const pts = [[b.from[0] - d0[0] * L, b.from[1] - d0[1] * L], b.from, ...b.via, b.to, [b.to[0] + d1[0] * L, b.to[1] + d1[1] * L]];
    return { ...b, pts: filletPath(pts, b.R, false, 2) };
  });
}

// Resample a polyline at a fixed spacing.
export function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const A = pts[k - 1], B = pts[k], L = Math.hypot(B[0] - A[0], B[1] - A[1]); let t = step - carry;
    while (t <= L) { out.push([A[0] + (B[0] - A[0]) * t / L, A[1] + (B[1] - A[1]) * t / L]); t += step; }
    carry = L - (t - step);
  }
  return out;
}
