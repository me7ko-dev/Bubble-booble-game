// Дракончета, балончета, врагове, предмети и ефекти.
import { TILE, FIELD_H, WALL_L, WALL_R, JUMP_V, GRAVITY, ROWS } from './consts.js';
import { stepBody, clampX, groundBelow } from './physics.js';
import { SPR } from './sprites.js';
import { drawText } from './font.js';
import { sfx } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
export { overlap, rand };

// ═══ Дракон ═══════════════════════════════════════════════════
export class Player {
  constructor(idx) {
    this.idx = idx;
    this.lives = 3;
    this.score = 0;
    this.nextLife = 30000;
    this.letters = [false, false, false, false, false, false];
    this.w = 16; this.h = 16; this.fx0 = 3; this.fx1 = 12;
    this.state = 'out';
    this.resetPowers();
  }

  resetPowers() {
    this.speed = 1;
    this.shotFrames = 13;
    this.shotSpeed = 3.4;
    this.fireDelay = 20;
    this.invincible = 0; // вълшебна отвара
  }

  spawn(x, y, invul = 150) {
    this.x = x; this.y = y;
    this.vy = 0;
    this.dir = this.idx === 0 ? 1 : -1;
    this.state = 'alive';
    this.invul = invul;
    this.cool = 0;
    this.shootT = 0;
    this.walkT = 0;
    this.onGround = true;
    this.moving = false;
  }

  get alive() { return this.state === 'alive'; }
  get cx() { return this.x + 8; }
  get cy() { return this.y + 8; }
  hitbox() { return { x0: this.x + 4, x1: this.x + 12, y0: this.y + 4, y1: this.y + 16 }; }

  update(game, inp) {
    if (this.state === 'dead') {
      this.deadT--;
      if (this.deadT <= 0) game.afterDeath(this);
      return;
    }
    if (this.state !== 'alive') return;
    if (this.invul > 0) this.invul--;
    if (this.invincible > 0) this.invincible--;
    if (this.cool > 0) this.cool--;
    if (this.shootT > 0) this.shootT--;

    this.moving = false;
    if (inp.left && !inp.right) { this.x -= this.speed; this.dir = -1; this.moving = true; }
    else if (inp.right && !inp.left) { this.x += this.speed; this.dir = 1; this.moving = true; }
    clampX(this);
    if (this.moving) this.walkT++;

    if (inp.jumpHit && this.onGround) {
      this.vy = JUMP_V;
      this.onGround = false;
      sfx.jump();
    }
    this.jumpHeld = inp.jump;
    if (inp.fireHit && this.cool === 0) {
      game.shoot(this);
      this.cool = this.fireDelay;
      this.shootT = 10;
    }
    stepBody(this, game.level);
  }

  die(game) {
    if (this.state !== 'alive' || this.invul > 0 || this.invincible > 0) return;
    this.state = 'dead';
    this.deadT = 110;
    sfx.die();
    game.onPlayerDied(this);
  }

  draw(ctx, t) {
    if (this.state !== 'alive' && this.state !== 'dead') return;
    const set = this.idx === 0 ? SPR.p1 : SPR.p2;
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.state === 'dead') {
      const k = this.deadT;
      const spin = Math.floor(k / 6) % 4;
      const img = set.dead[spin < 2 ? 'r' : 'l'];
      ctx.save();
      ctx.translate(x + 8, y + 8);
      if (spin % 2) ctx.scale(1, -1);
      ctx.drawImage(img, -8, -8);
      ctx.restore();
      // звездички
      for (let i = 0; i < 3; i++) {
        const a = t / 8 + i * 2.1;
        drawText(ctx, '★', x + 5 + Math.cos(a) * 10, y - 4 + Math.sin(a) * 4, '#ffe040', { shadow: null });
      }
      return;
    }
    if (this.invul > 0 && (t >> 2) % 2) return;
    let frame = set.stand;
    if (this.shootT > 0) frame = set.shoot;
    else if (!this.onGround) frame = set.jump;
    else if (this.moving && (this.walkT >> 3) % 2) frame = set.walk;
    const img = this.dir > 0 ? frame.r : frame.l;
    if (this.invincible > 0 && (t >> 1) % 2) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(img, x, y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `hsl(${(t * 20) % 360},100%,70%)`;
      ctx.fillRect(x + 7, y - 3, 2, 2);
    } else ctx.drawImage(img, x, y);
  }
}

