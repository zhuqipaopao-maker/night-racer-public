// Racing line + AI driver. The line is computed once from track curvature:
// lateral offset swings to the outside before a bend and to the inside at the apex,
// and a speed profile comes from v = sqrt(a_lat / κ) followed by a backward braking pass.
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

export class RaceLine {
  constructor(track, { aLat = 25, decel = 22 } = {}) {
    const N = track.N, step = track.step;
    this.track = track;
    const ang = new Float32Array(N);
    for (let i = 0; i < N; i++) ang[i] = Math.atan2(track.tx[i], track.tz[i]);
    const W = 5;
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) k[i] = wrapA(ang[(i + W) % N] - ang[(i - W + N) % N]) / (2 * W * step);
    const smooth = (src, r) => {
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) { let s = 0; for (let d = -r; d <= r; d++) s += src[(i + d + N) % N]; out[i] = s / (2 * r + 1); }
      return out;
    };
    const ks = smooth(k, 8);
    this.k = ks;

    // positive curvature = left bend; inside of a left bend is negative offset
    const K = 150, lim = Math.min(5.4, track.driveLimit - 1.2);
    this.limit = track.driveLimit - 0.6;
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = Math.max(-lim, Math.min(lim, -K * ks[i] + 0.65 * K * ks[(i + 26) % N]));
    this.off = smooth(raw, 14);
    const cfg = track.cfg, idx = m => Math.round(m / step);
    if (track.layered) {
      // take the jump lane through split sections, stay central on narrow stretches
      for (let i = 0; i < N; i++) {
        if (track.split[i]) this.off[i] = -3.6;
        if (track.halfAt[i] < track.half) this.off[i] = 0;
      }
      this.off = smooth(this.off, 6);
      for (let i = 0; i < N; i++) if (track.split[i]) this.off[i] = Math.min(this.off[i], -2.4);
    }

    // speed profile
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = Math.min(88 * (track.cfg.speed || 1), Math.sqrt(aLat / Math.max(Math.abs(ks[i]), 1e-4)));
    for (let pass = 0; pass < 2; pass++) for (let n = N - 1; n >= 0; n--) {
      const i = n, j = (n + 1) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * decel * step));
    }
    // keep enough speed for the jumps
    for (const [a, b, vmin] of track.cfg.fast || []) for (let i = idx(a); i <= idx(b); i++) v[i] = Math.max(v[i], vmin);
    this.v = v;

    // how much the road turns over the next ~45 m (used for drift / nitro decisions)
    const ahead = Math.round(45 / step);
    this.turn = new Float32Array(N);
    for (let i = 0; i < N; i++) this.turn[i] = Math.abs(wrapA(ang[(i + ahead) % N] - ang[i]));
    // minimum target speed over the next ~150 m
    const span = Math.round(150 / step);
    this.vAhead = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 1e9; for (let d = 0; d < span; d += 4) m = Math.min(m, v[(i + d) % N]); this.vAhead[i] = m; }
  }
}

export class AIDriver {
  constructor(car, line, { skill = 1, bias = 0, drifter = false, name = 'AI' } = {}) {
    this.car = car; this.line = line; this.skill = skill; this.bias = bias; this.drifter = drifter; this.name = name;
    this.avoid = 0; this.stuckT = 0; this.nitroCool = 2 + Math.random() * 4; this.rubber = 0;
  }

  // street maps: follow the route this driver picked for the lap through the side roads
  walk(m) {
    const car = this.car, tr = this.line.track, N = tr.N, S = m / tr.step;
    let P = car.path ? tr.paths.find(p => p.id === car.path) : null, k0 = car.pathK ?? 0;
    if (!P) for (const Q of tr.paths) {   // still on the shared stretch at a side road's mouth?
      const rel = (car.trackI - Q.i0 + N) % N;
      if (this.route[Q.id] && rel <= Q.span) {
        const e = Math.round(rel / Q.span * (Q.K - 1)); let k = e, bd = 1e18;
        for (let q = Math.max(0, e - 40); q <= Math.min(Q.K - 1, e + 40); q++) { const d = (car.x - Q.px[q]) ** 2 + (car.z - Q.pz[q]) ** 2; if (d < bd) { bd = d; k = q; } }
        if (Math.sqrt(bd) < Q.edge + 2) { P = Q; k0 = k; break; }
      }
    }
    let i = car.trackI ?? 0, rest = S;
    if (P) { const k = k0 + S; if (k <= P.K - 1) return { P, k }; rest = k - (P.K - 1); i = P.i1; }
    for (const Q of tr.paths) if (this.route[Q.id] && Q !== P) {
      const rel = (Q.i0 - i + N) % N;
      if (rel > 0 && rel <= rest) { const k = rest - rel; return k <= Q.K - 1 ? { P: Q, k } : { j: Math.round(Q.i1 + k - (Q.K - 1)) % N }; }
    }
    return { j: Math.round(i + rest) % N };
  }

