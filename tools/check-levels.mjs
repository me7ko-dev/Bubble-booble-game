// Проверява всички 100 нива за достижимост: node tools/check-levels.mjs
import { checkRows, levelRows } from '../src/levels.js';
let bad = 0;
const t = Date.now();
for (let n = 1; n <= 100; n++) {
  const r = checkRows(n, levelRows(n));
  if (!r.ok) { bad++; console.log(`Ниво ${n}: най-горе ред ${r.top}, недостигнати редове: ${r.unreached.join(',')}`); }
}
console.log(bad ? `${bad} проблемни нива` : 'Всички нива са проходими', `(${Date.now() - t} ms)`);
