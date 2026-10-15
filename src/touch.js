// On-screen controls for phones/tablets. Buttons feed the same `keys` set the keyboard uses;
// the steering pad is analog (finger distance from its centre).
export const isTouchDevice = (() => {
  try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
})();

// keep receiving a finger's events even if it slides off the control; harmless if capture is refused
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch {} };

export function setupTouch({ keys, onPause, rotated = () => false }) {
  const root = document.getElementById('touch');
  const pad = document.getElementById('steer'), knob = pad.querySelector('.knob');
  const state = { steer: 0 };
  let steerId = null;
  const update = e => {
    const r = pad.getBoundingClientRect();
    // when the game is drawn rotated 90°, the pad's left→right runs down the physical screen
    const rot = rotated(), w = rot ? r.height : r.width;
    let v = rot ? (e.clientY - (r.top + r.height / 2)) / (w * 0.38) : (e.clientX - (r.left + r.width / 2)) / (w * 0.38);
    v = Math.max(-1, Math.min(1, v));
    if (Math.abs(v) < 0.1) v = 0;
    state.steer = v;
    knob.style.transform = `translateX(${v * w * 0.36}px)`;
  };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); steerId = e.pointerId; capture(pad, e); pad.classList.add('on'); update(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === steerId) update(e); });
  const release = e => { if (e.pointerId !== steerId) return; steerId = null; state.steer = 0; knob.style.transform = ''; pad.classList.remove('on'); };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);

  root.querySelectorAll('[data-key]').forEach(b => {
    const code = b.dataset.key, held = new Set();
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); capture(b, e); held.add(e.pointerId);
      keys.add(code); b.classList.add('on');
      try { navigator.vibrate && navigator.vibrate(10); } catch {}
    });
    const up = e => { held.delete(e.pointerId); if (!held.size) { keys.delete(code); b.classList.remove('on'); } };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  });
  document.getElementById('pausebtn').addEventListener('click', onPause);

  // no pinch-zoom, double-tap zoom, long-press menus or scrolling while playing
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scrollable')) e.preventDefault(); }, { passive: false });
  return state;
}
