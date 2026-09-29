// Звук – синтезиран в реално време (WebAudio). Музиката е собствена мелодия.
let ac = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let muted = false;
try { muted = localStorage.getItem('balon-muted') === '1'; } catch { /* няма storage */ }

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ac.destination);
  musicGain = ac.createGain();
  musicGain.gain.value = 0.32;
  musicGain.connect(master);
  sfxGain = ac.createGain();
  sfxGain.gain.value = 0.7;
  sfxGain.connect(master);
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('balon-muted', muted ? '1' : '0'); } catch { /* */ }
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export const isMuted = () => muted;

function tone(type, f0, f1, dur, vol = 0.3, when = 0, dest = sfxGain) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, vol = 0.3, freq = 3000, when = 0, dest = sfxGain) {
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + when;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const N = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (idx - 9) / 12 + (Number(m[3]) - 4));
};

export const sfx = {
  jump: () => tone('square', 260, 520, 0.12, 0.12),
  shoot: () => { tone('sine', 900, 300, 0.1, 0.25); noise(0.05, 0.1, 2000); },
  trap: () => tone('triangle', 300, 900, 0.18, 0.3),
  pop: () => { tone('sine', 1200, 400, 0.07, 0.25); noise(0.04, 0.12, 5000); },
  kill: (n = 1) => {
    for (let i = 0; i < 4; i++) tone('square', N('C5') * Math.pow(1.26, i + n), N('C5') * Math.pow(1.26, i + n), 0.07, 0.12, i * 0.05);
  },
  fruit: () => { tone('square', N('E6'), N('E6'), 0.05, 0.1); tone('square', N('B6'), N('B6'), 0.08, 0.1, 0.05); },
  item: () => { [0, 4, 7, 12].forEach((s, i) => tone('triangle', N('C5') * Math.pow(2, s / 12), N('C5') * Math.pow(2, s / 12), 0.1, 0.25, i * 0.06)); },
  letter: () => { [0, 7, 12, 19].forEach((s, i) => tone('square', N('G5') * Math.pow(2, s / 12), N('G5') * Math.pow(2, s / 12), 0.08, 0.12, i * 0.05)); },
  extend: () => {
    const m = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6', 'G6'];
    m.forEach((n, i) => tone('square', N(n), N(n), 0.12, 0.14, i * 0.1));
  },
  die: () => { tone('square', 700, 60, 0.9, 0.2); noise(0.3, 0.15, 800, 0.1); },
  hurry: () => { for (let i = 0; i < 6; i++) tone('square', i % 2 ? 880 : 660, i % 2 ? 880 : 660, 0.1, 0.12, i * 0.12); },
  clear: () => {
    const m = ['G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'G6'];
    m.forEach((n, i) => tone('triangle', N(n), N(n), 0.12, 0.25, i * 0.07));
  },
  bolt: () => { noise(0.3, 0.3, 6000); tone('sawtooth', 1500, 200, 0.25, 0.1); },
  fire: () => noise(0.5, 0.25, 600),
  water: () => { noise(0.8, 0.2, 1200); tone('sine', 300, 150, 0.6, 0.15); },
  bossHit: () => { tone('square', 200, 80, 0.15, 0.25); noise(0.1, 0.2, 1500); },
  boom: () => { noise(0.8, 0.5, 300); tone('sine', 120, 30, 0.8, 0.4); },
  bounce: () => tone('sine', 400, 800, 0.08, 0.15),
  throw: () => tone('triangle', 500, 200, 0.1, 0.12),
  start: () => { ['C5', 'G5', 'C6'].forEach((n, i) => tone('square', N(n), N(n), 0.1, 0.15, i * 0.08)); },
  select: () => tone('square', N('A5'), N('A5'), 0.05, 0.12),
  pause: () => tone('square', N('E5'), N('E5'), 0.08, 0.12),
};

// ─── Музика: малък секвенсер с поглед напред ──────────────
// '.' – пауза, '-' – задържане на предишната нота.
const SONGS = {
  main: {
    bpm: 148,
    lead: [
      'C5 . E5 G5 A5 G5 E5 C5', 'D5 - F5 A5 G5 - E5 -', 'C5 . E5 G5 C6 B5 A5 G5', 'F5 E5 D5 E5 C5 - - .',
      'A4 C5 E5 A5 G5 E5 C5 E5', 'F5 - A5 - G5 F5 E5 D5', 'E5 G5 C6 G5 A5 F5 D5 B4', 'C5 - G4 - C5 - . .',
      'E5 . E5 F5 G5 . G5 A5', 'G5 F5 E5 D5 E5 - C5 -', 'D5 . D5 E5 F5 . F5 G5', 'F5 E5 D5 C5 D5 - G4 -',
      'C5 E5 G5 C6 B5 G5 E5 B4', 'A4 C5 F5 A5 G5 F5 D5 B4', 'C5 E5 G5 E5 F5 A5 G5 F5', 'E5 - D5 - C5 - . .',
    ],
    bass: ['C3', 'D3', 'C3', 'F3', 'A2', 'F3', 'G3', 'C3', 'C3', 'G2', 'D3', 'G2', 'C3', 'F3', 'C3', 'G2'],
  },
  boss: {
    bpm: 168,
    lead: [
      'A4 . C5 E5 D5 C5 B4 G4', 'A4 . C5 E5 F5 E5 D5 B4', 'A4 . C5 E5 A5 G5 E5 C5', 'D5 C5 B4 G#4 A4 - - .',
      'F5 . F5 E5 D5 . D5 C5', 'B4 . B4 C5 D5 E5 G#4 -', 'A4 C5 E5 A5 G#5 E5 B4 G#4', 'A4 - E4 - A4 - . .',
    ],
    bass: ['A2', 'A2', 'F2', 'E2', 'D3', 'E2', 'A2', 'A2'],
  },
  title: {
    bpm: 120,
    lead: [
      'G4 C5 E5 G5 - E5 C5 E5', 'F5 - D5 - B4 - G4 -', 'A4 C5 F5 A5 - F5 C5 F5', 'G5 - E5 - C5 - - .',
    ],
    bass: ['C3', 'G2', 'F3', 'C3'],
  },
  ending: {
    bpm: 100,
    lead: [
      'E5 - G5 - C6 - B5 A5', 'G5 - E5 - C5 - - .', 'F5 - A5 - D6 - C6 B5', 'C6 - - - G5 - - .',
      'A5 - G5 - F5 - E5 D5', 'E5 - C5 - G4 - - .', 'F5 E5 D5 C5 B4 C5 D5 B4', 'C5 - - - - - . .',
    ],
    bass: ['C3', 'C3', 'F3', 'C3', 'F3', 'C3', 'G2', 'C3'],
  },
};

let current = null;
let step = 0;
let nextTime = 0;
let timer = null;
let tempoMul = 1;
let leadNotes = [];

function compile(song) {
  const notes = [];
  for (const bar of song.lead) notes.push(...bar.split(' '));
  return notes;
}

export function playMusic(name, speed = 1) {
  if (!ac) return;
  const song = SONGS[name];
  if (current === song && tempoMul === speed) return;
  if (current !== song) { step = 0; leadNotes = compile(song); }
  current = song;
  tempoMul = speed;
  nextTime = Math.max(nextTime, ac.currentTime + 0.05);
  if (!timer) timer = setInterval(schedule, 25);
}

export function stopMusic() {
  current = null;
  if (timer) { clearInterval(timer); timer = null; }
}

function schedule() {
  if (!current || !ac) return;
  const eighth = 60 / (current.bpm * tempoMul) / 2;
  while (nextTime < ac.currentTime + 0.12) {
    const i = step % leadNotes.length;
    const n = leadNotes[i];
    if (n !== '.' && n !== '-') {
      let len = 1;
      while (leadNotes[(i + len) % leadNotes.length] === '-' && len < 8) len++;
      playNote('square', N(n), nextTime, eighth * len * 0.9, 0.13);
    }
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    if (beat % 2 === 0) {
      const root = N(current.bass[bar % current.bass.length]);
      playNote('triangle', beat % 4 === 0 ? root : root * 1.5, nextTime, eighth * 1.6, 0.35);
    }
    if (beat % 2 === 1) hat(nextTime);
    nextTime += eighth;
    step++;
  }
}

function playNote(type, f, t, dur, vol) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hat(t) {
  if (!noiseBuf) noise(0.001, 0);
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s.connect(f).connect(g).connect(musicGain);
  s.start(t);
  s.stop(t + 0.05);
}
