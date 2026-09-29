export const W = 256;          // вътрешна резолюция
export const H = 224;
export const TILE = 8;
export const COLS = 32;        // игрално поле (с двете стени)
export const ROWS = 26;
export const TOP = 16;         // височина на горния панел с точките
export const FIELD_H = ROWS * TILE;
export const WALL_L = 16;      // вътрешен ръб на лявата стена
export const WALL_R = W - 16;  // вътрешен ръб на дясната стена

export const GRAVITY = 0.12;
export const MAX_FALL = 1.7;
export const JUMP_V = -3.35;

export const LAST_LEVEL = 100;

export const EXTEND = ['E', 'X', 'T', 'E', 'N', 'D'];
