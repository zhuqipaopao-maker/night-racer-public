import { CARS, UPGRADES, MAX_LEVEL, PAINTS, GLOWS, upgradeCost } from './profile.js';

// 车库: buy / pick a car, upgrade it, paint it, pick its underglow, and collect daily task rewards.
export function openGarage(profile, { onClose }) {
  const root = document.getElementById('garage');
  const startLook = JSON.stringify(profile.look());
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let msg = '';
  const fail = t => { msg = t; render(); };

  function render() {
    const P = profile.data, sel = P.sel;
    root.replaceChildren();
    const box = el('div', 'gbox');
    const h = el('h2'); h.append(el('span', null, '车库'), el('span', 'coins', `🪙 ${P.coins}`));
    const close = el('button', 'ghostbtn', '完成 ✓'); close.onclick = () => { root.hidden = true; onClose(JSON.stringify(profile.look()) !== startLook); };
    h.append(close); box.append(h);
    box.append(el('div', 'gd', '改装只在「改装组」生效；标准组里大家的车性能一样，只有外观不同。'));

    // cars
    box.append(el('h3', null, '车辆'));
    const grid = el('div', 'gcars');
    for (const [id, C] of Object.entries(CARS)) {
      const own = profile.owns(id), b = el('button', 'gcar'); b.setAttribute('aria-pressed', String(id === sel));
      b.append(el('b', null, C.name), el('div', 'gd', C.desc));
      const st = own ? profile.statsOf(id) : C.stats;
      for (const [k, label] of [['top', '极速'], ['accel', '加速'], ['grip', '操控'], ['nitro', '氮气']]) {
        const row = el('div', 'gbar'); row.append(el('span', null, label)); const bar = el('i'); bar.style.width = `${Math.max(8, Math.min(100, (st[k] - 0.8) / 0.55 * 100))}%`; row.append(bar); b.append(row);
      }
      b.append(el('div', 'gd', own ? (id === sel ? '✓ 正在使用' : '点击换上') : `🪙 ${C.price} 购买`));
      b.onclick = () => {
        if (own) { profile.select(id); msg = ''; render(); return; }
        if (P.coins < C.price) return fail(`金币不够，还差 ${C.price - P.coins}。`);
        profile.buyCar(id); msg = ''; render();
      };
      grid.append(b);
    }
    box.append(grid);

    // upgrades
    box.append(el('h3', null, `升级 · ${CARS[sel].name}`));
    const upg = profile.carOf(sel).upg;
    for (const [k, U] of Object.entries(UPGRADES)) {
      const row = el('div', 'gup'), lv = upg[k] || 0;
      row.append(el('span', null, `${U.name}（${U.desc}）`));
      const pips = el('div', 'gpips'); for (let i = 0; i < MAX_LEVEL; i++) pips.append(el('span', i < lv ? 'on' : ''));
      row.append(pips);
      const btn = el('button', 'ghostbtn', lv >= MAX_LEVEL ? '已满级' : `升级 🪙 ${upgradeCost(sel, lv)}`);
      btn.disabled = lv >= MAX_LEVEL;
      btn.onclick = () => { const c = upgradeCost(sel, lv); if (P.coins < c) return fail(`金币不够，还差 ${c - P.coins}。`); profile.upgrade(k); msg = ''; render(); };
      row.append(btn); box.append(row);
    }

    // paint
    box.append(el('h3', null, '车漆'));
    const sw = el('div', 'gsw');
    for (const [name, hex, price] of PAINTS) {
      const b = el('button'); b.title = name; b.style.background = '#' + hex.toString(16).padStart(6, '0');
      b.setAttribute('aria-pressed', String(profile.carOf(sel).paint === hex));
      if (!P.paints.includes(hex)) b.append(el('span', 'pr', `🪙${price}`));
      b.onclick = () => { if (!P.paints.includes(hex) && P.coins < price) return fail(`金币不够，还差 ${price - P.coins}。`); profile.paint(hex); msg = ''; render(); };
      sw.append(b);
    }
    box.append(sw);

    // underglow
    box.append(el('h3', null, '底盘灯'));
    const gw = el('div', 'gsw');
    GLOWS.forEach(([name, css, price], i) => {
      const b = el('button'); b.title = name; b.style.background = i === 5 ? '#222' : css; b.append(el('span', 'pr', P.glows.includes(i) ? name : `🪙${price}`));
      b.setAttribute('aria-pressed', String(profile.carOf(sel).glow === i));
      b.onclick = () => { if (!P.glows.includes(i) && P.coins < price) return fail(`金币不够，还差 ${price - P.coins}。`); profile.glow(i); msg = ''; render(); };
      gw.append(b);
    });
    box.append(gw);

    // daily tasks
    box.append(el('h3', null, `每日任务 · 连续登录 ${P.streak.n} 天`));
    P.daily.tasks.forEach((t, i) => {
      const [, text, tgt, reward] = profile.taskDef(t.id), row = el('div', 'gtask'), left = el('div');
      left.append(el('div', null, text), el('div', 'gp', `${Math.min(t.prog, tgt)} / ${tgt} · 奖励 🪙 ${reward}`));
      const b = el('button', t.claimed ? 'ghostbtn' : t.prog >= tgt ? 'go' : 'ghostbtn', t.claimed ? '已领取' : t.prog >= tgt ? '领取 ▸' : '进行中');
      b.disabled = t.claimed || t.prog < tgt;
      b.onclick = () => { profile.claim(i); render(); };
      row.append(left, b); box.append(row);
    });
    box.append(el('div', 'gd', '赚金币：比赛名次、漂移、腾空、用氮气、刷新最快圈都有奖励；计时赛每跑一圈也给。'));
    box.append(el('div', 'gmsg', msg));
    root.append(box);
  }
  root.hidden = false;
  render();
}
