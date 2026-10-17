// The player's garage and wallet: coins, cars, upgrades, paint, underglow, daily tasks and the login
// streak. Kept in this browser (localStorage) — nothing here is trusted by the leaderboard server.

export const CARS = {
  gt:     { name: '街头 GT', price: 0,     desc: '均衡的街头跑车，什么路都能开。', stats: { top: 1.00, accel: 1.00, grip: 1.00, nitro: 1.00 }, tier: 1 },
  hyper:  { name: '超跑',    price: 10000, desc: '最快的车，极速和加速都是顶级。', stats: { top: 1.10, accel: 1.09, grip: 1.06, nitro: 1.06 }, tier: 2 },
};
export const UPGRADES = {
  engine: { name: '引擎', desc: '极速和加速', per: { top: 0.025, accel: 0.04 } },
  tires:  { name: '轮胎', desc: '过弯抓地', per: { grip: 0.04 } },
  nitro:  { name: '氮气', desc: '氮气时长和攒气速度', per: { nitro: 0.07 } },
};
export const MAX_LEVEL = 5;
export const PAINTS = [
  ['烈焰红', 0xc8102e, 0], ['珍珠白', 0xe8e6e0, 0], ['曜石黑', 0x16161a, 0], ['电光蓝', 0x1f5fff, 200], ['柠檬黄', 0xf2c200, 200],
  ['薄荷绿', 0x2fbf8a, 200], ['日落橙', 0xff6a1f, 200], ['樱花粉', 0xff7ab8, 300], ['皇家紫', 0x6a2bd8, 300], ['香槟金', 0xc8a55a, 400], ['枪灰', 0x5a5f66, 200], ['宝石青', 0x00a8b5, 300],
];
export const GLOWS = [
  ['青色', 'rgba(60,220,255,0.9)', 0], ['品红', 'rgba(255,60,200,0.9)', 300], ['翠绿', 'rgba(60,255,120,0.9)', 300], ['琥珀', 'rgba(255,170,40,0.9)', 300], ['纯白', 'rgba(240,240,255,0.9)', 300], ['关闭', 'rgba(0,0,0,0)', 0],
];
// Cars taken out of the garage (until they get sculpted models, 2026-10-15) and what they cost, for refunds
const RETIRED = { hatch: { name: '小钢炮', price: 1500, tier: 0.8 }, muscle: { name: '肌肉车', price: 5000, tier: 1.4 } };
// the hypercar used to cost 12000; owners bought before the cut get the difference back
const PRICE_CUTS = { hyper: 12000 };
export const upgradeCost = (car, level) => Math.round((level + 1) * 300 * (CARS[car] || RETIRED[car]).tier / 10) * 10;

// daily tasks: [id, text, target, reward]
const TASKS = [
  ['drift', '累计漂移 40 秒', 40, 250], ['jump', '腾空飞过 20 米以上 3 次', 3, 250], ['win', '赢得 1 场比赛（第一名）', 1, 300],
  ['races', '跑完 3 场比赛', 3, 200], ['nitro', '使用 8 次氮气', 8, 200], ['top3', '拿到 2 次前三名', 2, 250],
  ['branch', '在云港城区走 2 次岔路', 2, 250], ['laps', '跑完 6 圈（任意地图、任意模式）', 6, 200], ['coins', '一场比赛赚到 400 金币', 1, 300],
];
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dayIndex = n => Math.floor(Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100) / 86400000);

// 兑换码 (gift codes) the owner hands out to players. Only a hash of each code lives here, so reading the source
// doesn't give one away; each code pays once per browser. Codes look like ABCD-EFGH-JKLM (case and dashes don't matter).
const GIFTS = {
  7321464675633881: 3000,   // 2026-10-15 新炸坤高手
  8201806031159553: 20000,   // 2026-10-15 新炸坤高手 (second gift)
  8279096435227840: 20000,   // 2026-10-15 the owner, to try the hypercar
};
const giftHash = s => { let a = 0xdeadbeef, b = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return 4294967296 * (2097151 & b) + (a >>> 0); };

