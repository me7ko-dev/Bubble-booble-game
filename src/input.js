// Клавиатура, геймпад и сензорни бутони → състояние за всеки играч.
const down = new Set();
const pressedOnce = new Set();

const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter']);

addEventListener('keydown', (e) => {
  if (BLOCK.has(e.code)) e.preventDefault();
  if (!down.has(e.code)) pressedOnce.add(e.code);
  down.add(e.code);
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

// Сензорни бутони (само за 1-ви играч)
export const touch = { left: false, right: false, jump: false, fire: false, start: false };
// кратко докосване между два кадъра също се брои
export const touchTap = { left: false, right: false, jump: false, fire: false };

export function keyHit(...codes) {
  return codes.some(c => pressedOnce.has(c));
}

const MAP = {
  // 1-ви играч: A/D, W – скок, Space/F – балонче
  p1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], fire: ['Space', 'KeyF'] },
  // 1-ви играч, когато играе сам: и стрелките, Z/X
  p1solo: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp', 'KeyX'], fire: ['KeyZ', 'Enter'] },
  // 2-ри играч: стрелки, ↑ – скок, Enter / Right Ctrl / L – балонче
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], fire: ['Enter', 'NumpadEnter', 'ControlRight', 'KeyL', 'Numpad0'] },
};

const prev = [{}, {}];

function pad(i) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const list = [...pads].filter(Boolean);
  return list[i] || null;
}

// натиснат сега или натиснат и пуснат между два кадъра (кратко почукване)
function any(codes) { return codes.some(c => down.has(c) || pressedOnce.has(c)); }

// solo = true → 2-ри играч не е в игра и 1-ви може да ползва и стрелките
export function readPlayer(i, solo) {
  const s = { left: false, right: false, jump: false, fire: false, start: false };
  const maps = i === 0 ? (solo ? [MAP.p1, MAP.p1solo] : [MAP.p1]) : [MAP.p2];
  for (const m of maps) {
    s.left ||= any(m.left);
    s.right ||= any(m.right);
    s.jump ||= any(m.jump);
    s.fire ||= any(m.fire);
  }
  const gp = pad(i);
  if (gp) {
    const b = (k) => gp.buttons[k] && gp.buttons[k].pressed;
    const ax = gp.axes[0] || 0;
    s.left ||= ax < -0.4 || b(14);
    s.right ||= ax > 0.4 || b(15);
    s.jump ||= b(0) || b(12);
    s.fire ||= b(1) || b(2) || b(3);
    s.start ||= b(9);
  }
  if (i === 0) {
    s.left ||= touch.left || touchTap.left; s.right ||= touch.right || touchTap.right;
    s.jump ||= touch.jump || touchTap.jump; s.fire ||= touch.fire || touchTap.fire;
    s.start ||= touch.start;
  }
  const p = prev[i];
  s.jumpHit = s.jump && !p.jump;
  s.fireHit = s.fire && !p.fire;
  s.startHit = s.start && !p.start;
  prev[i] = { jump: s.jump, fire: s.fire, start: s.start };
  return s;
}

export function endFrame() {
  pressedOnce.clear();
  touch.start = false;
  for (const k in touchTap) touchTap[k] = false;
}
