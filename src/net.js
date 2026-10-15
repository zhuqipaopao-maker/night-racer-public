// Multiplayer connection: one WebSocket to /api/room/:code on the same origin as the page
// (file:// builds talk to the live site). Keeps an estimate of the server clock for synced starts.
const LIVE = 'wss://night-racer.pages.dev';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newRoomCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export class Net {
  constructor() { this.ws = null; this.handlers = {}; this.offset = 0; this.bestRtt = Infinity; this.pingTimer = null; this.closedByUs = false; }

  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, msg) { for (const fn of this.handlers[type] || []) fn(msg); }

  // Resolves with the first room state, rejects with an error code ('nosuch' | 'full' | 'started' | 'network').
  connect(code, hello) {
    this.close();
    this.closedByUs = false;
    const base = location.protocol === 'https:' || location.protocol === 'http:' ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host : LIVE;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
      const timer = setTimeout(() => { done(reject, 'network'); this.close(); }, 10000);
      let ws;
      try { ws = this.ws = new WebSocket(`${base}/api/room/${code}`); } catch { return done(reject, 'network'); }
      ws.onopen = () => { this.send({ t: 'hello', ...hello }); this.startPings(); };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'pong') return this.onPong(m);
        if (m.t === 'error') return done(reject, m.code);
        if (m.t === 'room') done(resolve, m);
        this.emit(m.t, m);
      };
      ws.onclose = () => { this.stopPings(); if (this.ws === ws) this.ws = null; done(reject, 'network'); if (!this.closedByUs) this.emit('disconnect', {}); };
    });
  }

  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  get connected() { return !!this.ws && this.ws.readyState === 1; }
  close() { this.closedByUs = true; this.stopPings(); if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; } }

  // server clock ≈ Date.now() + offset, taken from the lowest-latency ping seen
  now() { return Date.now() + this.offset; }
  onPong(m) {
    const t = Date.now(), rtt = t - m.c;
    this.rtt = rtt;
    if (rtt <= this.bestRtt * 1.3) { this.bestRtt = Math.min(this.bestRtt, rtt); this.offset = m.s - (m.c + rtt / 2); }
  }
  startPings() {
    this.stopPings();
    let n = 0;
    const tick = () => { this.send({ t: 'ping', c: Date.now() }); n++; this.pingTimer = setTimeout(tick, n < 6 ? 250 : 3000); };
    tick();
  }
  stopPings() { clearTimeout(this.pingTimer); this.pingTimer = null; }
}
