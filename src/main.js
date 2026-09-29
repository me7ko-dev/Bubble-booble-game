// Начало: цикъл на играта, начален екран, финал, пауза, мащабиране.
import { W, H, LAST_LEVEL } from './consts.js';
import { buildSprites, SPR } from './sprites.js';
import { drawText } from './font.js';
import { readPlayer, keyHit, endFrame, touch, touchTap } from './input.js';
import { initAudio, playMusic, stopMusic, toggleMute, isMuted, sfx } from './audio.js';
import { Game } from './game.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

buildSprites();

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};

let hiScore = store.get('balon-hi', 50000);
let maxReached = store.get('balon-max', 1);
let mode = 'title';
let game = null;
let paused = false;
let startIdx = 0;
let frame = 0;
let endingT = 0;
let endingInfo = null;

// Рундове, от които може да се започне: 1, 11, 21… до най-далечния достигнат.
function startOptions() {
  const opts = [1];
  for (let n = 11; n <= Math.min(maxReached, LAST_LEVEL); n += 10) opts.push(n);
  if (maxReached >= LAST_LEVEL) opts.push(LAST_LEVEL);
  return [...new Set(opts)];
}

// ─── Мащабиране на екрана ────────────────────────────────
function fit() {
  const wrap = document.getElementById('wrap');
  const pad = document.getElementById('pad');
  const padH = pad && getComputedStyle(pad).display !== 'none' ? pad.offsetHeight : 0;
  const availW = wrap.clientWidth, availH = window.innerHeight - padH - 8;
  let s = Math.min(availW / W, availH / H);
  if (s >= 2) s = Math.floor(s);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
addEventListener('resize', fit);
fit();

// ─── Сензорни бутони ──────────────────────────────────────
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
fit();
for (const btn of document.querySelectorAll('[data-k]')) {
  const k = btn.dataset.k;
  const on = (e) => { e.preventDefault(); initAudio(); touch[k] = true; touchTap[k] = true; btn.classList.add('on'); };
  const off = (e) => { e.preventDefault(); touch[k] = false; btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
}
canvas.addEventListener('pointerdown', () => { initAudio(); touch.start = true; if (mode === 'title') playMusic('title'); });
document.getElementById('btn-pause')?.addEventListener('click', () => togglePause());
document.getElementById('btn-mute')?.addEventListener('click', (e) => { initAudio(); e.currentTarget.textContent = toggleMute() ? '🔇' : '🔊'; });
const muteBtn = document.getElementById('btn-mute');
if (muteBtn) muteBtn.textContent = isMuted() ? '🔇' : '🔊';

addEventListener('keydown', () => { initAudio(); if (mode === 'title') playMusic('title'); }, { once: false });

function togglePause() {
  if (mode !== 'game') return;
  paused = !paused;
  sfx.pause();
}

// ─── Цикъл с фиксирана стъпка 60 кадъра/сек ─────────────
let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;

function loop(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= STEP) {
    update();
    acc -= STEP;
  }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update() {
  frame++;
  if (keyHit('KeyM')) { const m = toggleMute(); if (muteBtn) muteBtn.textContent = m ? '🔇' : '🔊'; }
  if (keyHit('KeyP', 'Escape')) togglePause();
  if (mode === 'title') updateTitle();
  else if (mode === 'game') {
    if (!paused) {
      const solo = game.solo;
      const inputs = [readPlayer(0, solo), readPlayer(1, false)];
      inputs[0].joinHit = keyHit('Digit1', 'Numpad1') || inputs[0].startHit || (game.players[0].state === 'out' && (touch.start || inputs[0].fireHit));
      inputs[1].joinHit = keyHit('Digit2', 'Numpad2') || inputs[1].startHit;
      game.update(inputs);
      if (game.hiScore > hiScore) { hiScore = game.hiScore; }
      if (game.maxReached > maxReached) { maxReached = game.maxReached; store.set('balon-max', maxReached); }
      if (game.finished) finishGame();
    }
  } else if (mode === 'ending') updateEnding();
  endFrame();
}

function finishGame() {
  store.set('balon-hi', hiScore);
  if (game.finished === 'ending') {
    const both = game.players.every(p => p.everJoined !== false && p.state !== 'out') && game.players[1].everJoined;
    endingInfo = { scores: game.players.map(p => p.score), both };
    mode = 'ending';
    endingT = 0;
    playMusic('ending');
    maxReached = LAST_LEVEL;
    store.set('balon-max', maxReached);
  } else {
    mode = 'title';
    playMusic('title');
  }
  game = null;
}

function startGame(players) {
  initAudio();
  sfx.start();
  const opts = startOptions();
  const q = Number(new URLSearchParams(location.search).get('round'));
  const first = q >= 1 && q <= LAST_LEVEL ? Math.floor(q) : opts[Math.min(startIdx, opts.length - 1)];
  game = new Game(players, first, hiScore);
  mode = 'game';
  paused = false;
}

// ─── Начален екран ───────────────────────────────────────
const titleBubbles = Array.from({ length: 14 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, s: 0.3 + Math.random() * 0.6, k: i % 2 }));

function updateTitle() {
  const i0 = readPlayer(0, true), i1 = readPlayer(1, false);
  const opts = startOptions();
  if (keyHit('ArrowLeft', 'KeyA')) { startIdx = (startIdx + opts.length - 1) % opts.length; sfx.select(); }
  if (keyHit('ArrowRight', 'KeyD')) { startIdx = (startIdx + 1) % opts.length; sfx.select(); }
  if (keyHit('Digit2', 'Numpad2') || i1.startHit) startGame(2);
  else if (keyHit('Digit1', 'Numpad1', 'Enter', 'Space') || i0.startHit || i0.fireHit || touch.start) startGame(1);
  for (const b of titleBubbles) { b.y -= b.s; if (b.y < -16) { b.y = H + 16; b.x = Math.random() * W; } }
}

const TITLE = 'БАЛОНЧЕТАТА';
const TITLE_COLORS = ['#ff5050', '#ff9020', '#ffe040', '#60e060', '#40c0ff', '#b070ff'];

function drawTitle() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.45;
  for (const b of titleBubbles) ctx.drawImage(b.k ? SPR.bubble.p2 : SPR.bubble.p1, Math.round(b.x), Math.round(b.y));
  ctx.globalAlpha = 1;
  // заглавие с подскачащи букви
  const scale = 2, cw = 12;
  const x0 = W / 2 - (TITLE.length * cw) / 2;
  for (let i = 0; i < TITLE.length; i++) {
    const y = 22 + Math.round(Math.sin(frame / 10 + i * 0.6) * 3);
    drawText(ctx, TITLE[i], x0 + i * cw, y, TITLE_COLORS[i % TITLE_COLORS.length], { scale, shadow: '#402060' });
  }
  drawText(ctx, 'ДВЕ ДРАКОНЧЕТА И 100 РУНДА БАЛОНИ', W / 2, 44, '#ffffff', { align: 'center' });

  // дракончетата
  const walk = (frame >> 3) % 2;
  const p1 = walk ? SPR.p1.walk : SPR.p1.stand, p2 = walk ? SPR.p2.walk : SPR.p2.stand;
  ctx.drawImage(p1.r, 70, 58);
  ctx.drawImage(p2.l, 170, 58);
  ctx.drawImage(SPR.enemies.windup.frames[walk].l, 120, 58 + Math.round(Math.sin(frame / 12) * 2));
  ctx.drawImage(SPR.bubble.p1, 120, 58 + Math.round(Math.sin(frame / 12) * 2));

  const blink = (frame >> 5) % 2;
  if (blink) drawText(ctx, isTouch ? 'ДОКОСНИ ЕКРАНА ЗА СТАРТ' : 'НАТИСНИ 1 ИЛИ 2', W / 2, 84, '#ffe040', { align: 'center' });
  drawText(ctx, '1 – ЕДИН ИГРАЧ     2 – ДВАМА ИГРАЧИ', W / 2, 98, '#fff', { align: 'center' });

  const opts = startOptions();
  if (opts.length > 1) {
    drawText(ctx, `← ПЪРВИ РУНД: ${opts[Math.min(startIdx, opts.length - 1)]} →`, W / 2, 112, '#40e0e0', { align: 'center' });
  }

  let y = 128;
  const line = (a, b, c) => { drawText(ctx, a, 12, y, c); drawText(ctx, b, 64, y, '#ddd'); y += 10; };
  line('ИГРАЧ 1', 'A D ХОДИ  W СКОК  SPACE БАЛОН', '#40e040');
  line('ИГРАЧ 2', '← → ХОДИ  ↑ СКОК  ENTER БАЛОН', '#40a0ff');
  line('САМ', 'ИЛИ ← → ↑   Z БАЛОН   X СКОК', '#40e040');
  line('ОЩЕ', 'P ПАУЗА   M ЗВУК   + ГЕЙМПАД', '#ffe040');
  y += 4;
  drawText(ctx, 'ХВАНИ ВРАГА В БАЛОН И ГО ПУКНИ!', W / 2, y, '#ff78c8', { align: 'center' });
  drawText(ctx, 'ДРЪЖ СКОК, ЗА ДА ПОДСКАЧАШ ПО БАЛОНИ', W / 2, y + 10, '#ff78c8', { align: 'center' });
  drawText(ctx, `РЕКОРД ${hiScore}`, W / 2, H - 12, '#ff5050', { align: 'center' });
}

