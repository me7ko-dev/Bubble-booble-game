// Главната логика на една игра: рундове, сблъсъци, точки, преходи.
import { W, H, TOP, FIELD_H, WALL_L, WALL_R, TILE, ROWS, COLS, JUMP_V, LAST_LEVEL } from './consts.js';
import { Level, rng } from './levels.js';
import { renderLevel } from './render.js';
import { Player, Bubble, Enemy, Item, Projectile, Bolt, FireDrop, Water, Skull, Boss, FRUITS, overlap, rand, setBossLevel } from './entities.js';
import { drawText } from './font.js';
import { SPR } from './sprites.js';
import { sfx, playMusic } from './audio.js';

const BONUS = [
  // [спрайт, тип, тегло]
  ['candyPink', 'range', 10], ['candyBlue', 'speed', 10], ['candyYellow', 'rate', 10],
  ['shoe', 'shoe', 10], ['clock', 'clock', 6], ['bomb', 'bomb', 4], ['umbrella', 'umbrella', 3],
  ['potion', 'potion', 4], ['cake', 'points', 8], ['icecream', 'points', 8], ['diamond', 'points', 4],
];
const BONUS_NAMES = {
  range: 'ДАЛЕЧ!', speed: 'БЪРЗИ БАЛОНИ!', rate: 'ЧЕСТА СТРЕЛБА!', shoe: 'МАРАТОНКИ!',
  clock: 'ЗАМРАЗЯВАНЕ!', bomb: 'БУМ!', umbrella: '+3 РУНДА!', potion: 'НЕУЯЗВИМ!',
};

export class Game {
  constructor(numPlayers, startLevel, hiScore) {
    this.players = [new Player(0), new Player(1)];
    this.players[0].state = 'alive';
    if (numPlayers === 2) { this.players[1].state = 'alive'; this.players[1].everJoined = true; }
    this.hiScore = hiScore;
    this.frame = 0;
    this.shake = 0;
    this.flash = 0;
    this.maxReached = startLevel;
    this.loadLevel(startLevel);
    for (const p of this.players) if (p.state === 'alive') { const s = this.level.startPos(p.idx); p.spawn(s.x, s.y, 120); }
    this.state = 'ready';
    this.stateT = 0;
    this.finished = null; // 'gameover' | 'ending'
    playMusic(this.level.boss ? 'boss' : 'main');
  }

  get solo() { return this.players[1].state === 'out' && !this.players[1].everJoined; }

  loadLevel(n) {
    this.levelN = n;
    this.maxReached = Math.max(this.maxReached, n);
    this.level = new Level(n);
    this.levelCanvas = renderLevel(this.level);
    setBossLevel(this.level.boss);
    this.bubbles = [];
    this.enemies = [];
    this.items = [];
    this.projectiles = [];
    this.bolts = [];
    this.drops = [];
    this.flames = [];
    this.waters = [];
    this.popups = [];
    this.particles = [];
    this.skull = null;
    this.boss = null;
    this.levelT = 0;
    this.hurry = false;
    this.freeze = 0;
    this.clearT = 0;
    const R = rng(n * 17 + 5);
    this.bonusAt = 300 + Math.floor(R() * 360);
    this.nextSpecial = 360 + Math.floor(R() * 240);
    this.nextLetter = 600 + Math.floor(R() * 600);
    const spawns = this.level.enemySpawns();
    spawns.forEach((s, i) => this.enemies.push(new Enemy(s.type, s.x, s.y, i * 14)));
    if (this.level.boss) {
      const both = this.players.every(p => p.state !== 'out');
      this.boss = new Boss(both ? 40 : 30);
    }
  }

