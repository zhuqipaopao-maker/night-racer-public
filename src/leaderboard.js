// Global leaderboard client: best lap per map, uploaded automatically once the player has a name.
const API = (location.protocol === 'https:' || location.protocol === 'http:' ? '' : 'https://night-racer.pages.dev') + '/api/board';
// the same per-map keys main.js stores laps under (every map, so a new one is never left off the board)
const K = (m, k) => (m === 'city' ? 'nr-' + k : `nr-${k}-${m}`);
// 标准组 and 改装组 keep separate records and separate boards (the 改装组 board is "<map>_mod" on the server)
const bestKey = (m, mod) => K(m, mod ? 'best-lap-mod' : 'best-lap');
const ghostKey = (m, mod) => K(m, mod ? 'ghost-mod' : 'ghost');
const apiMap = (m, mod) => (mod ? m + '_mod' : m);

export function createBoard({ store, fmt, maps }) {
  const uid = (() => {
    let u = store.get('nr-uid');
    if (!u || !/^[a-z0-9]{12,40}$/.test(u)) {
      const a = new Uint8Array(12); crypto.getRandomValues(a);
      u = Array.from(a, b => (b % 36).toString(36)).join('') + Date.now().toString(36);
      store.set('nr-uid', u);
    }
    return u;
  })();
  const name = () => (store.get('nr-name') || '').trim();

  // Upload any local best for `map` that the server hasn't seen yet. Resolves with the server's reply or null.
  async function sync(map, mod = false) {
    const t = store.get(bestKey(map, mod));
    if (!t || !name()) return null;
    const am = apiMap(map, mod);
    const sent = store.get('nr-lb-sent-' + am);
    if (sent && sent.t <= t && sent.name === name()) return null;
    // the server only accepts a lap together with its replay (the ghost of that lap)
    const g = store.get(ghostKey(map, mod));
    if (!g || !Array.isArray(g.f) || Math.abs(g.t - t) > 1e-6) return null;
    const f = g.f.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: am, uid, name: name(), t, f }) });
      const j = await r.json();
      if (r.ok || r.status === 422) store.set('nr-lb-sent-' + am, { t, name: name() });  // 422: rejected for good, don't retry
      if (j && j.error === 'bad name') return { badName: true };
      return r.ok ? j : null;
    } catch { return null; }
  }
  const syncAll = () => Promise.all(Object.keys(maps).flatMap(m => [sync(m, false), sync(m, true)]));

  async function load(map, mod) {
    const r = await fetch(`${API}?map=${apiMap(map, mod)}&uid=${uid}`);
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  // ---- overlay ----
  const $ = id => document.getElementById(id);
  let shown = 'city', shownMod = false;
  async function render(map, mod = shownMod) {
    shown = map; shownMod = mod;
    document.querySelectorAll('[data-lbmap]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lbmap === map)));
    document.querySelectorAll('[data-lbgroup]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.lbgroup === 'mod') === mod)));
    const body = $('lbbody'), info = $('lbme');
    body.replaceChildren(); info.textContent = '加载中…';
    let d;
    try { await sync(map, mod); d = await load(map, mod); }
    catch { info.textContent = '连不上排行榜服务器，稍后再试。'; return; }
    if (shown !== map || shownMod !== mod) return;
    if (!d.top.length) info.textContent = `${maps[map].name}（${mod ? '改装组' : '标准组'}）还没有人上榜，来当第一个吧。`;
    else info.textContent = d.me ? `你的最快圈 ${fmt(d.me.t)}，排第 ${d.me.rank} 名（共 ${d.total} 人）` : (name() ? `跑完一圈就能上榜（共 ${d.total} 人）` : `设置名字后，你的最快圈会自动上榜（共 ${d.total} 人）`);
    d.top.forEach((e, k) => {
      const tr = document.createElement('tr'); if (e.me) tr.className = 'me';
      for (const v of [k + 1, e.name, fmt(e.t)]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
      body.append(tr);
    });
  }
  function open(map, mod) {
    $('lbname').value = name();
    $('board').hidden = false;
    render(map || shown, mod ?? shownMod);
  }
  document.querySelectorAll('[data-lbgroup]').forEach(b => b.addEventListener('click', () => render(shown, b.dataset.lbgroup === 'mod')));
  document.querySelectorAll('[data-lbmap]').forEach(b => b.addEventListener('click', () => render(b.dataset.lbmap)));
  $('lbclose').addEventListener('click', () => { $('board').hidden = true; });
  $('lbsave').addEventListener('click', async () => {
    const n = $('lbname').value.trim().slice(0, 10);
    if (!n) { $('lbme').textContent = '名字不能为空。'; return; }
    store.set('nr-name', n);
    const res = await syncAll();
    if (res.some(x => x && x.badName)) { $('lbme').textContent = '这个名字含有不允许的词，换一个吧。'; return; }
    render(shown);
  });
  $('lbname').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('lbsave').click(); });

  return { uid, sync, syncAll, open, name };
}