export function createProfile(store) {
  const fresh = () => ({ coins: 300, sel: 'gt', cars: { gt: { upg: { engine: 0, tires: 0, nitro: 0 }, paint: 0xc8102e, glow: 0 } }, paints: [0xc8102e, 0xe8e6e0, 0x16161a], glows: [0, 5], streak: { day: 0, n: 0 }, daily: { day: 0, tasks: [] } });
  let P = Object.assign(fresh(), store.get('nr-profile') || {});
  const save = () => store.set('nr-profile', P);
  const listeners = [];
  const changed = () => { save(); listeners.forEach(f => f(P)); };

  // a new day: fresh tasks; the login streak grows if yesterday was played too
  function newDay() {
    const d = today();
    let bonus = 0;
    if (P.streak.day !== d) {
      P.streak.n = dayIndex(d) - dayIndex(P.streak.day || d) === 1 ? P.streak.n + 1 : 1;
      P.streak.day = d; bonus = 50 + Math.min(7, P.streak.n) * 50; P.coins += bonus;
    }
    if (P.daily.day !== d) {
      let s = d; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const pool = TASKS.slice(), pick = [];
      while (pick.length < 3) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      P.daily = { day: d, tasks: pick.map(([id]) => ({ id, prog: 0, claimed: false })) };
    }
    save();
    return bonus;
  }
  const loginBonus = newDay();

  // retired cars: refund what they and their upgrades cost, and put the player back in the GT; price cuts: refund the difference
  const refund = { coins: 0, names: [] };
  for (const id of Object.keys(P.cars)) {
    if (CARS[id] || !RETIRED[id]) continue;
    let n = RETIRED[id].price;
    for (const lv of Object.values(P.cars[id].upg || {})) for (let l = 0; l < lv; l++) n += upgradeCost(id, l);
    refund.coins += n; refund.names.push(RETIRED[id].name); delete P.cars[id];
  }
  if (!CARS[P.sel]) P.sel = 'gt';
  P.priceCuts ||= {};
  for (const [id, was] of Object.entries(PRICE_CUTS)) if (P.cars[id] && !P.priceCuts[id]) { refund.coins += was - CARS[id].price; refund.names.push(CARS[id].name + '降价差价'); }
  for (const id of Object.keys(PRICE_CUTS)) P.priceCuts[id] = true;   // later buyers pay the new price, nothing to refund
  P.coins += refund.coins; save();

  const carOf = id => (P.cars[id] ||= { upg: { engine: 0, tires: 0, nitro: 0 }, paint: 0xc8102e, glow: 0 });
  // final stats of a car with its upgrades
  function statsOf(id = P.sel) {
    const base = { ...CARS[id].stats }, u = carOf(id).upg;
    for (const [k, U] of Object.entries(UPGRADES)) for (const [s, v] of Object.entries(U.per)) base[s] += v * (u[k] || 0);
    return base;
  }
  const taskDef = id => TASKS.find(t => t[0] === id);

  return {
    get data() { return P; }, loginBonus, refund, CARS, UPGRADES,
    onChange(f) { listeners.push(f); },
    carOf, statsOf, taskDef,
    selected() { return P.sel; },
    look(id = P.sel) { const c = carOf(id); return { model: id, paint: c.paint, glow: GLOWS[c.glow][1] }; },
    buyCar(id) { if (P.cars[id]) return false; if (P.coins < CARS[id].price) return false; P.coins -= CARS[id].price; carOf(id); P.sel = id; changed(); return true; },
    owns(id) { return !!P.cars[id]; },
    select(id) { if (!P.cars[id]) return false; P.sel = id; changed(); return true; },
    upgrade(kind) { const c = carOf(P.sel), lv = c.upg[kind] || 0; if (lv >= MAX_LEVEL) return false; const cost = upgradeCost(P.sel, lv); if (P.coins < cost) return false; P.coins -= cost; c.upg[kind] = lv + 1; changed(); return true; },
    paint(hex) { const p = PAINTS.find(x => x[1] === hex); if (!p) return false; if (!P.paints.includes(hex)) { if (P.coins < p[2]) return false; P.coins -= p[2]; P.paints.push(hex); } carOf(P.sel).paint = hex; changed(); return true; },
    glow(i) { if (!GLOWS[i]) return false; if (!P.glows.includes(i)) { if (P.coins < GLOWS[i][2]) return false; P.coins -= GLOWS[i][2]; P.glows.push(i); } carOf(P.sel).glow = i; changed(); return true; },
    // progress on today's tasks (completed ones pay out when claimed)
    task(id, n = 1) { newDay(); let hit = false; for (const t of P.daily.tasks) if (t.id === id && !t.claimed) { const tgt = taskDef(id)[2]; const was = t.prog >= tgt; t.prog = Math.min(tgt, t.prog + n); if (!was && t.prog >= tgt) hit = true; } save(); return hit; },
    claim(i) { const t = P.daily.tasks[i]; if (!t || t.claimed) return 0; const [, , tgt, reward] = taskDef(t.id); if (t.prog < tgt) return 0; t.claimed = true; P.coins += reward; changed(); return reward; },
    earn(n) { P.coins += Math.round(n); changed(); },
    // returns the coins paid, 0 if this browser already used the code, -1 if there is no such code
    redeem(code) {
      const h = giftHash(String(code).replace(/[^0-9a-z]/gi, '').toUpperCase()), amt = GIFTS[h];
      if (!amt) return -1;
      P.redeemed ||= [];
      if (P.redeemed.includes(h)) return 0;
      P.redeemed.push(h); P.coins += amt; changed(); return amt;
    },
  };
}
