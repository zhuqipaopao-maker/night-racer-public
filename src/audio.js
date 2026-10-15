// All sound is synthesised with Web Audio — no sample files.
// music moods for the dream layers: chords (MIDI), tempo, drums (0 none, 1 half-time kick, 2 full kit), bass (0/1 long/2 driving), lead wave, filter
const MOODS = {
  grid:   { ch: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bpm: 108, drums: 2, bass: 2, lead: 'square', cut: 2400 },     // Am F C G
  cloud:  { ch: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bpm: 112, drums: 2, bass: 2, lead: 'triangle', cut: 4200 },   // C G Am F
  city:   { ch: [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]], bpm: 118, drums: 2, bass: 2, lead: 'sawtooth', cut: 1800 },   // Dm Bb Gm A
  seaTop: { ch: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]], bpm: 88, drums: 1, bass: 1, lead: 'triangle', cut: 1600 },    // Em C G D
  sea:    { ch: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]], bpm: 84, drums: 0, bass: 1, lead: 'sine', cut: 900 },
  space:  { ch: [[53, 57, 64], [57, 60, 64], [50, 53, 57], [48, 55, 64]], bpm: 96, drums: 1, bass: 1, lead: 'triangle', cut: 5000 },    // F Am Dm C
};

export class Sound {
  constructor(vol) {
    this.ctx = null; this.muted = false;
    // per-group volume, 0..1; applied through one gain bus per group
    this.vol = Object.assign({ master: 0.8, car: 0.7, rain: 0.8, sfx: 0.8, music: 0.6 }, vol || {});
  }

  setVolume(k, v) {
    this.vol[k] = v;
    if (!this.ctx) return;
    if (k === 'master') this.set(this.master.gain, v * 0.7, 0.03);
    else if (this.bus[k]) this.set(this.bus[k].gain, v, 0.03);
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master * 0.7; this.master.connect(ctx.destination);
    this.bus = {};
    for (const k of ['car', 'rain', 'sfx', 'music']) { const g = ctx.createGain(); g.gain.value = this.vol[k]; g.connect(this.master); this.bus[k] = g; }

    // engine: two detuned saws + a sub square through a resonant low-pass
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 6;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain); this.engGain.connect(this.bus.car);
    this.oscs = [['sawtooth', 1], ['sawtooth', 1.007], ['square', 0.5]].map(([type, mul]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 60;
      const g = ctx.createGain(); g.gain.value = type === 'square' ? 0.35 : 0.25;
      o.connect(g); g.connect(this.engFilter); o.start();
      return { o, mul };
    });

    // tunnel echo: a short feedback delay fed from the car bus, faded in inside the rock shed
    this.echoDelay = ctx.createDelay(1); this.echoDelay.delayTime.value = 0.11;
    this.echoFb = ctx.createGain(); this.echoFb.gain.value = 0.38;
    this.echoWet = ctx.createGain(); this.echoWet.gain.value = 0;
    this.bus.car.connect(this.echoDelay); this.echoDelay.connect(this.echoFb); this.echoFb.connect(this.echoDelay);
    this.echoDelay.connect(this.echoWet); this.echoWet.connect(this.master);

