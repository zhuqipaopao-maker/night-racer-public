// CrazyGames build entry. Progress (coins, cars, best laps, ghosts, settings: every 'nr-' key the game keeps in
// localStorage) is saved through the SDK's data module, so it follows the player's CrazyGames account across devices.
// Before the game starts, the saved copy is written back into localStorage; afterwards every change to an 'nr-' key is
// mirrored into one SDK item. The game itself keeps using localStorage as before.
import { platformInit } from './platform.js';

const KEY = 'nr-save';
(async () => {
await platformInit();
const S = window.CrazyGames && window.CrazyGames.SDK;
const data = S && (S.environment === 'crazygames' || S.environment === 'local') ? S.data : null;
if (data) {
  try {
    const raw = data.getItem(KEY);   // the SDK may hand back the stored JSON already parsed
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (saved) for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v);
  } catch (e) { console.warn('restore progress', e); }
  let timer = 0;
  const flush = () => {
    timer = 0;
    const all = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('nr-')) all[k] = localStorage.getItem(k); }
    try { data.setItem(KEY, JSON.stringify(all)); } catch (e) { console.warn('save progress', e); }
  };
  const later = k => { if (String(k).startsWith('nr-') && !timer) timer = setTimeout(flush, 800); };
  const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) { set.call(this, k, v); if (this === localStorage) later(k); };
  Storage.prototype.removeItem = function (k) { remove.call(this, k); if (this === localStorage) later(k); };
}
await import('./main.js');
})();
