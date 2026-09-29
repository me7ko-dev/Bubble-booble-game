// Рисуване на нивото (статично, кеширано в canvas) и на балончетата.
import { COLS, ROWS, TILE, W, FIELD_H } from './consts.js';

function tileCanvas(style, [base, light, dark]) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  g.fillStyle = base;
  g.fillRect(0, 0, 8, 8);
  switch (style) {
    case 0:
      for (let i = 0; i < 8; i++) { px(i, 0, light); px(0, i, light); px(i, 7, dark); px(7, i, dark); }
      px(0, 7, base); px(7, 0, base);
      break;
    case 1:
      for (let i = 0; i < 8; i++) { px(i, 3, dark); px(i, 7, dark); px(i, 0, light); px(i, 4, light); }
      for (let i = 0; i < 3; i++) { px(3, i, dark); px(7, 4 + i, dark); }
      break;
    case 2:
      g.fillStyle = dark; g.fillRect(0, 0, 8, 8);
      g.fillStyle = base; g.fillRect(1, 0, 6, 8); g.fillRect(0, 1, 8, 6);
      px(2, 1, light); px(1, 2, light); px(2, 2, light); px(3, 1, light);
      px(6, 6, dark); px(5, 6, dark); px(6, 5, dark);
      break;
    default:
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (((x >> 1) + (y >> 1)) % 2) px(x, y, light);
      for (let i = 0; i < 8; i++) { px(i, 7, dark); px(7, i, dark); }
  }
  return c;
}

export function renderLevel(level) {
  const c = document.createElement('canvas');
  c.width = W; c.height = FIELD_H;
  const g = c.getContext('2d');
  const tile = tileCanvas(level.tileStyle, level.palette);
  // сянка вдясно-долу, както в старите аркади
  g.fillStyle = level.palette[2];
  g.globalAlpha = 0.55;
  for (let r = 0; r < ROWS; r++) {
    for (let c2 = 2; c2 < COLS - 2; c2++) {
      if (level.solid(c2, r)) g.fillRect(c2 * TILE + 3, r * TILE + 3, TILE, TILE);
    }
  }
  g.globalAlpha = 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c2 = 0; c2 < COLS; c2++) {
      if (level.solid(c2, r)) g.drawImage(tile, c2 * TILE, r * TILE);
    }
  }
  // по-тъмни рамки на страничните стени
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 16, FIELD_H);
  g.fillRect(W - 16, 0, 16, FIELD_H);
  return c;
}