// ═══ Балонче ══════════════════════════════════════════════════
export class Bubble {
  constructor(x, y, vx, owner, kind = 'normal') {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = 0;
    this.owner = owner; // 0/1 или -1 за специални
    this.kind = kind;   // normal | lightning | fire | water | letter | boss
    this.phase = kind === 'normal' ? 'shot' : 'float';
    this.t = 0;
    this.life = kind === 'normal' ? 520 : 900;
    this.enemy = null;
    this.letter = -1;
    this.shotFrames = 13;
    this.dead = false;
  }

  trap(enemy) {
    this.enemy = enemy;
    this.phase = 'float';
    this.t = 0;
    this.life = 560;
    this.vx *= 0.2;
  }

  update(game) {
    this.t++;
    if (this.phase === 'shot') {
      this.x += this.vx;
      if (this.x < WALL_L + 8 || this.x > WALL_R - 8 || this.t >= this.shotFrames) {
        this.x = Math.max(WALL_L + 8, Math.min(WALL_R - 8, this.x));
        this.phase = 'float';
        this.vx = 0;
      }
      return;
    }
    // плаване по въздушното течение: нагоре, после към точката на събиране
    const topY = 18;
    if (this.y > topY) {
      this.vy += (-0.45 - this.vy) * 0.08;
      this.vx *= 0.9;
    } else {
      this.vy *= 0.85;
      const dx = game.level.airX - this.x;
      this.vx += Math.sign(dx) * 0.015;
      this.vx = Math.max(-0.4, Math.min(0.4, this.vx));
      if (Math.abs(dx) < 3) this.vx *= 0.8;
    }
    this.x += this.vx;
    this.y += this.vy + Math.sin((this.t + this.x) / 18) * 0.12;
    if (this.x < WALL_L + 8) { this.x = WALL_L + 8; this.vx = Math.abs(this.vx); }
    if (this.x > WALL_R - 8) { this.x = WALL_R - 8; this.vx = -Math.abs(this.vx); }
    if (this.y < 16) this.y = 16;
    if (this.y > FIELD_H + 8) this.y -= FIELD_H + 16;

    if (this.t >= this.life) {
      if (this.enemy) game.releaseEnemy(this);
      else game.puff(this.x, this.y, '#fff');
      this.dead = true;
    }
  }

  draw(ctx, t) {
    const x = Math.round(this.x) - 8, y = Math.round(this.y) - 8;
    const B = SPR.bubble;
    if (this.enemy) {
      const e = this.enemy;
      const set = SPR.enemies[e.type];
      ctx.drawImage(set.frames[(t >> 4) % 2][e.dir > 0 ? 'r' : 'l'], x, y);
      let img = this.owner === 1 ? B.p2 : B.p1;
      const left = this.life - this.t;
      if (left < 120) img = (t >> 2) % 2 ? B.danger : B.p1;
      else if (left < 260) img = B.warn;
      ctx.drawImage(img, x, y);
      return;
    }
    const left = this.life - this.t;
    if (left < 90 && (t >> 2) % 2) return;
    switch (this.kind) {
      case 'lightning': ctx.drawImage(B.lightning, x, y); break;
      case 'fire': ctx.drawImage(B.fire, x, y); break;
      case 'water': ctx.drawImage(B.water, x, y); break;
      case 'letter':
        ctx.drawImage(B.letter, x, y);
        drawText(ctx, 'EXTEND'[this.letter], x + 5, y + 4, '#fff', { shadow: '#a03060' });
        break;
      default: {
        let img = this.owner === 1 ? B.p2 : B.p1;
        if (game_bossLevel && this.phase === 'float') img = (t >> 3) % 2 ? B.lightning : img;
        ctx.drawImage(img, x, y);
      }
    }
  }
}
let game_bossLevel = false;
export function setBossLevel(v) { game_bossLevel = v; }

// ═══ Врагове ══════════════════════════════════════════════════
const SPEED = { windup: 0.55, spring: 0.7, ghost: 0.6, wizard: 0.5, fire: 0.6, prop: 0.45 };
const WALKERS = new Set(['windup', 'wizard', 'fire']);

