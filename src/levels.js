// 100 нива: няколко ръчно нарисувани + генератор със зададено „семе“,
// така че всяко ниво е винаги едно и също. Всяко ниво се проверява за
// достижимост; враговете се слагат само на места, до които драконът стига.
import { COLS, ROWS, TILE, LAST_LEVEL, WALL_L, WALL_R } from './consts.js';
import { reachable } from './physics.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EMPTY = '.'.repeat(28);
const mirror = (half) => half + [...half].reverse().join('');
const toFull = (s) => (s.length === 28 ? s : mirror(s.padEnd(14, '.').slice(0, 14)));

// „5:###...####“ – ред 5; „6-20:..##“ – редове от 6 до 20.
function parse(src, { ceil = '############..', floor } = {}) {
  const rows = Array(ROWS).fill(EMPTY);
  rows[0] = toFull(ceil);
  rows[ROWS - 1] = toFull(floor ?? ceil);
  for (const raw of src.trim().split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(':');
    const [a, b] = line.slice(0, i).split('-').map(Number);
    const pat = toFull(line.slice(i + 1));
    for (let r = a; r <= (b ?? a); r++) {
      // наслагване: '#' от новия шаблон се добавя към съществуващото
      rows[r] = [...rows[r]].map((ch, c) => (pat[c] === '#' ? '#' : ch)).join('');
    }
  }
  return rows;
}

const HAND = {
  1: parse(`
5:###...########
9:###...########
13:###...########
17:###...########
21:###...########`),
  2: parse(`
5:....########..
9:##..........##
13:....########..
17:##..........##
21:....########..`),
  3: parse(`
5:#########.....
9:.....#########
13:#########.....
17:.....#########
21:#########.....`),
  4: parse(`
5:.##..##..##...
9:...##..##..##.
13:.##..##..##...
17:...##..##..##.
21:.##..##..##...`),
  5: parse(`
6:...#......#...
7:...########...
11:##..........##
15:...#......#...
16:...########...
20:##....##....##`),
  6: parse(`
4:....####......
5:...#....#.....
8:..........####
12:##..######....
16:......####....
17:..........##..
21:###.......####`),
  7: parse(`
5:......########
6-10:......#.....
9:###...........
13:....######....
14-17:....#.......
17:##............
21:.....#########`, { ceil: '##############', floor: '############..' }),
  8: parse(`
5:#.............
6:.#............
7:..#...........
8:...#..........
9:....#.........
10:.....#........
11:......#.......
12:.......#......
13:........#.....
14:.........#....
15:..........#...
16:...........#..
17:############..
21:...######.....`),
  9: parse(`
5:..##########..
9:..#.........#.
13:..#.#######...
17:..#.........#.
21:..###########.`),
  10: parse(`
4:.........#####
8:####..........
10:.......####...
14:##...........#
18:.....#####....
22:##............`),
  11: parse(`
5:.#.#.#.#.#.#.#
9:#.#.#.#.#.#.#.
13:.#.#.#.#.#.#.#
17:#.#.#.#.#.#.#.
21:.#.#.#.#.#.#.#`),
  12: parse(`
4:...####...####
7:##............
10:...####...####
13:##............
16:...####...####
19:##............
22:...####...####`),
  // Последното ниво – шефът
  100: parse(`
6:....######....
11:##..........##
16:....######....
21:##..........##`, { ceil: '##############', floor: '##############' }),
};

// ─── Генератор ─────────────────────────────────────────────
function genHalfRow(R, kind) {
  const a = Array(14).fill('.');
  const set = (from, to) => { for (let c = Math.max(0, from); c <= Math.min(13, to); c++) a[c] = '#'; };
  switch (kind) {
    case 0: { // до стената + средно парче
      const w = 2 + Math.floor(R() * 4);
      set(0, w - 1);
      const s = w + 2 + Math.floor(R() * 3);
      set(s, 13 - (R() < 0.5 ? Math.floor(R() * 3) : 0));
      break;
    }
    case 1: { // малки островчета
      let c = Math.floor(R() * 3);
      const pw = 2 + Math.floor(R() * 2), gap = 1 + Math.floor(R() * 3);
      while (c < 14) { set(c, c + pw - 1); c += pw + gap; }
      break;
    }
    case 2: { // само в средата
      set(3 + Math.floor(R() * 6), 13);
      break;
    }
    case 3: { // само до стената
      set(0, 4 + Math.floor(R() * 6));
      break;
    }
    case 4: { // дълго, с дупка в средата
      set(0, 9 + Math.floor(R() * 3));
      break;
    }
    case 5: { // рамка „чашка“
      const s = 2 + Math.floor(R() * 5);
      set(s, 13);
      break;
    }
    default: { // парче по средата на половината
      const s = 2 + Math.floor(R() * 4);
      set(s, s + 3 + Math.floor(R() * 4));
    }
  }
  return a.join('');
}