  inputPaths(dt, others) {
    const car = this.car, line = this.line, tr = line.track, N = tr.N, i = car.trackI ?? car.hint, v = car.forwardSpeed;
    if (!this.route || (this.prevI > N * 0.9 && i < N * 0.1)) { this.route = {}; for (const Q of tr.paths) this.route[Q.id] = Math.random() < 0.5; }
    this.prevI = i;
    let want = 0;
    for (const o of others) {
      if (o === car || (o.path || 0) !== (car.path || 0)) continue;
      let d = (o.trackI - i + N) % N; if (d > N / 2) continue;
      if (d * tr.step > 0.5 && d * tr.step < 16 && Math.abs((o.trackOff ?? 0) - (car.trackOff ?? 0)) < 2.6 && o.forwardSpeed < v + 1) want = (o.trackOff ?? 0) > 0 ? -3 : 3;
    }
    this.avoid += (want - this.avoid) * Math.min(1, dt * 3);
    const at = m => { const w = this.walk(m);
      if (w.P) { const k = Math.min(w.P.K - 1, Math.round(w.k)); return { x: w.P.px[k], z: w.P.pz[k], nx: w.P.nx[k], nz: w.P.nz[k], vlim: w.P.v[k], off: 0, lim: w.P.lim - 1.3 }; }
      const j = w.j; return { x: tr.px[j], z: tr.pz[j], nx: tr.nx[j], nz: tr.nz[j], vlim: line.v[j], off: line.off[j] * 0.92, lim: line.limit }; };
    const T = at(6 + Math.max(0, v) * 0.36);
    const off = Math.max(-T.lim, Math.min(T.lim, T.off + this.bias * (T.off ? 1 : 0.4) + this.avoid));
    const tx = T.x + T.nx * off, tz = T.z + T.nz * off, fx = Math.sin(car.h), fz = Math.cos(car.h), dx = tx - car.x, dz = tz - car.z;
    let steer = Math.max(-1, Math.min(1, Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 2.7));
    const sk = this.skill * (1 + this.rubber);
    let vt = 66 * (tr.cfg.speed || 1) * (car.stats?.top || 1);
    for (let d = 0; d <= 150; d += 6) vt = Math.min(vt, Math.sqrt(at(d).vlim ** 2 + 2 * 20 * d));
    vt *= sk;
    const throttle = v < vt - 0.3, brake = v > vt + 2.2;
    let drift = false;
    if (this.drifter && v > 20 && at(40).vlim < 22) drift = true;
    if (car.drifting && at(15).vlim < 26) drift = true;
    if (drift && !car.drifting) steer = Math.sign(steer || 1);
    let nitroPressed = false;
    this.nitroCool -= dt;
    if (this.skill >= 0.95 && car.bottles > 0 && this.nitroCool <= 0 && v > 28 && at(120).vlim * sk > v + 15 && at(60).vlim * sk > v + 15) { nitroPressed = true; this.nitroCool = 5 + Math.random() * 5; }
    if (Math.abs(v) < 2.5) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    return { throttle, brake, steer, drift, nitroPressed };
  }

  input(dt, others) {
    const car = this.car, line = this.line, tr = line.track, N = tr.N;
    if (tr.paths) return this.inputPaths(dt, others);
    const i = car.trackI ?? car.hint, v = car.forwardSpeed;

    // traffic: if someone is just ahead in our lane, pick the side with more room
    let want = 0;
    for (const o of others) {
      if (o === car) continue;
      let d = (o.trackI - i + N) % N; if (d > N / 2) continue;
      const dist = d * tr.step;
      if (dist > 0.5 && dist < 16 && Math.abs((o.trackOff ?? 0) - (car.trackOff ?? 0)) < 2.6 && o.forwardSpeed < v + 1) {
        want = (o.trackOff ?? 0) > 0 ? -3.4 : 3.4;
      }
    }
    this.avoid += (want - this.avoid) * Math.min(1, dt * 3);

    const look = Math.round((6 + Math.max(0, v) * 0.36) / tr.step);
    const j = (i + look) % N;
    let lim = line.limit;
    if (tr.layered) { lim = Math.min(lim, tr.halfAt[j] - 1.3, tr.halfAt[i] - 1.3); }
    let off = Math.max(-lim, Math.min(lim, line.off[j] * 0.92 + this.bias + this.avoid));
    if (tr.layered && (tr.split[j] || tr.split[i])) off = Math.min(off, -2.2);   // never wander into the low lane
    const tx = tr.px[j] + tr.nx[j] * off, tz = tr.pz[j] + tr.nz[j] * off;
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const dx = tx - car.x, dz = tz - car.z;
    const a = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz); // <0 = target is left
    let steer = Math.max(-1, Math.min(1, a * 2.7));

    const sk = this.skill * (1 + this.rubber);
    // skill scales cornering speed and straight-line top speed alike (66 m/s ≈ the car's own top speed)
    const vt = Math.min(66 * (tr.cfg.speed || 1) * (car.stats?.top || 1), line.v[(i + Math.round(5 / tr.step)) % N]) * sk;
    const throttle = v < vt - 0.3;
    const brake = v > vt + 2.2;

    let drift = false;
    const turn = line.turn[i];
    if (this.drifter && v > 20 && turn > 1.15) drift = true;
    if (car.drifting && turn > 0.6) drift = true;
    if (drift && !car.drifting) steer = Math.sign(steer || 1); // commit to the slide

    let nitroPressed = false;
    this.nitroCool -= dt;
    if (this.skill >= 0.95 && car.bottles > 0 && this.nitroCool <= 0 && v > 28 && line.vAhead[i] * sk > v + 15) { nitroPressed = true; this.nitroCool = 5 + Math.random() * 5; }

    // stuck against a wall → back out, then let the race manager reset if it persists
    if (Math.abs(v) < 2.5) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);

    return { throttle, brake, steer, drift, nitroPressed };
  }
}