export class Enemy {
  constructor(type, x, targetY, delay = 0) {
    this.type = type;
    this.x = x;
    this.y = -16 - delay;
    this.targetY = targetY;
    this.w = 16; this.h = 16; this.fx0 = 3; this.fx1 = 12;
    this.vx = 0; this.vy = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.state = 'enter';
    this.angry = false;
    this.t = 0;
    this.cool = 60 + Math.random() * 120;
    this.jumpCool = 60 + Math.random() * 60;
    this.edgeDecided = false;
    this.onGround = false;
    if (type === 'ghost') { this.vx = this.dir * 1; this.vy = Math.random() < 0.5 ? -1 : 1; }
  }

  get cx() { return this.x + 8; }
  get cy() { return this.y + 8; }
  hitbox() { return { x0: this.x + 3, x1: this.x + 13, y0: this.y + 3, y1: this.y + 16 }; }

  speed() { return SPEED[this.type] * (this.angry ? 1.9 : 1); }

  update(game) {
    this.t++;
    if (this.state === 'enter') {
      this.y += 1.5;
      if (this.y >= this.targetY) { this.y = this.targetY; this.state = 'active'; }
      return;
    }
    if (this.state === 'dead') return this.updateDead(game);
    const lvl = game.level;
    const target = game.nearestPlayer(this.cx, this.cy);
    const s = this.speed();

    if (this.type === 'ghost') {
      this.x += Math.sign(this.vx) * s;
      this.y += Math.sign(this.vy) * s;
      if (this.x < WALL_L) { this.x = WALL_L; this.vx = 1; }
      if (this.x > WALL_R - 16) { this.x = WALL_R - 16; this.vx = -1; }
      if (this.y < 8) { this.y = 8; this.vy = 1; }
      if (this.y > FIELD_H - 24) { this.y = FIELD_H - 24; this.vy = -1; }
      this.dir = Math.sign(this.vx);
      return;
    }
    if (this.type === 'prop') {
      const tx = target ? target.cx : 128, ty = target ? target.cy - 6 : 60;
      this.vx += Math.sign(tx - this.cx) * 0.02;
      this.vy += Math.sign(ty - this.cy) * 0.015;
      const m = s;
      this.vx = Math.max(-m, Math.min(m, this.vx));
      this.vy = Math.max(-m * 0.7, Math.min(m * 0.7, this.vy));
      this.x += this.vx;
      this.y += this.vy + Math.sin(this.t / 10) * 0.3;
      if (clampX(this)) this.vx = -this.vx;
      if (this.y < 8) { this.y = 8; this.vy = Math.abs(this.vy); }
      if (this.y > FIELD_H - 24) { this.y = FIELD_H - 24; this.vy = -Math.abs(this.vy); }
      this.dir = this.vx >= 0 ? 1 : -1;
      return;
    }
    if (this.type === 'spring') {
      if (this.onGround) {
        this.vy = this.angry ? -3.3 : -2.9;
        if (target && Math.random() < 0.5) this.dir = Math.sign(target.cx - this.cx) || this.dir;
        if (target && target.y < this.y - 20 && Math.random() < 0.5) this.vy = JUMP_V;
      }
      this.x += this.dir * s;
      if (clampX(this)) this.dir = -this.dir;
      stepBody(this, lvl);
      return;
    }
    // ходещи врагове
    if (WALKERS.has(this.type)) {
      if (this.onGround) {
        this.x += this.dir * s;
        if (clampX(this)) this.dir = -this.dir;
        if (!groundBelow(this, lvl, this.dir * 7)) {
          if (!this.edgeDecided) {
            this.edgeDecided = true;
            const below = target && target.y > this.y + 8;
            this.keepGoing = below ? Math.random() < 0.75 : Math.random() < 0.3;
            if (!this.keepGoing) this.dir = -this.dir;
          }
        } else this.edgeDecided = false;
        // скок нагоре към играча
        if (--this.jumpCool <= 0) {
          this.jumpCool = 50 + Math.random() * 90;
          if (target && target.y < this.y - 12 && Math.abs(target.cx - this.cx) < 90) {
            this.vy = JUMP_V; this.onGround = false;
          } else if (Math.random() < 0.12) {
            this.vy = JUMP_V; this.onGround = false;
          }
        }
        // обръщане към играча на същото ниво
        if (target && Math.abs(target.y - this.y) < 6 && this.t % 90 === 0) this.dir = Math.sign(target.cx - this.cx) || this.dir;
        // стрелба
        if (this.type !== 'windup' && target && --this.cool <= 0) {
          if (Math.abs(target.y - this.y) < 10 && Math.sign(target.cx - this.cx) === this.dir) {
            game.enemyShoot(this);
            this.cool = (this.type === 'fire' ? 110 : 140) * (this.angry ? 0.6 : 1);
          } else this.cool = 20;
        }
      } else {
        this.x += this.dir * s * 0.6;
        if (clampX(this)) this.dir = -this.dir;
      }
      stepBody(this, lvl);
    }
  }