  nearestPlayer(x, y) {
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.cx - x, p.cy - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ─── Действия ────────────────────────────────────────────
  shoot(p) {
    const b = new Bubble(p.x + 8 + p.dir * 8, p.y + 8, p.dir * p.shotSpeed, p.idx);
    b.shotFrames = p.shotFrames;
    this.bubbles.push(b);
    sfx.shoot();
  }

  enemyShoot(e) {
    const kind = e.type === 'fire' ? 'fire' : 'rock';
    const v = kind === 'fire' ? 2.4 : 1.8;
    this.projectiles.push(new Projectile(e.x + 8 + e.dir * 6, e.y + 9, e.dir * v, 0, kind));
    sfx.throw();
  }

  addScore(p, pts, x, y, show = true) {
    if (!p) p = this.players.find(q => q.state !== 'out') || this.players[0];
    p.score += pts;
    if (p.score > this.hiScore) this.hiScore = p.score;
    while (p.score >= p.nextLife) {
      p.lives++;
      p.nextLife = p.nextLife < 100000 ? 100000 : p.nextLife + 200000;
      sfx.extend();
      this.popup(p.cx, p.y - 8, '1 ЖИВОТ!', '#ffe040');
    }
    if (show && x !== undefined) this.popup(x, y, String(pts), p.idx === 0 ? '#80ff80' : '#80c0ff');
  }

  popup(x, y, text, color = '#fff') {
    this.popups.push({ x, y, text, color, t: 0 });
  }

  puff(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, t: 0, life: 14, color });
    }
  }

  releaseEnemy(b) {
    const e = b.enemy;
    e.state = 'active';
    e.angry = true;
    e.x = b.x - 8;
    e.y = b.y - 8;
    e.vy = 0;
    b.enemy = null;
  }

  // Пуква балонче и всички допиращи се до него (верижна реакция).
  popChain(start, p) {
    this.lastPopper = p;
    const set = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const b = queue.shift();
      for (const o of this.bubbles) {
        if (o.dead || set.has(o) || o.phase !== 'float') continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) < 18) { set.add(o); queue.push(o); }
      }
    }
    let kills = 0;
    const chainKills = [...set].filter(b => b.enemy).length;
    for (const b of set) {
      b.dead = true;
      this.puff(b.x, b.y, b.owner === 1 ? '#80c0ff' : '#80ff80');
      if (b.enemy) {
        kills++;
        const pts = Math.min(64000, 1000 * Math.pow(2, kills - 1));
        this.addScore(p, pts, b.x, b.y - 10);
        b.enemy.x = b.x - 8; b.enemy.y = b.y - 8;
        b.enemy.kill(this, Math.min(FRUITS.length - 1, chainKills - 1), Math.sign(b.x - p.cx) || p.dir);
      } else if (b.kind === 'lightning') {
        this.bolts.push(new Bolt(b.x, b.y, p.dir));
        sfx.bolt();
      } else if (b.kind === 'fire') {
        this.drops.push(new FireDrop(b.x, b.y));
      } else if (b.kind === 'water') {
        this.waters.push(new Water(b.x, b.y, p.dir));
        sfx.water();
      } else if (b.kind === 'letter') {
        this.collectLetter(p, b.letter);
      } else {
        this.addScore(p, 10, 0, 0, false);
        if (this.level.boss) { this.bolts.push(new Bolt(b.x, b.y, p.dir)); sfx.bolt(); }
      }
    }
    if (kills) sfx.kill(kills); else sfx.pop();
    if (kills >= 3) this.nextLetter = Math.min(this.nextLetter, this.levelT + 60);
  }

  collectLetter(p, i) {
    sfx.letter();
    p.letters[i] = true;
    this.popup(p.cx, p.y - 8, 'EXTEND'[i], '#ff78c8');
    if (p.letters.every(Boolean)) {
      p.letters = [false, false, false, false, false, false];
      p.lives++;
      sfx.extend();
      this.bigText = { text: 'EXTEND!', t: 150, color: '#ff78c8' };
      this.killAll(p);
    }
  }

  killAll(p) {
    let k = 0;
    for (const b of this.bubbles) if (b.enemy) { b.dead = true; b.enemy.x = b.x - 8; b.enemy.y = b.y - 8; b.enemy.kill(this, 7); k++; }
    for (const e of this.enemies) if (e.state === 'active' || e.state === 'enter') { e.kill(this, Math.min(7, 2 + k++)); this.addScore(p, 1000, e.cx, e.y); }
  }

  spawnFruit(x, y, tier) {
    const [sprite, value] = FRUITS[Math.max(0, Math.min(FRUITS.length - 1, tier))];
    this.items.push(new Item(x, y, sprite, value));
  }

  spawnBonus() {
    const reach = this.level.reach ? [...this.level.reach] : [];
    const cells = reach.map(k => k.split(':').map(Number)).filter(([r]) => r < ROWS - 1);
    if (!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    let total = BONUS.reduce((s, b) => s + b[2], 0);
    let pick = Math.random() * total;
    let chosen = BONUS[0];
    for (const b of BONUS) { pick -= b[2]; if (pick <= 0) { chosen = b; break; } }
    const value = chosen[1] === 'points' ? (chosen[0] === 'diamond' ? 10000 : 5000) : 1000;
    const it = new Item(c * TILE - 4, r * TILE - 40, chosen[0], value, chosen[1]);
    this.items.push(it);
  }

  applyBonus(p, it) {
    switch (it.bonus) {
      case 'range': p.shotFrames = 22; break;
      case 'speed': p.shotSpeed = 5; break;
      case 'rate': p.fireDelay = 10; break;
      case 'shoe': p.speed = 1.45; break;
      case 'clock': this.freeze = 420; break;
      case 'bomb':
        this.flash = 20; this.shake = 20; sfx.boom();
        this.killAll(p);
        break;
      case 'umbrella':
        this.skipTo = Math.min(LAST_LEVEL - 1, this.levelN + 3);
        this.killAll(p);
        break;
      case 'potion': p.invincible = 600; break;
    }
    if (BONUS_NAMES[it.bonus]) this.popup(p.cx, p.y - 14, BONUS_NAMES[it.bonus], '#ffe040');
  }

  onPlayerDied() {
    // времето за „БЪРЗО“ се връща, а Скелетко изчезва
    this.levelT = Math.min(this.levelT, Math.floor(this.level.hurryTime * 0.4));
    if (this.skull) { this.puff(this.skull.x + 8, this.skull.y + 8, '#fff'); this.skull = null; }
    if (this.hurry) { this.hurry = false; playMusic(this.level.boss ? 'boss' : 'main', 1); }
  }

  afterDeath(p) {
    p.lives--;
    p.resetPowers();
    if (p.lives > 0) {
      const s = this.level.startPos(p.idx);
      p.spawn(s.x, s.y);
    } else {
      p.state = 'out';
      this.popup(p.idx === 0 ? 64 : 192, 100, 'КРАЙ', '#ff5050');
    }
  }

  join(idx) {
    const p = this.players[idx];
    if (p.state !== 'out') return;
    if (this.state === 'continue') return;
    p.lives = 3;
    p.score = 0;
    p.nextLife = 30000;
    p.letters = [false, false, false, false, false, false];
    p.resetPowers();
    p.everJoined = true;
    const s = this.level.startPos(idx);
    p.spawn(s.x, s.y);
    sfx.start();
  }

  // ─── Обновяване ─────────────────────────────────────────
  update(inputs) {
    this.frame++;
    this.stateT++;
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;
    if (this.bigText && --this.bigText.t <= 0) this.bigText = null;

    switch (this.state) {
      case 'ready':
        this.updateEnemies();
        if (this.boss) this.boss.update(this);
        if (this.stateT > 100) { this.state = 'play'; this.stateT = 0; }
        return;
      case 'scroll':
        if (this.stateT >= 110) {
          this.state = 'ready'; this.stateT = 0;
          for (const p of this.players) if (p.state === 'alive') { const s = this.level.startPos(p.idx); p.spawn(s.x, s.y, 120); }
          this.oldCanvas = null;
          playMusic(this.level.boss ? 'boss' : 'main', 1);
        }
        return;
      case 'continue':
        this.contT--;
        for (const i of [0, 1]) {
          const canFire = i === 0 || this.players[1].everJoined;
          if (inputs[i].startHit || inputs[i].joinHit || (inputs[i].fireHit && canFire)) {
            const p = this.players[i];
            p.lives = 3; p.score = 0; p.nextLife = 30000; p.resetPowers();
            p.everJoined = p.everJoined || i === 1;
            const s = this.level.startPos(i);
            p.spawn(s.x, s.y);
            this.state = 'play'; this.stateT = 0;
            sfx.start();
            playMusic(this.level.boss ? 'boss' : 'main', 1);
            return;
          }
        }
        if (this.contT % 60 === 0) sfx.select();
        if (this.contT <= 0) { this.state = 'gameover'; this.stateT = 0; }
        return;
      case 'gameover':
        if (this.stateT > 240) this.finished = 'gameover';
        return;
    }

    // play / clear
    this.levelT++;
    for (const i of [0, 1]) {
      if (inputs[i].joinHit) this.join(i);
      this.players[i].update(this, inputs[i]);
    }
    if (this.freeze > 0) this.freeze--;
    this.updateEnemies();
    for (const b of this.bubbles) b.update(this);
    this.separateBubbles();
    for (const it of this.items) it.update(this);
    for (const pr of this.projectiles) pr.update(this);
    for (const b of this.bolts) b.update(this);
    for (const d of this.drops) d.update(this);
    for (const f of this.flames) f.update(this);
    for (const w of this.waters) w.update(this);
    if (this.skull) this.skull.update(this);
    if (this.boss) this.boss.update(this);
    this.updateParticles();
    this.collisions();
    this.cleanup();
    this.timers();
    this.checkClear();
    this.checkGameOver();
  }

  updateEnemies() {
    for (const e of this.enemies) {
      if (e.state === 'trapped') continue;
      if (this.freeze > 0 && e.state === 'active') continue;
      e.update(this);
    }
  }

  separateBubbles() {
    const bs = this.bubbles;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.phase !== 'float') continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.phase !== 'float') continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 14 && d > 0.01) {
          const push = (14 - d) * 0.06;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  updateParticles() {
    for (const p of this.particles) { p.t++; p.x += p.vx; p.y += p.vy; }
    for (const p of this.popups) { p.t++; p.y -= 0.4; }
  }

  collisions() {
    const players = this.players.filter(p => p.alive);
    // изстреляно балонче → хваща враг
    for (const b of this.bubbles) {
      if (b.phase !== 'shot' || b.dead) continue;
      for (const e of this.enemies) {
        if (e.state !== 'active') continue;
        if (Math.hypot(e.cx - b.x, e.cy - b.y) < 12) {
          e.state = 'trapped';
          b.trap(e);
          sfx.trap();
          this.addScore(this.players[b.owner], 10, 0, 0, false);
          break;
        }
      }
      if (this.boss && this.boss.state === 'fight' && b.phase === 'shot') {
        const hb = this.boss.hitbox();
        if (b.x > hb.x0 && b.x < hb.x1 && b.y > hb.y0 && b.y < hb.y1) { b.phase = 'float'; b.vx = -b.vx * 0.3; }
      }
    }
    // дракон ↔ балончета
    for (const p of players) {
      for (const b of this.bubbles) {
        if (b.dead || b.phase !== 'float') continue;
        const dx = b.x - p.cx;
        const feet = p.y + 16;
        // отскок: пада върху балонче и държи скок
        if (p.vy > 0 && p.jumpHeld && Math.abs(dx) < 11 && feet > b.y - 9 && feet < b.y + 1) {
          p.vy = JUMP_V;
          p.y = b.y - 9 - 16;
          sfx.bounce();
          continue;
        }
        if (Math.hypot(dx, b.y - p.cy) < 13) this.popChain(b, p);
      }
      // шефът в балон
      if (this.boss && this.boss.state === 'trapped' && Math.hypot(this.boss.x + 24 - p.cx, this.boss.y + 24 - p.cy) < 34) {
        this.defeatBoss(p);
      }
    }
    // дракон ↔ врагове, снаряди, Скелетко, шеф
    for (const p of players) {
      const hb = p.hitbox();
      for (const e of this.enemies) {
        if (e.state !== 'active' && e.state !== 'enter') continue;
        if (overlap(hb, e.hitbox())) {
          if (p.invincible > 0) { e.kill(this, 3, p.dir); this.addScore(p, 1000, e.cx, e.y); sfx.kill(1); }
          else if (this.freeze <= 0 || e.state === 'enter') p.die(this);
        }
      }
      for (const pr of this.projectiles) if (overlap(hb, pr.hitbox())) { if (p.invincible <= 0 && p.invul <= 0) pr.gone = true; p.die(this); }
      if (this.skull && overlap(hb, this.skull.hitbox())) p.die(this);
      if (this.boss && this.boss.state === 'fight' && overlap(hb, this.boss.hitbox())) p.die(this);
      for (const it of this.items) {
        if (it.gone || it.t < 8 || !overlap(hb, it.hitbox())) continue;
        it.gone = true;
        this.addScore(p, it.value, it.x + 8, it.y);
        if (it.bonus) { sfx.item(); this.applyBonus(p, it); } else sfx.fruit();
      }
    }
    // мълнии, огън и вода ↔ врагове / шеф
    const hurt = (box, dirOf) => {
      for (const e of this.enemies) {
        if (e.state !== 'active') continue;
        if (overlap(box, e.hitbox())) {
          e.kill(this, 4, dirOf(e));
          this.addScore(this.lastPopper, 1000, e.cx, e.y);
          sfx.kill(2);
        }
      }
    };
    for (const b of this.bolts) {
      hurt(b.hitbox(), () => b.dir);
      if (this.boss && overlap(b.hitbox(), this.boss.hitbox()) && this.boss.hit(this)) { b.gone = true; this.shake = 6; }
    }
    for (const f of this.flames) if (f.t >= 0) hurt(f.hitbox(), () => 0);
    for (const w of this.waters) for (const box of w.boxes()) hurt(box, () => w.dir);
  }

  defeatBoss(p) {
    const b = this.boss;
    b.state = 'dead';
    b.vx = p.dir * 1.2; b.vy = -3;
    this.shake = 40; this.flash = 30;
    sfx.boom();
    this.addScore(p, 100000, b.x + 24, b.y);
    this.bigText = { text: 'ПОБЕДА!', t: 300, color: '#ffe040' };
    for (let i = 0; i < 24; i++) {
      const it = new Item(rand(WALL_L, WALL_R - 16), -rand(10, 200), 'diamond', 8000);
      it.life = 900;
      this.items.push(it);
    }
    this.projectiles = [];
    this.bossBeatenT = 0;
  }

  cleanup() {
    this.bubbles = this.bubbles.filter(b => !b.dead);
    this.enemies = this.enemies.filter(e => !e.gone);
    this.items = this.items.filter(i => !i.gone);
    this.projectiles = this.projectiles.filter(p => !p.gone);
    this.bolts = this.bolts.filter(b => !b.gone);
    this.drops = this.drops.filter(d => !d.gone);
    this.flames = this.flames.filter(f => !f.gone);
    this.waters = this.waters.filter(w => !w.gone);
    this.particles = this.particles.filter(p => p.t < p.life);
    this.popups = this.popups.filter(p => p.t < 60);
    if (this.boss && this.boss.gone) this.boss = null;
  }

  timers() {
    const L = this.level;
    if (this.state !== 'play') return;
    const enemiesLeft = this.enemies.some(e => e.state !== 'dead');
    if (!L.boss && enemiesLeft) {
      if (!this.hurry && this.levelT >= L.hurryTime) {
        this.hurry = true;
        this.bigText = { text: 'БЪРЗО!', t: 120, color: '#ff5050' };
        sfx.hurry();
        for (const e of this.enemies) e.angry = true;
        playMusic('main', 1.35);
      }
      if (!this.skull && this.levelT >= L.hurryTime + 900) {
        this.skull = new Skull();
        this.bigText = { text: 'СКЕЛЕТКО!', t: 90, color: '#ffffff' };
      }
    }
    if (this.levelT === this.bonusAt && !L.boss) this.spawnBonus();
    // специални балончета
    if (L.special && this.levelT >= this.nextSpecial && enemiesLeft) {
      this.nextSpecial = this.levelT + 300 + Math.floor(Math.random() * 180);
      this.spawnSpecial(L.special);
    }
    if (this.levelT >= this.nextLetter && enemiesLeft && !L.boss) {
      this.nextLetter = this.levelT + 900 + Math.floor(Math.random() * 600);
      if (Math.random() < 0.7) {
        const act = this.players.filter(p => p.state !== 'out');
        const p = act[Math.floor(Math.random() * act.length)] || this.players[0];
        const missing = p.letters.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
        const b = this.spawnSpecial('letter');
        b.letter = missing.length ? missing[Math.floor(Math.random() * missing.length)] : 0;
      }
    }
    if (L.boss && this.boss && this.boss.state === 'fight' && this.levelT % 240 === 0) this.spawnSpecial('lightning');
  }

  spawnSpecial(kind) {
    // излиза от дупката в пода (ако има) или отдолу на случайно място
    const floorR = ROWS - 1;
    const gaps = [];
    for (let c = 2; c < COLS - 2; c++) if (!this.level.solid(c, floorR)) gaps.push(c);
    const x = gaps.length ? gaps[Math.floor(gaps.length / 2)] * TILE + (gaps.length % 2 ? 4 : 0) : rand(WALL_L + 16, WALL_R - 16);
    const b = new Bubble(x, FIELD_H + 8, 0, -1, kind);
    this.bubbles.push(b);
    return b;
  }

  checkClear() {
    if (this.state === 'play') {
      const done = this.level.boss ? this.bossBeatenT !== undefined : this.enemies.length === 0 && !this.bubbles.some(b => b.enemy);
      if (done) { this.state = 'clear'; this.stateT = 0; if (this.skull) { this.puff(this.skull.x + 8, this.skull.y + 8, '#fff'); this.skull = null; } }
    } else if (this.state === 'clear') {
      if (this.stateT === 60) sfx.clear();
      const wait = this.level.boss ? 420 : 200;
      if (this.stateT >= wait) {
        if (this.level.boss) { this.finished = 'ending'; return; }
        this.nextLevel(this.skipTo || this.levelN + 1);
        this.skipTo = 0;
      }
    }
  }

  nextLevel(n) {
    this.oldCanvas = this.levelCanvas;
    this.moveFrom = this.players.map(p => ({ x: p.x, y: p.y }));
    for (const p of this.players) if (p.state === 'dead') { p.state = 'alive'; }
    this.loadLevel(n);
    this.state = 'scroll';
    this.stateT = 0;
  }

  checkGameOver() {
    if (this.players.every(p => p.state === 'out')) {
      this.state = 'continue';
      this.contT = 600;
      this.stateT = 0;
    }
  }

  // ─── Рисуване ────────────────────────────────────────────
  draw(ctx) {
    const t = this.frame;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    const sx = this.shake ? Math.round(rand(-2, 2)) : 0, sy = this.shake ? Math.round(rand(-2, 2)) : 0;
    ctx.translate(sx, TOP + sy);
    ctx.beginPath();
    ctx.rect(0, 0, W, FIELD_H);
    ctx.clip();

    if (this.state === 'scroll') {
      const k = Math.min(1, this.stateT / 100);
      const e = k * k * (3 - 2 * k);
      ctx.drawImage(this.oldCanvas, 0, Math.round(-e * FIELD_H));
      ctx.drawImage(this.levelCanvas, 0, Math.round((1 - e) * FIELD_H));
      this.players.forEach((p, i) => {
        if (p.state !== 'alive') return;
        const from = this.moveFrom[i], to = this.level.startPos(i);
        const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e + Math.sin(t / 8) * 3;
        const set = i === 0 ? SPR.p1 : SPR.p2;
        ctx.drawImage(set.jump[i === 0 ? 'r' : 'l'], Math.round(x), Math.round(y));
        ctx.drawImage(i === 0 ? SPR.bubble.p1 : SPR.bubble.p2, 0, 0, 16, 16, Math.round(x) - 4, Math.round(y) - 4, 24, 24);
      });
      ctx.restore();
      this.drawHud(ctx);
      return;
    }

    ctx.drawImage(this.levelCanvas, 0, 0);
    for (const f of this.flames) f.draw(ctx, t);
    for (const w of this.waters) w.draw(ctx, t);
    for (const it of this.items) it.draw(ctx, t);
    for (const e of this.enemies) if (e.state !== 'trapped') e.draw(ctx, t, this.freeze > 0);
    if (this.boss) this.boss.draw(ctx, t);
    for (const p of this.players) p.draw(ctx, t);
    for (const b of this.bubbles) b.draw(ctx, t);
    for (const d of this.drops) d.draw(ctx, t);
    for (const b of this.bolts) b.draw(ctx, t);
    for (const pr of this.projectiles) pr.draw(ctx, t);
    if (this.skull) this.skull.draw(ctx, t);
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    for (const p of this.popups) drawText(ctx, p.text, p.x, p.y, p.color, { align: 'center' });

    // номер на рунда горе вляво
    const rn = String(this.levelN);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, rn.length * 6 + 3, 9);
    drawText(ctx, rn, 2, 1, '#fff', { shadow: null });
    this.drawLetters(ctx);

    if (this.boss && this.boss.state !== 'dead') {
      ctx.fillStyle = '#000';
      ctx.fillRect(WALL_L + 40, 2, 144, 6);
      ctx.fillStyle = '#ff5080';
      ctx.fillRect(WALL_L + 41, 3, Math.max(0, 142 * this.boss.hp / this.boss.maxHp), 4);
    }

    if (this.state === 'ready') {
      drawText(ctx, this.level.boss ? 'ПОСЛЕДЕН РУНД' : `РУНД ${this.levelN}`, W / 2, 80, '#fff', { align: 'center', scale: 2 });
      if (this.stateT > 30) drawText(ctx, 'ГОТОВИ!', W / 2, 104, '#ffe040', { align: 'center', scale: 2 });
    }
    if (this.bigText && (this.bigText.t >> 3) % 2 === 0) {
      drawText(ctx, this.bigText.text, W / 2, 90, this.bigText.color, { align: 'center', scale: 3 });
    }
    if (this.state === 'continue') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, FIELD_H);
      drawText(ctx, 'ПРОДЪЛЖАВАШ ЛИ?', W / 2, 70, '#fff', { align: 'center', scale: 2 });
      drawText(ctx, String(Math.ceil(this.contT / 60) - 1 < 0 ? 0 : Math.ceil(this.contT / 60) - 1), W / 2, 94, '#ffe040', { align: 'center', scale: 4 });
      drawText(ctx, 'НАТИСНИ БАЛОНЧЕ ИЛИ 1 / 2', W / 2, 140, '#80ff80', { align: 'center' });
    }
    if (this.state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, FIELD_H);
      drawText(ctx, 'КРАЙ НА ИГРАТА', W / 2, 90, '#ff5050', { align: 'center', scale: 2 });
    }
    if (this.flash) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash / 30})`;
      ctx.fillRect(0, 0, W, FIELD_H);
    }
    ctx.restore();
    this.drawHud(ctx);
  }

  drawLetters(ctx) {
    this.players.forEach((p, i) => {
      if (p.state === 'out' && !p.everJoined && i === 1) return;
      const x = i === 0 ? 5 : W - 11;
      for (let k = 0; k < 6; k++) {
        const y = 24 + k * 10;
        if (p.letters[k]) {
          ctx.fillStyle = '#ff78c8';
          ctx.fillRect(x - 2, y - 1, 9, 9);
          drawText(ctx, 'EXTEND'[k], x, y, '#fff', { shadow: null });
        }
      }
    });
  }

  drawHud(ctx) {
    const [p1, p2] = this.players;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, TOP);
    const blink = (this.frame >> 4) % 2;
    drawText(ctx, '1UP', 8, 0, '#40e040');
    drawText(ctx, 'РЕКОРД', W / 2, 0, '#ff5050', { align: 'center' });
    drawText(ctx, '2UP', W - 26, 0, '#40a0ff');
    const livesTxt = (p) => (p.state === 'out' ? '' : '♥' + Math.max(0, p.lives - (p.state === 'dead' ? 1 : 0)));
    drawText(ctx, livesTxt(p1), 32, 0, '#ff78c8');
    drawText(ctx, livesTxt(p2), W - 52, 0, '#ff78c8');
    const sc = (p, x) => {
      if (p.state === 'out' && this.state !== 'continue') {
        if (blink) drawText(ctx, p.idx === 0 ? 'НАТИСНИ 1' : 'НАТИСНИ 2', x, 8, '#ffe040', { align: 'right' });
      } else drawText(ctx, String(p.score), x, 8, '#fff', { align: 'right' });
    };
    sc(p1, 72);
    drawText(ctx, String(this.hiScore), W / 2 + 18, 8, '#fff', { align: 'right' });
    sc(p2, W - 8);
  }
}
