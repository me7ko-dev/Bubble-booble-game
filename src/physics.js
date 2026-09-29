// Обща физика за всички „ходещи“ тела (дракончета, врагове, плодове).
// Вътрешните блокове са платформи „отдолу-нагоре“: минава се през тях
// нагоре и настрани, а се стъпва отгоре. Страничните стени са плътни.
import { TILE, ROWS, FIELD_H, GRAVITY, MAX_FALL, JUMP_V, WALL_L, WALL_R } from './consts.js';

export function stepBody(b, lvl, grav = GRAVITY, maxFall = MAX_FALL) {
  const prevBottom = b.y + b.h;
  b.vy = Math.min(b.vy + grav, maxFall);
  b.y += b.vy;
  b.onGround = false;
  if (b.vy >= 0) {
    const bottom = b.y + b.h;
    for (let r = Math.ceil(prevBottom / TILE - 1e-4); r * TILE <= bottom + 1e-4; r++) {
      if (r >= 1 && r < ROWS && lvl.topSpan(r, b.x + b.fx0, b.x + b.fx1)) {
        b.y = r * TILE - b.h;
        b.vy = 0;
        b.onGround = true;
        break;
      }
    }
  } else if (b.y < TILE) {
    b.y = TILE;
    b.vy = 0;
  }
  if (b.y >= FIELD_H) b.y -= FIELD_H + b.h; // пропада през пода → отгоре
}

export function clampX(b) {
  if (b.x < WALL_L) { b.x = WALL_L; return -1; }
  if (b.x > WALL_R - b.w) { b.x = WALL_R - b.w; return 1; }
  return 0;
}

// Има ли земя точно под тялото, ако е изместено с dx?
export function groundBelow(b, lvl, dx = 0) {
  const bottom = b.y + b.h;
  const r = Math.round(bottom / TILE);
  if (Math.abs(r * TILE - bottom) > 0.5 || r < 1 || r >= ROWS) return false;
  return lvl.topSpan(r, b.x + dx + b.fx0, b.x + dx + b.fx1);
}

// ─── Достижимост (за проверка на нивата и за поставяне на врагове) ───
// Симулира скокове и падания на дракон от всяко достигнато място.
const PW = 16, PH = 16, FX0 = 3, FX1 = 12;

function simulate(lvl, x, y, dir, holdFrames, jump, speed) {
  const b = { x, y, w: PW, h: PH, fx0: FX0, fx1: FX1, vy: jump ? JUMP_V : 0, onGround: false };
  let wraps = 0;
  for (let f = 0; f < 400; f++) {
    if (f < holdFrames) b.x += dir * speed;
    clampX(b);
    const oy = b.y;
    stepBody(b, lvl);
    if (b.y < oy - 100) { if (++wraps > 2) return null; }
    if (b.onGround && f > 0 && (jump || Math.abs(b.y - y) > 1)) return { x: b.x, y: b.y };
  }
  return null;
}

// Връща Set от ключове "row:col" – платформени клетки, на които драконът може да стъпи.
export function reachable(lvl, startX, startY, speed = 1) {
  const seen = new Set();
  const out = new Set();
  const queue = [[startX, startY]];
  const key = (x, y) => `${Math.round(x / 4)}:${Math.round(y)}`;
  seen.add(key(startX, startY));
  while (queue.length) {
    const [x, y] = queue.shift();
    const row = Math.round((y + PH) / TILE);
    // всички клетки, на които стоим, като се разхождаме наляво/надясно
    const cells = [];
    for (const dir of [-1, 1]) {
      let cx = x;
      while (true) {
        const b = { x: cx, y, w: PW, h: PH, fx0: FX0, fx1: FX1 };
        if (!groundBelow(b, lvl)) break;
        cells.push(cx);
        const nx = cx + dir * 2;
        if (nx < WALL_L || nx > WALL_R - PW) break;
        cx = nx;
      }
    }
    for (const cx of cells) {
      out.add(`${row}:${Math.floor((cx + 8) / TILE)}`);
    }
    const tryAdd = (p) => {
      if (!p) return;
      const k = key(p.x, p.y);
      if (!seen.has(k)) { seen.add(k); queue.push([p.x, p.y]); }
    };
    // скокове от няколко точки по платформата
    const step = Math.max(1, Math.floor(cells.length / 10));
    for (let i = 0; i < cells.length; i += step) {
      const cx = cells[i];
      for (const dir of [-1, 0, 1]) {
        for (const hold of dir === 0 ? [0] : [10, 25, 45, 400]) {
          tryAdd(simulate(lvl, cx, y, dir, hold, true, speed));
        }
      }
    }
    // падане от ръбовете
    const minX = Math.min(...cells), maxX = Math.max(...cells);
    for (const [ex, dir] of [[minX, -1], [maxX, 1]]) {
      for (const hold of [12, 30, 400]) tryAdd(simulate(lvl, ex, y, dir, hold, false, speed));
    }
  }
  return out;
}
