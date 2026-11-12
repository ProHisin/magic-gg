// 形狀比對
// 讓同一個圖形換起點、換繞行方向、旋轉、放大後畫出來，都能對應到同一個魔法。
// 主魔法（SPELLS）與附加參數（PARAMS）共用同一套規則，例如：
//   wdsa: { type: 'shield', rotate: 45, anyStart: true, reverse: true, anySize: true }
//   decd: { set: { length: 2 }, reverse: true }

import { DIRS, SPELLS, PARAMS } from './config.js';

// 八個方向依順時針排列，每一格相差 45°
const RING = ['w', 'e', 'd', 'c', 's', 'z', 'a', 'q'];
const IDX = Object.fromEntries(RING.map((k, i) => [k, i]));

const rotate = (word, n) => [...word].map(k => RING[(IDX[k] + n) % 8]).join('');
const mirror = word => [...word].map(k => RING[(8 - IDX[k]) % 8]).join('');            // 左右翻轉
const reverse = word => [...word].reverse().map(k => RING[(IDX[k] + 4) % 8]).join('');  // 反向繞行
const cyclic = word => [...word].map((_, i) => word.slice(i) + word.slice(0, i));        // 換起點

function isClosed(word) {
  let x = 0, y = 0;
  for (const k of word) { x += DIRS[k][0]; y += DIRS[k][1]; }
  return Math.hypot(x, y) < 1e-6;
}

// 產生一個圖形的所有等價寫法
function variants(word, opt) {
  const set = new Set([word]);
  const expand = fn => { for (const v of [...set]) for (const r of fn(v)) set.add(r); };
  const closed = isClosed(word);

  if (opt.rotate) {
    const step = opt.rotate / 45; // 45 → 每 45° 一種；90 → 只轉直角
    expand(v => Array.from({ length: 8 / step }, (_, i) => rotate(v, i * step)));
  }
  if (opt.mirror) expand(v => [mirror(v)]);
  if (opt.reverse) expand(v => [reverse(v)]);
  if (opt.anyStart && closed) expand(cyclic); // 只有封閉圖形才能任意起點
  return set;
}

// 把等比放大的圖形縮回基本大小：wwddssaa → wdsa
// 每一段連續相同方向的筆畫數都相等才算等比放大，否則回傳 null（例如長方形）
function shrink(word) {
  if (!word) return null;
  // 封閉圖形若從某邊中間起筆（例如 dwwddssaad），先轉到轉角處再比對
  if (isClosed(word) && word[0] === word.at(-1)) {
    let i = 0;
    while (i < word.length && word[i] === word[0]) i++;
    if (i === word.length) return null;
    word = word.slice(i) + word.slice(0, i);
  }
  const runs = word.match(/(.)\1*/g);
  const n = runs[0].length;
  if (runs.some(r => r.length !== n)) return null;
  return runs.map(r => r[0]).join('');
}

// 依設定表建立比對函式；valueOf(key, def) 決定比對成功時回傳的值
function buildMatcher(table, valueOf, label) {
  const exact = new Map();    // 完全相符
  const scalable = new Map(); // 允許放大的圖形（以基本大小查詢）

  for (const [word, def] of Object.entries(table)) {
    const opt = typeof def === 'string' ? {} : def;
    const value = valueOf(word, def);
    for (const v of variants(word, opt)) {
      for (const map of opt.anySize ? [exact, scalable] : [exact]) {
        if (map.has(v) && map.get(v) !== value) {
          console.warn(`${label}衝突：${v} 同時對應 ${map.get(v)} 與 ${value}`);
        } else {
          map.set(v, value);
        }
      }
    }
  }

  return word => {
    if (exact.has(word)) return exact.get(word);
    const base = shrink(word);
    return (base && scalable.get(base)) || null;
  };
}

// 主魔法：回傳魔法種類（'fire' 等）或 null
export const matchSpell = buildMatcher(SPELLS, (_, def) => (typeof def === 'string' ? def : def.type), '咒語');

// 附加參數：回傳 PARAMS 中的原始寫法（例如 'decd'）或 null
export const matchParam = buildMatcher(PARAMS, word => word, '參數');