    // noise source shared by tyres / wind / impacts
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const loop = (type, freq, q, bus) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.bus[bus]); s.start();
      return { f, g };
    };
    this.squeal = loop('bandpass', 1500, 9, 'car');
    this.wind = loop('lowpass', 500, 0.7, 'car');
    this.rain = loop('highpass', 2400, 0.5, 'rain');
    this.rainLow = loop('lowpass', 900, 0.6, 'rain');   // body of the downpour, not just hiss
    this.boostN = loop('bandpass', 700, 1.2, 'car');
  }

  set(param, v, t = 0.06) { if (this.ctx) param.setTargetAtTime(v, this.ctx.currentTime, t); }

  update(car, rpm, throttle, rain, windMul = 1) {
    if (!this.ctx) return;
    const base = 46 + rpm * 210 + (car.boosting ? 25 : 0);
    for (const { o, mul } of this.oscs) this.set(o.frequency, base * mul, 0.03);
    this.set(this.engFilter.frequency, 380 + rpm * 1800 + (throttle ? 600 : 0), 0.05);
    this.set(this.engGain.gain, this.muted ? 0 : (throttle ? 0.32 : 0.2) + rpm * 0.08, 0.08);
    const sq = car.drifting ? Math.min(1, car.slip / 12) : (car.braking && car.speed > 12 ? 0.5 : 0);
    this.set(this.squeal.g.gain, this.muted ? 0 : sq * 0.22, 0.05);
    this.set(this.squeal.f.frequency, 1300 + Math.random() * 500, 0.02);
    const sp = car.speed / 80;
    this.set(this.wind.g.gain, this.muted ? 0 : Math.min(0.9, (sp * sp * 0.4 + (windMul > 1 ? 0.05 : 0)) * windMul), 0.2);
    this.set(this.wind.f.frequency, 300 + sp * 900, 0.2);
    this.set(this.rain.g.gain, this.muted || !rain ? 0 : 0.16, 0.3);
    this.set(this.rainLow.g.gain, this.muted || !rain ? 0 : 0.1, 0.3);
    this.set(this.boostN.g.gain, this.muted || !(car.boosting || car.mini) ? 0 : 0.25, 0.08);
  }

  hit(strength) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(1, strength / 15), ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    s.connect(f); f.connect(g); g.connect(this.bus.sfx); s.start(); s.stop(ctx.currentTime + 0.4);
  }

  beep(high) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = high ? 1320 : 660;
    g.gain.setValueAtTime(0.18, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (high ? 0.6 : 0.25));
    o.connect(g); g.connect(this.bus.sfx); o.start(); o.stop(ctx.currentTime + 0.7);
  }

  // Outdoor-city reverb shared by fireworks and firecrackers: a ~3 s stereo impulse response of decaying
  // noise that loses its highs as it decays (later echoes come back duller).
  fwBus() {
    if (this.fwIn) return this.fwIn;
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 3.2);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, k = Math.min(0.992, 0.93 + t * 0.03);          // dull from the start, duller as it decays (rumble, not hiss)
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        const early = t > 0.03 && t < 0.4 && Math.random() < 0.0009 ? 6 : 0;   // a few distinct slapbacks off buildings
        d[i] = (lp * 9 + early * 0.15 * (Math.random() - 0.5)) * Math.exp(-t * 1.6);
      }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.9;
    conv.connect(wet); wet.connect(this.bus.sfx);
    this.fwIn = conv;
    return conv;
  }

  // One shell burst. A real report has no pitch: it's a broadband shock that turns dull fast and then
  // rolls around the city. So: a saturated noise blast whose low-pass collapses from bright to muffled,
  // a short sub "body", a sharp front-edge click, all panned toward where the shell burst.
  _boomLive(vol, type, pan = 0) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.01, rev = this.fwBus();
    const dist = 1 - vol;                                                   // 0 near … 1 far
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (panner.pan) panner.pan.value = pan;
    const dryG = ctx.createGain(); dryG.gain.value = 0.95 - dist * 0.55;    // far shells are mostly echo
    const revG = ctx.createGain(); revG.gain.value = 0.55 + dist * 0.55;
    panner.connect(dryG); dryG.connect(this.bus.sfx);
    if (!this.fwShaper) {   // gentle tanh saturation: gives the blast its punch on small speakers
      const sh = ctx.createWaveShaper(), c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 3) / Math.tanh(3); }
      sh.curve = c; this.fwShaper = c;
    }
    // blast: noise → collapsing low-pass → saturation
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9;
    const top = 3200 - dist * 2400;
    lp.frequency.setValueAtTime(top, t0); lp.frequency.exponentialRampToValueAtTime(140, t0 + 0.32);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0); ng.gain.linearRampToValueAtTime(1.0 * vol, t0 + 0.003); ng.gain.setTargetAtTime(0.0001, t0 + 0.003, 0.2);
    const sat = ctx.createWaveShaper(); sat.curve = this.fwShaper;
    const post = ctx.createGain(); post.gain.value = 0.4;
    n.connect(lp); lp.connect(ng); ng.connect(sat); sat.connect(post); post.connect(panner); post.connect(revG); revG.connect(rev);
    n.start(t0, Math.random() * 1.2); n.stop(t0 + 1.6);
    // sub body: a short low thud, felt more than heard (headphones / bigger speakers)
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.4);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.linearRampToValueAtTime(0.35 * vol, t0 + 0.005); og.gain.setTargetAtTime(0.0001, t0 + 0.005, 0.15);
    o.connect(og); og.connect(panner); o.start(t0); o.stop(t0 + 0.9);
    // front-edge click: a couple of milliseconds, full band, near shells only
    if (dist < 0.7) {
      const c = ctx.createBufferSource(); c.buffer = this.noiseBuf;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, t0); cg.gain.linearRampToValueAtTime(0.5 * vol, t0 + 0.0008); cg.gain.setTargetAtTime(0.0001, t0 + 0.0008, 0.004);
      c.connect(cg); cg.connect(panner); c.start(t0, Math.random()); c.stop(t0 + 0.05);
    }
    const crackTone = ctx.createBiquadFilter(); crackTone.type = 'lowpass'; crackTone.frequency.value = 9000 - dist * 5500;
    const crackG = ctx.createGain(); crackG.gain.value = 1.1 - dist * 0.5;
    crackTone.connect(crackG); crackG.connect(panner);
    const cr = ctx.createGain(); cr.gain.value = 0.12; crackTone.connect(cr); cr.connect(rev);
    if (type === 'crackle' || type === 'willow') {
      // 刺啦: a few hundred tiny pops whose density swells and dies over ~2 s, over a soft sizzle
      const start = t0 + 0.35, len = 1.6 + Math.random() * 0.8, pops = 220 + Math.floor(Math.random() * 120);
      for (let k = 0; k < pops; k++) {
        const u = Math.pow(Math.random(), 0.8), t = start + u * len;           // denser early on
        const env = Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - u * 0.75);
        this.pop(t, (0.35 + Math.random() * 0.45) * env * (0.6 + vol * 0.6), crackTone, 2600 + Math.random() * 5000);
      }
      const z = ctx.createBufferSource(); z.buffer = this.noiseBuf;
      const zf = ctx.createBiquadFilter(); zf.type = 'bandpass'; zf.frequency.value = 6000; zf.Q.value = 0.7;
      const zg = ctx.createGain(); zg.gain.setValueAtTime(0.0001, start); zg.gain.linearRampToValueAtTime(0.09 * (0.6 + vol * 0.6), start + 0.25); zg.gain.linearRampToValueAtTime(0.0001, start + len);
      z.connect(zf); zf.connect(zg); zg.connect(crackG); z.start(start, Math.random()); z.stop(start + len + 0.1);
    }
    if (type === 'willow') {
      const z = ctx.createBufferSource(); z.buffer = this.noiseBuf;
      const zf = ctx.createBiquadFilter(); zf.type = 'highpass'; zf.frequency.value = 4000;
      const zg = ctx.createGain(); zg.gain.setValueAtTime(0.0001, t0 + 0.3); zg.gain.linearRampToValueAtTime(0.05 * vol, t0 + 0.8); zg.gain.linearRampToValueAtTime(0.0001, t0 + 3);
      z.connect(zf); zf.connect(zg); zg.connect(panner); z.start(t0 + 0.3, Math.random()); z.stop(t0 + 3.1);
    }
  }

  // Building these sounds live meant hundreds of audio nodes per shell (each crackle pop is its own
  // source + filter + gain), which made phones' audio stutter. Instead every sound is rendered once
  // into a buffer on an OfflineAudioContext and played back as one source node, with a voice cap.
  bank() {
    if (this._bank) return this._bank;
    const sr = 32000;
    const render = (sec, fn) => {
      const off = new OfflineAudioContext(2, Math.ceil(sr * sec), sr);
      const f = Object.create(Sound.prototype);
      f.ctx = off; f.muted = false; f.bus = { sfx: off.destination }; f.fwIn = null; f.fwShaper = null;
      const nb = off.createBuffer(1, this.noiseBuf.length, this.noiseBuf.sampleRate); nb.copyToChannel(this.noiseBuf.getChannelData(0), 0); f.noiseBuf = nb;
      fn(f);
      return off.startRendering();
    };
    const B = this._bank = { boom: {}, crackers: [], drum: {}, whistle: [] };
    const jobs = [];
    for (const [tier, v] of [['near', 0.9], ['mid', 0.6], ['far', 0.3]]) for (const kind of ['plain', 'crackle', 'willow'])
      jobs.push(render(4.2, f => f._boomLive(v, kind)).then(b => { B.boom[tier + kind] = b; }));
    for (let k = 0; k < 3; k++) jobs.push(render(5, f => f._crackersLive(0.6)).then(b => B.crackers.push(b)));
    for (const [kind, sec] of [['dong', 0.7], ['ka', 0.25], ['qiang', 1.5], ['luo', 3.2]]) jobs.push(render(sec, f => f._drumLive(kind, 1)).then(b => { B.drum[kind] = b; }));
    for (const sing of [false, true]) jobs.push(render(1.7, f => f._whistleLive(1, sing)).then(b => B.whistle.push(b)));
    Promise.all(jobs).catch(() => {});
    return B;
  }

  play(buf, gain, pan = 0, priority = 0) {
    if (!buf || !this.ctx || this.muted || gain <= 0.01) return;
    this.voices = this.voices || 0;
    if (this.voices >= 14 || (this.voices >= 9 && priority < 1)) return;    // keep the mixer light
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(this.bus.sfx); } else g.connect(this.bus.sfx);
    this.voices++;
    s.onended = () => { this.voices--; s.disconnect(); g.disconnect(); p && p.disconnect(); };
    s.start(ctx.currentTime + 0.005);
  }

  boom(vol, type, pan = 0) {
    if (!this.ctx || this.muted || vol <= 0.02) return;
    const B = this.bank(), tier = vol > 0.72 ? 'near' : vol > 0.42 ? 'mid' : 'far', tv = { near: 0.9, mid: 0.6, far: 0.3 }[tier];
    const kind = type === 'willow' ? 'willow' : type === 'double' || Math.random() < 0.45 ? 'crackle' : 'plain';
    this.play(B.boom[tier + kind], Math.min(1.4, vol / tv), pan, vol > 0.5 ? 1 : 0);
  }
  firecrackers(vol) { if (this.ctx && !this.muted) { const B = this.bank(); this.play(B.crackers[Math.floor(Math.random() * B.crackers.length)], vol / 0.6, (Math.random() - 0.5) * 1.2); } }
  drum(kind, vol, pan = 0) { if (this.ctx && !this.muted && vol > 0.02) this.play(this.bank().drum[kind], vol, pan, 1); }
  whistle(vol) { if (this.ctx && !this.muted && vol > 0.05) { const B = this.bank(); this.play(B.whistle[Math.random() < 0.35 ? 1 : 0], vol, 0); } }

  // lion-dance percussion: 'dong' = big drum, 'qiang' = cymbals, 'luo' = gong, 'ka' = woodblock
  _drumLive(kind, vol, pan = 0) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.005;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = pan;
    p.connect(this.bus.sfx); const send = ctx.createGain(); send.gain.value = 0.25; p.connect(send); send.connect(this.fwBus());
    const env = (g, a, peak, tau) => { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.setTargetAtTime(0.0001, t0 + a, tau); };
    if (kind === 'dong') {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
      const g = ctx.createGain(); env(g, 0.003, 0.7 * vol, 0.12); o.connect(g); g.connect(p); o.start(t0); o.stop(t0 + 0.6);
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const ng = ctx.createGain(); env(ng, 0.001, 0.35 * vol, 0.02); n.connect(f); f.connect(ng); ng.connect(p); n.start(t0, Math.random()); n.stop(t0 + 0.2);
    } else if (kind === 'qiang' || kind === 'luo') {
      // metallic: a cluster of inharmonic square partials through a band-pass, long ring
      const bp = ctx.createBiquadFilter(); bp.type = kind === 'luo' ? 'lowpass' : 'highpass'; bp.frequency.value = kind === 'luo' ? 1800 : 3000;
      const g = ctx.createGain(); env(g, 0.002, (kind === 'luo' ? 0.22 : 0.16) * vol, kind === 'luo' ? 0.9 : 0.35); bp.connect(g); g.connect(p);
      const base = kind === 'luo' ? 180 : 420;
      for (const m of [1, 1.47, 2.09, 2.56, 3.17, 4.07]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = base * m * (1 + (Math.random() - 0.5) * 0.01); o.connect(bp); o.start(t0); o.stop(t0 + (kind === 'luo' ? 3 : 1.2)); }
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const ng = ctx.createGain(); env(ng, 0.001, 0.3 * vol, 0.15); n.connect(ng); ng.connect(bp); n.start(t0, Math.random()); n.stop(t0 + 0.8);
    } else {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1100;
      const g = ctx.createGain(); env(g, 0.001, 0.25 * vol, 0.02); o.connect(g); g.connect(p); o.start(t0); o.stop(t0 + 0.15);
    }
  }

  // a single sharp pop (crackle star or one firecracker)
  pop(t, v, dest, freq) {
    const ctx = this.ctx;
    const c = ctx.createBufferSource(); c.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1500 + Math.random() * 3000; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.0008); g.gain.setTargetAtTime(0.0001, t + 0.0008, 0.006);
    c.connect(f); f.connect(g); g.connect(dest); c.start(t, Math.random() * 1.8); c.stop(t + 0.06);
  }

  // a string of firecrackers going off somewhere in the city (噼里啪啦)
  _crackersLive(vol) {
    const ctx = this.ctx, rev = this.fwBus();
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2500 + vol * 4000;
    const dryG = ctx.createGain(); dryG.gain.value = 0.5 * vol; const revG = ctx.createGain(); revG.gain.value = 0.5;
    tone.connect(dryG); dryG.connect(this.bus.sfx); tone.connect(revG); revG.connect(rev);
    let t = ctx.currentTime + 0.05;
    const n = 50 + Math.floor(Math.random() * 90);
    for (let k = 0; k < n; k++) {
      t += 0.012 + Math.random() * Math.random() * 0.09;
      this.pop(t, 0.5 + Math.random() * 0.5, tone);
      if (Math.random() < 0.08) {   // the odd bigger banger in the string
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.001); g.gain.setTargetAtTime(0.0001, t + 0.001, 0.025);
        o.connect(g); g.connect(tone); o.start(t); o.stop(t + 0.2);
      }
    }
  }

  // shells mostly just "thump" out of the mortar; only some whistle on the way up
  _whistleLive(vol, sing) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.25 * vol, t0 + 0.004); g.gain.setTargetAtTime(0.0001, t0 + 0.004, 0.05);
    n.connect(f); f.connect(g); g.connect(this.bus.sfx); g.connect(this.fwBus()); n.start(t0, Math.random()); n.stop(t0 + 0.4);
    if (sing) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1200, t0 + 0.1); o.frequency.exponentialRampToValueAtTime(3200, t0 + 1.4);
      const wg = ctx.createGain(); wg.gain.setValueAtTime(0.0001, t0 + 0.1); wg.gain.linearRampToValueAtTime(0.035 * vol, t0 + 0.25); wg.gain.linearRampToValueAtTime(0.0001, t0 + 1.45);
      o.connect(wg); wg.connect(this.bus.sfx); o.start(t0 + 0.1); o.stop(t0 + 1.5);
    }
  }

  chime() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    [880, 1175, 1568].forEach((fr, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = fr;
      const t = ctx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(this.bus.sfx); o.start(t); o.stop(t + 0.6);
    });
  }

  setTunnel(on) { if (this.ctx && on !== this.inTunnel) { this.inTunnel = on; this.set(this.echoWet.gain, on ? 0.75 : 0, 0.12); } }

  // ---- synthwave soundtrack (霓虹梦境): Am–F–C–G at 108 BPM, scheduled a little ahead from the frame loop ----
  musicStart() {
    if (!this.ctx || this.mus) return;
    const ctx = this.ctx, out = ctx.createGain(); out.gain.value = 0; out.connect(this.bus.music);
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    // a ping-pong-ish echo for the lead arp
    const dl = ctx.createDelay(1); dl.delayTime.value = 60 / 108 * 0.75; const fb = ctx.createGain(); fb.gain.value = 0.35;
    const wet = ctx.createGain(); wet.gain.value = 0.4; dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
    this.mus = { out, dl, step: 0, next: ctx.currentTime + 0.1, kicks: [] };
  }
  musicMood(k) { this.mood = k; }
  // 坠梦 moments: a splash diving into the sea, a deep whoosh through the water wall or the moon gate
  swoosh(kind) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = kind === 'splash' ? 'lowpass' : 'bandpass'; f.Q.value = kind === 'splash' ? 0.7 : 1.5;
    f.frequency.setValueAtTime(kind === 'splash' ? 3000 : 300, t); f.frequency.exponentialRampToValueAtTime(kind === 'splash' ? 300 : 2400, t + (kind === 'splash' ? 0.8 : 1.2));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(kind === 'splash' ? 0.6 : 0.45, t + 0.04); g.gain.setTargetAtTime(0.0001, t + 0.3, kind === 'splash' ? 0.25 : 0.4);
    n.connect(f); f.connect(g); g.connect(this.bus.sfx); n.start(t, Math.random()); n.stop(t + 2.5);
    if (kind !== 'splash') { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(30, t + 1); og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.2); o.connect(og); og.connect(this.bus.sfx); o.start(t); o.stop(t + 1.3); }
  }
  musicStop() {
    if (!this.mus) return;
    const { out } = this.mus; this.set(out.gain, 0, 0.3); setTimeout(() => out.disconnect(), 1500); this.mus = null;
  }
  // 0..1 pulse that peaks on every kick drum — the neon follows it
  beat() {
    if (!this.mus) return 0;
    const now = this.ctx.currentTime, k = this.mus.kicks; let last = -9;
    while (k.length && k[0] <= now) last = k.shift();
    if (last > -9) this.mus.lastKick = last;
    return Math.exp(-Math.max(0, now - (this.mus.lastKick ?? -9)) * 5);
  }
  musicTick() {
    const m = this.mus; if (!m) return;
    const ctx = this.ctx, M = MOODS[this.mood] || MOODS.grid, S = 60 / M.bpm / 4;          // one 16th note
    this.set(this.bus.music.gain, this.muted ? 0 : this.vol.music, 0.1);
    if (m.next < ctx.currentTime - 0.5) m.next = ctx.currentTime + 0.05;   // tab was asleep: don't burst-play the backlog
    const CH = M.ch;
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const tone = (type, f, t, len, vol, dest, cut) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.setTargetAtTime(0.0001, t + len * 0.6, len * 0.3);
      if (cut) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut * 3, t); fl.frequency.exponentialRampToValueAtTime(cut, t + len); fl.Q.value = 4; o.connect(fl); fl.connect(g); } else o.connect(g);
      g.connect(dest); o.start(t); o.stop(t + len * 2.5);
    };
    const noise = (t, len, vol, type, freq) => {
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      n.connect(f); f.connect(g); g.connect(m.out); n.start(t, Math.random()); n.stop(t + len + 0.05);
    };
    while (m.next < ctx.currentTime + 0.2) {
      const t = m.next, st = m.step % 16, bar = Math.floor(m.step / 16), ch = CH[bar % 4], sect = M.drums ? Math.floor(bar / 8) % 4 : 2;
      if (st % 4 === 0 && !M.drums) m.kicks.push(t);   // no drums: the neon still breathes on the beat
      // kick on every beat
      if (st % 4 === 0 && M.drums && (M.drums > 1 || st % 8 === 0)) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g); g.connect(m.out); o.start(t); o.stop(t + 0.4);
        m.kicks.push(t);
      }
      // big gated snare on 2 and 4
      if (M.drums > 1 && (st === 4 || st === 12)) { noise(t, 0.22, 0.45, 'bandpass', 1800); tone('triangle', 190, t, 0.08, 0.25, m.out); }
      // offbeat hats
      if (M.drums > 1 && (st % 2 === 1 || sect > 0)) noise(t, 0.04, st % 4 === 2 ? 0.16 : 0.07, 'highpass', 7000);
      // driving octave bass on every 16th
      if (M.bass && (M.bass > 1 || st % 4 === 0)) tone('sawtooth', hz(ch[0] - 24 + (st % 2) * 12), t, M.bass > 1 ? S * 0.9 : S * 3.5, 0.16, m.out, M.cut * 0.3);
      // lead arpeggio (enters after the first 8 bars), echoing
      if (sect > 0) { const n = ch[[0, 1, 2, 1][st % 4]] + 12 + (st >= 8 && sect > 1 ? 12 : 0); tone(M.lead, hz(n), t, S * 0.8, 0.045, m.dl, M.cut); tone(M.lead, hz(n), t, S * 0.8, 0.045, m.out, M.cut); }
      // pad chord once per bar
      if (st === 0) for (const n of ch) for (const d of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = d;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = M.cut * 0.4; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.3); g.gain.setTargetAtTime(0.0001, t + S * 15, 0.2);
        o.connect(f); f.connect(g); g.connect(m.out); o.start(t); o.stop(t + S * 16 + 1); }
      m.step++; m.next += S;
    }
  }

  toggleMute() { this.muted = !this.muted; return this.muted; }
}
