// Game-portal hooks. Only the CrazyGames build (node build.mjs --crazygames, which sets __CG__) loads their SDK; it
// tells the portal when the game is loading and when gameplay runs or stops (ads and analytics key off these).
// Outside CrazyGames the SDK reports itself 'disabled' and every call here is a no-op.
let sdk = null, playing = false;
const call = f => { try { if (sdk) f(sdk.game); } catch (e) { console.warn('CrazyGames SDK', e); } };

let ready = null;
export function platformInit() { return ready || (ready = init()); }
async function init() {
  if (!__CG__) return;
  try {
    const S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return;
    await S.init();
    if (S.environment === 'crazygames' || S.environment === 'local') sdk = S;
  } catch (e) { console.warn('CrazyGames SDK init', e); }
}

export const platform = {
  loadingStart() { call(g => g.loadingStart()); },
  loadingStop() { call(g => g.loadingStop()); },
  gameplay(on) { if (on === playing) return; playing = on; call(g => (on ? g.gameplayStart() : g.gameplayStop())); },
};