// ─── Финал ───────────────────────────────────────────────
const ENDING_TEXT = [
  ['ПОБЕДА!', '#ffe040'], ['', ''],
  ['ЗЛИЯТ БАЛОНЕН КРАЛ Е ПОБЕДЕН', '#fff'],
  ['И ПЕЩЕРАТА НА БАЛОНИТЕ', '#fff'],
  ['ОТНОВО Е СВОБОДНА.', '#fff'], ['', ''],
];

function updateEnding() {
  endingT++;
  const i0 = readPlayer(0, true), i1 = readPlayer(1, false);
  if (endingT > 300 && (i0.fireHit || i1.fireHit || i0.startHit || keyHit('Enter', 'Space', 'Digit1', 'Digit2') || touch.start)) {
    mode = 'title';
    playMusic('title');
  }
}

function drawEnding() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  for (const b of titleBubbles) { b.y -= b.s; if (b.y < -16) { b.y = H + 16; b.x = Math.random() * W; } ctx.drawImage(b.k ? SPR.bubble.p2 : SPR.bubble.p1, Math.round(b.x), Math.round(b.y)); }
  const lines = [...ENDING_TEXT];
  if (endingInfo.both) {
    lines.push(['БЪБИ И БОБИ СА ЗАЕДНО', '#80ff80'], ['И ЩЕ ЖИВЕЯТ ЩАСТЛИВО!', '#80ff80'], ['', ''], ['ИСТИНСКИЯТ КРАЙ ♥', '#ff78c8']);
  } else {
    lines.push(['НО ДРУГАРЧЕТО ТИ ЛИПСВА...', '#80c0ff'], ['ПРЕМИНИ ИГРАТА С ДВАМА', '#80c0ff'], ['ЗА ИСТИНСКИЯ КРАЙ!', '#80c0ff']);
  }
  lines.push(['', ''], [`ИГРАЧ 1: ${endingInfo.scores[0]}`, '#40e040']);
  if (endingInfo.both || endingInfo.scores[1]) lines.push([`ИГРАЧ 2: ${endingInfo.scores[1]}`, '#40a0ff']);
  lines.push(['', ''], ['БЛАГОДАРИМ, ЧЕ ИГРА!', '#ffe040']);
  const shown = Math.min(lines.length, Math.floor(endingT / 25));
  for (let i = 0; i < shown; i++) {
    const [txt, col] = lines[i];
    drawText(ctx, txt, W / 2, 24 + i * 10, col, { align: 'center', scale: i === 0 ? 2 : 1 });
  }
  const walk = (frame >> 3) % 2;
  ctx.drawImage((walk ? SPR.p1.walk : SPR.p1.stand).r, 96, H - 26);
  if (endingInfo.both) ctx.drawImage((walk ? SPR.p2.walk : SPR.p2.stand).l, 144, H - 26);
  if (Math.floor(frame / 30) % 2 && endingInfo.both) drawText(ctx, '♥', 125, H - 34, '#ff5080', { scale: 1 });
}

function draw() {
  ctx.imageSmoothingEnabled = false;
  if (mode === 'title') drawTitle();
  else if (mode === 'game') {
    game.draw(ctx);
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 16, W, H - 16);
      drawText(ctx, 'ПАУЗА', W / 2, 100, '#fff', { align: 'center', scale: 3 });
      drawText(ctx, 'P – ПРОДЪЛЖИ', W / 2, 130, '#ffe040', { align: 'center' });
    }
  } else if (mode === 'ending') drawEnding();
}

// запазване на рекорда при затваряне
addEventListener('pagehide', () => store.set('balon-hi', hiScore));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'game' && !paused) togglePause();
});
// за автоматични тестове
window.__balon = { get game() { return game; }, get mode() { return mode; } };
export { stopMusic };