  kill(game, tier, dir = 0) {
    this.state = 'dead';
    this.tier = tier;
    this.vx = (dir || (Math.random() < 0.5 ? -1 : 1)) * rand(0.8, 2);
    this.vy = -rand(3, 4.2);
    this.t = 0;
  }

  updateDead(game) {
    this.x += this.vx;
    if (this.x < WALL_L) { this.x = WALL_L; this.vx = -this.vx; }
    if (this.x > WALL_R - 16) { this.x = WALL_R - 16; this.vx = -this.vx; }
    if (this.t < 25) { this.y += this.vy; this.vy += GRAVITY * 1.2; if (this.y < 8) { this.y = 8; this.vy = 0; } return; }
    stepBody(this, game.level, GRAVITY * 1.2, 3);
    if (this.onGround || this.t > 400) {
      game.spawnFruit(this.x, this.y, this.tier);
      this.gone = true;
    }
  }

  draw(ctx, t, frozen) {
    const set = SPR.enemies[this.type];
    const frames = this.angry ? set.angry : set.frames;
    const f = frames[(this.t >> (this.angry ? 3 : 4)) % 2];
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.state === 'dead') {
      ctx.save();
      ctx.translate(x + 8, y + 8);
      ctx.rotate(this.t * 0.4);
      ctx.drawImage(f.r, -8, -8);
      ctx.restore();
      return;
    }
    if (frozen && (t >> 3) % 2) ctx.globalAlpha = 0.6;
    ctx.drawImage(this.dir > 0 ? f.r : f.l, x, y);
    ctx.globalAlpha = 1;
  }
}

// ═══ Предмет (плод или бонус) ════════════════════════════════
export const FRUITS = [
  ['banana', 500], ['cherry', 1000], ['orange', 2000], ['melon', 3000],
  ['grapes', 4000], ['icecream', 5000], ['cake', 6000], ['diamond', 8000],
];

export class Item {
  constructor(x, y, sprite, value, bonus = null) {
    this.x = x; this.y = y;
    this.w = 16; this.h = 16; this.fx0 = 3; this.fx1 = 12;
    this.vy = 0;
    this.sprite = sprite;
    this.value = value;
    this.bonus = bonus;
    this.life = bonus ? 720 : 600;
    this.t = 0;
    this.onGround = false;
  }
  hitbox() { return { x0: this.x + 3, x1: this.x + 13, y0: this.y + 4, y1: this.y + 16 }; }
  update(game) {
    this.t++;
    stepBody(this, game.level, GRAVITY, 2);
    clampX(this);
    if (this.t >= this.life) this.gone = true;
  }
  draw(ctx, t) {
    const left = this.life - this.t;
    if (left < 120 && (t >> 2) % 2) return;
    ctx.drawImage(SPR.items[this.sprite], Math.round(this.x), Math.round(this.y));
  }
}

// ═══ Снаряди на враговете ═══════════════════════════════════
export class Projectile {
  constructor(x, y, vx, vy, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.kind = kind; this.t = 0;
  }
  hitbox() { return { x0: this.x - 3, x1: this.x + 3, y0: this.y - 3, y1: this.y + 3 }; }
  update() {
    this.t++;
    this.x += this.vx; this.y += this.vy;
    if (this.kind === 'bottle') this.vy += 0.03;
    if (this.x < WALL_L || this.x > WALL_R || this.y < 0 || this.y > FIELD_H) this.gone = true;
  }
  draw(ctx) {
    const img = { rock: SPR.rock, fire: SPR.fireball, bottle: SPR.bottle }[this.kind];
    const i = this.vx >= 0 ? img.r : img.l;
    ctx.drawImage(i, Math.round(this.x - i.width / 2), Math.round(this.y - i.height / 2));
  }
}