function generate(n, attempt = 0) {
  const R = rng(n * 7919 + 13 + attempt * 100003);
  const rows = Array(ROWS).fill(EMPTY);
  const gapKinds = ['############..', '############..', '##########....', '####....######', '##############'];
  const cf = gapKinds[Math.floor(R() * gapKinds.length)];
  rows[0] = toFull(cf);
  rows[ROWS - 1] = toFull(cf === '##############' ? '############..' : cf);
  const spacing = R() < 0.3 ? 3 : 4;
  const style = Math.floor(R() * 4);
  if (style === 3 && R() < 0.6) {
    // стълби по диагонал
    const start = 4 + Math.floor(R() * 3);
    const len = 8 + Math.floor(R() * 5);
    for (let i = 0; i < len; i++) {
      const r = start + i;
      if (r >= ROWS - 3) break;
      rows[r] = toFull('.'.repeat(i % 14) + '##');
    }
    for (let r = ROWS - 1 - spacing; r > start + len; r -= spacing) rows[r] = toFull(genHalfRow(R, Math.floor(R() * 7)));
  } else {
    let prevKind = -1;
    for (let r = ROWS - 1 - spacing; r >= 4; r -= spacing) {
      let kind = style === 0 ? Math.floor(R() * 7) : (style === 1 ? (R() < 0.7 ? prevKind : Math.floor(R() * 7)) : Math.floor(R() * 7));
      if (kind < 0) kind = Math.floor(R() * 7);
      prevKind = kind;
      rows[r] = toFull(genHalfRow(R, kind));
    }
    // понякога вертикални колони за украса
    if (R() < 0.35) {
      const c = 3 + Math.floor(R() * 8);
      const r0 = 4 + Math.floor(R() * 4), r1 = r0 + 4 + Math.floor(R() * 8);
      for (let r = r0; r <= r1 && r < ROWS - 2; r++) {
        const half = [...rows[r].slice(0, 14)];
        half[c] = '#';
        rows[r] = toFull(half.join(''));
      }
    }
  }
  return rows;
}

// ─── Класът Level ─────────────────────────────────────────
const PALETTES = [
  ['#ff88b8', '#ffd0e8', '#a03060'],
  ['#50b8ff', '#b0e8ff', '#2060a0'],
  ['#ffb830', '#fff0a0', '#a06000'],
  ['#60d050', '#c0ffb0', '#207830'],
  ['#c078ff', '#ecd0ff', '#6030a0'],
  ['#ff6850', '#ffc0b0', '#a02820'],
  ['#e8e040', '#ffffb0', '#908000'],
  ['#40d8d0', '#c0fff8', '#207070'],
  ['#b8b8c8', '#ffffff', '#606078'],
  ['#ff9050', '#ffe0c0', '#a04010'],
];

const ENEMY_TABLE = [
  // [до ниво, видове]
  [4, ['windup']],
  [10, ['windup', 'windup', 'spring']],
  [18, ['windup', 'spring', 'prop']],
  [28, ['ghost', 'windup', 'spring']],
  [38, ['wizard', 'ghost', 'windup']],
  [50, ['fire', 'wizard', 'prop']],
  [65, ['fire', 'spring', 'ghost', 'wizard']],
  [80, ['prop', 'fire', 'wizard', 'ghost', 'windup']],
  [99, ['windup', 'spring', 'ghost', 'wizard', 'fire', 'prop']],
];

