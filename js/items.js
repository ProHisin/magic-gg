// 場地道具：回血、回魔
// 只有房主（或單人練習）會產生道具與判定撿取，再把結果傳給對手，避免兩邊同時撿到同一個。

import { ITEMS, WORLD, HERO } from './config.js';
import { rand } from './utils.js';

export const items = []; // { id, kind, x, y, life, t }

let timer = ITEMS.firstMs;
let count = 0;

export function resetItems() {
  items.length = 0;
  timer = ITEMS.firstMs;
  count = 0;
}

export function addItem(it) {
  if (items.some(i => i.id === it.id)) return;
  items.push({ id: it.id, kind: it.kind, x: it.x, y: it.y, life: ITEMS.lifeMs, t: 0 });
}

export function removeItem(id) {
  const i = items.findIndex(it => it.id === id);
  return i < 0 ? null : items.splice(i, 1)[0];
}

// 人物腳底碰到的道具（沒有就回傳 undefined）
export function touching(h) {
  return items.find(it => Math.hypot(it.x - h.x, it.y - h.y) <= ITEMS.pickupRadius);
}

function pickKind() {
  const entries = Object.entries(ITEMS.kinds);
  let r = Math.random() * entries.reduce((sum, [, k]) => sum + (k.weight ?? 1), 0);
  for (const [name, k] of entries) {
    r -= k.weight ?? 1;
    if (r <= 0) return name;
  }
  return entries[0][0];
}

function makeItem() {
  const m = ITEMS.margin;
  return {
    id: `i${++count}`,
    kind: pickKind(),
    x: Math.round(rand(m, WORLD.w - m)),
    y: Math.round(rand(Math.max(m, HERO.size + 10), WORLD.h - m / 2)),
  };
}

// 每幀更新。host 為 true 時負責產生與移除道具，回傳這一幀新出現與過期的道具
export function updateItems(dt, host) {
  const spawned = [], expired = [];
  for (const it of items) { it.t += dt; it.life -= dt; }

  if (host) {
    for (const it of [...items]) {
      if (it.life <= 0) { removeItem(it.id); expired.push(it); }
    }
    timer -= dt;
    if (timer <= 0) {
      timer = rand(ITEMS.intervalMs[0], ITEMS.intervalMs[1]);
      if (items.length < ITEMS.max) {
        const it = makeItem();
        addItem(it);
        spawned.push(it);
      }
    }
  } else {
    // 非房主正常會收到房主的移除訊息；萬一沒收到，過期太久就自己移除
    for (const it of [...items]) if (it.life < -2000) removeItem(it.id);
  }
  return { spawned, expired };
}