// ═══ Мълния ═════════════════════════════════════════════════
export class Bolt {
  constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir; this.t = 0; }
  hitbox() { return { x0: this.x - 10, x1: this.x + 10, y0: this.y - 7, y1: this.y + 7 }; }
  update() {
    this.t++;
    this.x += this.dir * 4.5;
    if (this.x < WALL_L - 10 || this.x > WALL_R + 10) this.gone = true;
  }
  draw(ctx, t) {
    ctx.strokeStyle = (t >> 1) % 2 ? '#fff' : '#ffe040';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const px = this.x - this.dir * i * 4;
      const py = this.y + (i % 2 ? -4 : 4) * ((i + (t >> 1)) % 2 ? 1 : -1);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
}

// ═══ Огън: падащо пламъче, което пали платформата ═══════════
export class FireDrop {
  constructor(x, y) { this.x = x - 4; this.y = y; this.w = 8; this.h = 8; this.fx0 = 1; this.fx1 = 6; this.vy = 0; }
  update(game) {
    stepBody(this, game.level, GRAVITY, 3);
    if (this.onGround) {
      this.gone = true;
      const r = Math.round((this.y + this.h) / TILE);
      const c0 = Math.floor((this.x + 4) / TILE);
      for (const dir of [-1, 1]) {
        for (let i = dir === 1 ? 0 : 1; i < 6; i++) {
          const c = c0 + dir * i;
          if (c < 2 || c > 29 || !game.level.solid(c, r)) break;
          game.flames.push(new Flame(c * TILE, r * TILE - 8, i * 4));
        }
      }
      sfx.fire();
    }
  }
  draw(ctx, t) {
    const img = SPR.fireball[(t >> 2) % 2 ? 'r' : 'l'];
    ctx.drawImage(img, Math.round(this.x), Math.round(this.y));
  }
}

export class Flame {
  constructor(x, y, delay) { this.x = x; this.y = y; this.t = -delay; this.life = 300; }
  hitbox() { return { x0: this.x, x1: this.x + 8, y0: this.y - 6, y1: this.y + 8 }; }
  update() { this.t++; if (this.t > this.life) this.gone = true; }
  draw(ctx, t) {
    if (this.t < 0) return;
    const h = 6 + ((t + this.x) >> 2) % 3;
    ctx.fillStyle = '#e83838';
    ctx.fillRect(this.x + 1, this.y + 8 - h, 6, h);
    ctx.fillStyle = '#ff9020';
    ctx.fillRect(this.x + 2, this.y + 9 - h, 4, h - 2);
    ctx.fillStyle = '#ffe040';
    ctx.fillRect(this.x + 3, this.y + 11 - h, 2, h - 4);
  }
}

// ═══ Вода: поток, който тече по платформите и отнася враговете ═
export class Water {
  constructor(x, y, dir) {
    this.x = x - 4; this.y = y; this.w = 8; this.h = 8; this.fx0 = 1; this.fx1 = 6;
    this.vy = 0; this.dir = dir; this.t = 0; this.trail = [];
  }
  update(game) {
    this.t++;
    const oy = this.y;
    if (this.onGround) this.x += this.dir * 2.2;
    const hit = clampX(this);
    if (hit) this.dir = -hit;
    stepBody(this, game.level, 0.25, 3);
    if (this.y < oy - 50 || this.t > 420) this.done = true;
    if (!this.done) this.trail.unshift({ x: this.x, y: this.y });
    else this.trail.pop();
    if (this.trail.length > 28) this.trail.pop();
    if (this.done && this.trail.length === 0) this.gone = true;
  }
  boxes() {
    return this.trail.filter((_, i) => i % 3 === 0).map(p => ({ x0: p.x, x1: p.x + 8, y0: p.y - 2, y1: p.y + 8 }));
  }
  draw(ctx, t) {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];
      ctx.fillStyle = (i + (t >> 2)) % 3 ? '#40a0ff' : '#b0e0ff';
      ctx.fillRect(Math.round(p.x), Math.round(p.y) + 1, 8, 7);
    }
  }
}

// ═══ Скелетко – идва, когато времето изтече ═════════════════
export class Skull {
  constructor() { this.x = 120; this.y = -16; this.vx = 0; this.vy = 0.5; this.t = 0; }
  hitbox() { return { x0: this.x + 3, x1: this.x + 13, y0: this.y + 3, y1: this.y + 13 }; }
  update(game) {
    this.t++;
    const p = game.nearestPlayer(this.x + 8, this.y + 8);
    if (p) {
      const max = 0.75 + Math.min(0.6, this.t / 1800);
      this.vx += Math.sign(p.cx - this.x - 8) * 0.03;
      this.vy += Math.sign(p.cy - this.y - 8) * 0.03;
      this.vx = Math.max(-max, Math.min(max, this.vx));
      this.vy = Math.max(-max, Math.min(max, this.vy));
    }
    this.x += this.vx; this.y += this.vy;
  }
  draw(ctx, t) {
    const img = this.vx >= 0 ? SPR.skull.r : SPR.skull.l;
    ctx.drawImage(img, Math.round(this.x), Math.round(this.y + Math.sin(t / 8) * 2));
  }
}