export class Level {
  constructor(n, rows = levelRows(n)) {
    this.n = n;
    this.grid = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      const full = '##' + rows[r] + '##';
      for (let c = 0; c < COLS; c++) this.grid[r * COLS + c] = full[c] === '#' ? 1 : 0;
    }
    this.palette = PALETTES[(n - 1) % PALETTES.length];
    this.tileStyle = Math.floor((n - 1) / PALETTES.length) % 4;
    this.boss = n === LAST_LEVEL;
    const R = rng(n * 31 + 7);
    this.R = R;
    this.airX = WALL_L + 40 + Math.floor(R() * (WALL_R - WALL_L - 80));
    if (n % 3 === 0) this.airX = 128;
    this.special = this.boss ? null : n % 9 === 4 ? 'water' : n % 7 === 3 ? 'lightning' : n % 11 === 6 ? 'fire' : null;
    this.hurryTime = Math.max(22, 36 - Math.floor(n / 8)) * 60;
  }

  solid(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= ROWS) return false;
    return this.grid[r * COLS + c] === 1;
  }

  solidSpan(r, x0, x1) {
    for (let c = Math.floor(x0 / TILE); c <= Math.floor(x1 / TILE); c++) if (this.solid(c, r)) return true;
    return false;
  }

  // Може ли да се стъпи на реда r (плътно отгоре и празно над него)?
  topSpan(r, x0, x1) {
    for (let c = Math.floor(x0 / TILE); c <= Math.floor(x1 / TILE); c++) {
      if (this.solid(c, r) && (c < 2 || c >= COLS - 2 || !this.solid(c, r - 1))) return true;
    }
    return false;
  }

  startPos(p) {
    return { x: p === 0 ? WALL_L + 8 : WALL_R - 24, y: (ROWS - 1) * TILE - 16 };
  }

  // Изчислява местата на враговете (детерминирано).
  enemySpawns() {
    const n = this.n;
    if (this.boss) return [];
    const R = rng(n * 131 + 3);
    const s = this.startPos(0);
    const reach = reachCache.get(n) || reachable(this, s.x, s.y);
    reachCache.set(n, reach);
    this.reach = reach;
    let types = ENEMY_TABLE.find(([lim]) => n <= lim)[1];
    const count = Math.min(8, 3 + Math.floor(n / 9) + (n % 5 === 0 ? 1 : 0));
    const cells = [...reach].map(k => k.split(':').map(Number))
      .filter(([r, c]) => r < ROWS - 1 && c >= 3 && c <= COLS - 4)
      .filter(([r, c]) => r < ROWS - 9 || (c > 8 && c < COLS - 9)); // не точно над началните места
    const floorCells = [...reach].map(k => k.split(':').map(Number))
      .filter(([r, c]) => r === ROWS - 1 && c >= 8 && c <= COLS - 9);
    const out = [];
    const used = [];
    const pickCell = (list) => {
      for (let tries = 0; tries < 60 && list.length; tries++) {
        const [r, c] = list[Math.floor(R() * list.length)];
        if (used.every(([ur, uc]) => ur !== r || Math.abs(uc - c) >= 3)) { used.push([r, c]); return [r, c]; }
      }
      return null;
    };
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(R() * types.length)];
      const cell = pickCell(cells) || pickCell(floorCells) || [ROWS - 1, 10 + i * 2];
      const [r, c] = cell;
      let x = c * TILE - 4, y = r * TILE - 16;
      if (type === 'ghost' || type === 'prop') y -= 8 + Math.floor(R() * 16);
      out.push({ type, x: Math.max(WALL_L, Math.min(WALL_R - 16, x)), y });
    }
    return out;
  }
}

// Проверка на ниво: стига ли се до всички платформи и до горната част?
export function checkRows(n, rows) {
  const L = new Level(n, rows);
  const s = L.startPos(0);
  const reach = reachable(L, s.x, s.y);
  const reachedRows = new Set([...reach].map(k => Number(k.split(':')[0])));
  let top = Math.min(...reachedRows);
  const platRows = new Set();
  for (let r = 1; r < ROWS - 1; r++) for (let c = 2; c < COLS - 2; c++) if (L.solid(c, r) && !L.solid(c, r - 1)) platRows.add(r);
  const unreached = [...platRows].filter(r => !reachedRows.has(r));
  return { n, top, unreached, reach, ok: top <= 7 && unreached.length === 0 };
}

const rowsCache = new Map();
const reachCache = new Map();
export function levelRows(n) {
  if (HAND[n]) return HAND[n];
  if (n % 17 === 0) return HAND[((n / 17) % 12) + 1];
  if (rowsCache.has(n)) return rowsCache.get(n);
  let rows = null;
  for (let a = 0; a < 30 && !rows; a++) {
    const cand = generate(n, a);
    const res = checkRows(n, cand);
    if (res.ok) { rows = cand; reachCache.set(n, res.reach); }
  }
  rows = rows || HAND[(n % 12) + 1];
  rowsCache.set(n, rows);
  return rows;
}
