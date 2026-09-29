// Автоматичен тест без браузър: бот „с чийтове“ минава всички 100 рунда.
// node tools/sim.mjs [първи рунд] [последен рунд]
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: noop };

const { buildSprites } = await import('../src/sprites.js');
const { Game } = await import('../src/game.js');
buildSprites();

const from = Number(process.argv[2]) || 1, to = Number(process.argv[3]) || 100;
const game = new Game(2, from, 0);
const idle = { left: false, right: false, jump: false, fire: false };
let frames = 0, levelFrames = 0, lastLevel = from;
const stats = { traps: 0, kills: 0, fruits: 0 };
const t0 = Date.now();
const count = {};
for (const m of ['popChain', 'killAll', 'shoot', 'spawnBonus', 'applyBonus', 'releaseEnemy', 'spawnFruit', 'nextLevel', 'defeatBoss', 'collectLetter']) {
  const orig = game[m].bind(game);
  game[m] = (...a) => { count[m] = (count[m] || 0) + 1; if (m === 'applyBonus') count['b_' + a[1].bonus] = (count['b_' + a[1].bonus] || 0) + 1; return orig(...a); };
}
let trapped = 0;

while (!game.finished && frames < 60 * 60 * 400) {
  frames++; levelFrames++;
  const inputs = [{ ...idle }, { ...idle }];
  if (game.state === 'play') {
    for (const p of game.players) {
      if (!p.alive) continue;
      p.invul = 5;
      const e = game.enemies.find(e => e.state === 'active');
      const b = game.bubbles.find(b => b.enemy && b.phase === 'float' && b.t > 10);
      if (b && frames % 3 === 0) { p.x = b.x - 8; p.y = b.y - 8; }
      else if (e && frames % 25 === 0) {
        p.x = Math.max(16, Math.min(224, e.x - 20)); p.y = e.y; p.dir = 1;
        inputs[p.idx].fire = true; inputs[p.idx].fireHit = true;
      }
      if (game.boss) {
        const B = game.boss;
        if (B.state === 'trapped') { p.x = B.x + 16; p.y = B.y + 16; }
        else if (frames % 20 === 0) {
          // пусни балон и го пукни веднага → мълния към шефа
          p.x = B.x > 120 ? 20 : 220; p.y = B.y + 16; p.dir = B.x > 120 ? 1 : -1;
          inputs[p.idx].fire = true; inputs[p.idx].fireHit = true;
        } else if (frames % 20 === 10) {
          const own = game.bubbles.find(b => b.owner === p.idx);
          if (own) { own.phase = 'float'; p.x = own.x - 8; p.y = own.y - 8; }
        }
      }
      // събирай плодове
      const it = game.items[0];
      if (it && !b && frames % 5 === 2) { p.x = it.x; p.y = it.y; }
    }
  }
  const nT = game.bubbles.filter(b => b.enemy).length;
  const nI = game.items.length;
  game.update(inputs);
  if (game.levelN !== lastLevel) {
    if (levelFrames > 60 * 60 * 3) console.log(`Рунд ${lastLevel} отне ${Math.round(levelFrames / 60)} с`);
    lastLevel = game.levelN; levelFrames = 0;
  }
  if (levelFrames > 60 * 60 * 5) { console.log(`ЗАСЯДАНЕ на рунд ${game.levelN}, състояние ${game.state}`, game.enemies.map(e => `${e.type}:${e.state}@${Math.round(e.x)},${Math.round(e.y)}`)); process.exit(1); }
  stats.traps += Math.max(0, game.bubbles.filter(b => b.enemy).length - nT);
  if (game.levelN > to) break;
}
const p = game.players;
console.log(`Край: ${game.finished || 'стоп'} на рунд ${game.levelN}, кадри ${frames} (${Math.round(frames / 3600)} мин игра), ${Date.now() - t0} ms`);
console.log(count);
console.log('Точки:', p.map(q => q.score), 'Животи:', p.map(q => q.lives), 'хващания:', stats.traps);