// ═══ Шефът ══════════════════════════════════════════════════
export class Boss {
  constructor(hp) {
    this.x = 104; this.y = -48; this.w = 48; this.h = 48;
    this.vx = 0.7; this.vy = 0.7;
    this.hp = this.maxHp = hp;
    this.state = 'enter';
    this.t = 0; this.hitT = 0; this.cool = 180;
  }
  hitbox() { return { x0: this.x + 6, x1: this.x + 42, y0: this.y + 6, y1: this.y + 44 }; }
  update(game) {
    this.t++;
    if (this.hitT > 0) this.hitT--;
    if (this.state === 'enter') {
      this.y += 0.6;
      if (this.y >= 24) this.state = 'fight';
      return;
    }
    if (this.state === 'trapped') {
      this.y += (20 - this.y) * 0.01 + Math.sin(this.t / 10) * 0.3;
      this.x += Math.sin(this.t / 25) * 0.3;
      this.bubbleT--;
      if (this.bubbleT <= 0) { this.state = 'fight'; this.hp = Math.ceil(this.maxHp / 4); game.popup(this.x + 24, this.y, 'ИЗБЯГА!', '#ff5080'); }
      return;
    }
    if (this.state === 'dead') {
      this.y += this.vy; this.vy += 0.1; this.x += this.vx;
      if (this.y > FIELD_H + 60) this.gone = true;
      return;
    }
    const k = 1 + (1 - this.hp / this.maxHp) * 1.2;
    this.x += Math.sign(this.vx) * 0.7 * k;
    this.y += Math.sign(this.vy) * 0.55 * k;
    if (this.x < WALL_L) { this.x = WALL_L; this.vx = 1; }
    if (this.x > WALL_R - 48) { this.x = WALL_R - 48; this.vx = -1; }
    if (this.y < 10) { this.y = 10; this.vy = 1; }
    if (this.y > FIELD_H - 56) { this.y = FIELD_H - 56; this.vy = -1; }
    if (--this.cool <= 0) {
      this.cool = Math.max(70, 170 - (this.maxHp - this.hp) * 4);
      const p = game.nearestPlayer(this.x + 24, this.y + 24);
      if (p) {
        const a = Math.atan2(p.cy - this.y - 24, p.cx - this.x - 24);
        const n = this.hp < this.maxHp / 2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.28;
          game.projectiles.push(new Projectile(this.x + 24, this.y + 30, Math.cos(aa) * 1.6, Math.sin(aa) * 1.6, 'bottle'));
        }
        sfx.throw();
      }
    }
  }
  hit(game) {
    if (this.state !== 'fight') return false;
    this.hp--;
    this.hitT = 8;
    sfx.bossHit();
    game.addScore(game.lastPopper, 1000, this.x + 24, this.y);
    if (this.hp <= 0) {
      this.state = 'trapped';
      this.bubbleT = 600;
      game.popup(this.x + 24, this.y - 6, 'ПУКНИ ГО!', '#ffe040');
    }
    return true;
  }
  draw(ctx, t) {
    const x = Math.round(this.x), y = Math.round(this.y);
    let img = this.hp < this.maxHp / 3 ? SPR.bossAngry : SPR.boss;
    if (this.hitT > 0 && this.hitT % 2) img = SPR.bossHit;
    if (this.state === 'dead') {
      ctx.save(); ctx.translate(x + 24, y + 24); ctx.rotate(this.t * 0.1); ctx.drawImage(img, -24, -24); ctx.restore();
      return;
    }
    ctx.drawImage(img, x, y);
    if (this.state === 'trapped') {
      ctx.strokeStyle = (t >> 3) % 2 ? '#40e040' : '#80ff80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 24, y + 24, 30 + Math.sin(t / 6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(128,255,128,0.2)';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 6, y + 2, 4, 2);
      ctx.fillRect(x + 4, y + 4, 2, 4);
    }
  }
}

export { ROWS };
