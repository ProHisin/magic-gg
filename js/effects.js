// 魔法特效：火球、水彈、護盾、失敗灰煙（全部使用世界座標）
// 每個投射物與護盾都有 owner：'me'（自己施放）或 'op'（對手施放）

import { SPELL_BASE, SPLIT, reduceMotion } from './config.js';
import { rand, pick } from './utils.js';

export const fx = {
  particles: [],
  ripples: [],
  projectiles: [],
  shields: [],
  dashes: [],   // 衝刺殘影 { owner, life }
  shake: 0,
};

const FIRE_PAL = ['#fff1a8', '#ffc04a', '#ff8a3d', '#ff4d1f', '#c4250f'];
const WATER_PAL = ['#e6f6ff', '#9fd8ff', '#4fb3ff', '#2178d6'];
const SHIELD_PAL = ['#e9fff8', '#b5f2de', '#7ee0c3'];
const DASH_PAL = ['#ffffff', '#e4dbff', '#c9b6ff', '#9b8bff'];

export function clearEffects() {
  fx.particles = [];
  fx.ripples = [];
  fx.projectiles = [];
  fx.shields = [];
  fx.dashes = [];
  fx.shake = 0;
}

function makeP(x, y, vx, vy, life, color, size, { gravity = 0, drag = 1, glow = true } = {}) {
  return { x, y, vx, vy, life, max: life, color, size, gravity, drag, glow };
}

// 施放魔法：origin 發射點，dir 面朝方向（單位向量），owner 'me' 或 'op'，id 用來跨網路對應投射物
export function castSpell(type, params, origin, dir, owner, id) {
  const len = params.length;

  if (type === 'fire' || type === 'water') {
    const range = SPELL_BASE.range * len;
    const path = params.path || [];
    fx.projectiles.push({
      id, owner, type,
      x: origin.x, y: origin.y,
      dx: dir.x, dy: dir.y,
      speed: SPELL_BASE.speed * (params.speed || 1),
      range,
      traveled: 0,
      path,                                                         // 依序的路徑事件：轉彎角度或 'split'
      eventAt: path.map((_, i) => (range * (i + 1)) / (path.length + 1)), // 平均分布的事件點
      next: 0,
      power: 1,                                                     // 傷害與擊退倍率（分岔後變小）
      size: (type === 'fire' ? 12 : 9) * (len > 1 ? 1.25 : 1),
    });
    burst(origin.x, origin.y, type === 'fire' ? FIRE_PAL : WATER_PAL, 14, 2.5, 1);
  } else if (type === 'shield') {
    fx.shields.push({
      owner,
      angle: Math.atan2(dir.y, dir.x),
      spread: Math.min(Math.PI * 1.7, SPELL_BASE.shieldSpread * len),
      radius: SPELL_BASE.shieldRadius,
      life: SPELL_BASE.shieldMs,
      max: SPELL_BASE.shieldMs,
    });
    burst(origin.x, origin.y, SHIELD_PAL, 18, 2, 1);
  } else if (type === 'dash') {
    // 移動本身由 hero.js 處理（對手的位置靠網路同步），這裡只負責特效
    burst(origin.x, origin.y, DASH_PAL, 16, 3, 1);
    fx.dashes.push({ owner, life: SPELL_BASE.dashMs + 60 });
  }
}

// 撿到道具：白光加上道具顏色的粒子
export function pickupFx(x, y, color) {
  burst(x, y - 10, ['#ffffff', color, color], 26, 3.5, 1);
  fx.ripples.push({ x, y, r: 4, life: 0.7, delay: 0 });
}

// 施法失敗：灰煙 + 震動（shake 為 false 時只有灰煙，用於對手失敗）
export function spawnSmoke(x, y, shake = true) {
  if (shake && !reduceMotion) fx.shake = 10;
  for (let i = 0; i < 46; i++) {
    const g = 90 + Math.random() * 60;
    fx.particles.push(makeP(
      x + rand(-14, 14), y + rand(-6, 4),
      rand(-1.4, 1.4), rand(-2.4, -0.6),
      rand(700, 1200), `rgb(${g},${g},${g + 15})`, rand(7, 14),
      { gravity: -0.01, glow: false }));
  }
}

// 護盾是否擋下投射物：投射物在護盾弧線附近，且角度落在弧線範圍內
export function shieldBlocks(s, p) {
  if (s.x === undefined) return false;
  const d = Math.hypot(p.x - s.x, p.y - s.y);
  if (Math.abs(d - s.radius) > 8 + p.size) return false;
  let diff = Math.atan2(p.y - s.y, p.x - s.x) - s.angle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= s.spread / 2 + 0.08;
}

// 由網路事件結束一個投射物（命中或被擋），並在指定位置播放效果
export function resolveProjectile(id, x, y, blocked, type) {
  const p = fx.projectiles.find(q => q.id === id);
  if (p) fx.projectiles = fx.projectiles.filter(q => q !== p);
  const t = (p && p.type) || type;
  if (blocked) {
    burst(x, y, SHIELD_PAL, 30, 4, 1.2);
    burst(x, y, t === 'water' ? WATER_PAL : FIRE_PAL, 12, 3, 1);
  } else if (t) {
    explode({ type: t, x, y });
  }
}

function burst(x, y, pal, n, speed, k) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rand(0.3, 1) * speed;
    fx.particles.push(makeP(x, y, Math.cos(a) * v, Math.sin(a) * v,
      rand(250, 500), pick(pal), rand(3, 7) * k, { drag: 0.92 }));
  }
}

function explode(p) {
  const { x, y } = p;
  if (p.type === 'fire') {
    burst(x, y, FIRE_PAL, 60, 6, 1.6);
    if (!reduceMotion) fx.shake = Math.max(fx.shake, 4);
  } else {
    burst(x, y, WATER_PAL, 45, 5, 1);
    for (let i = 0; i < 3; i++) fx.ripples.push({ x, y, r: 4, life: 1, delay: i * 140 });
  }
}

// 依距離前進；剛好走到事件點時先轉向（或分岔）再走剩下的距離，讓雙方畫面的路徑一致
function moveProjectile(p, step) {
  while (step > 1e-9 && !p.done) {
    const hasEvent = p.next < p.path.length;
    const target = hasEvent ? p.eventAt[p.next] : p.range;
    const d = Math.min(step, target - p.traveled);
    p.x += p.dx * d;
    p.y += p.dy * d;
    p.traveled += d;
    step -= d;
    if (p.traveled < target - 1e-9) break;

    if (hasEvent) {
      const ev = p.path[p.next];
      p.next++;
      if (ev === 'split') splitProjectile(p, step);
      else turnProjectile(p, ev);
    } else {
      p.done = true;
      explode(p);
    }
  }
}

// 分岔：原本那支當作中間一支，其餘往兩側張開。
// 新的投射物 id 由原本的 id 推算（例如 left-3/1），雙方算出來的結果相同，命中判定才能對應。
// rest 是這一幀還沒走完的距離，新的投射物會立刻補走，和原本那支保持同步。
function splitProjectile(p, rest) {
  const n = Math.max(1, Math.round(SPLIT.count));
  p.power *= SPLIT.power;
  p.size *= SPLIT.size;

  // 每一支的偏轉角度，例如 3 支、30° → [-30, 0, 30]
  const offsets = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * SPLIT.angle);
  // 原本那支取最接近 0° 的角度（奇數時正好是 0，偶數時偏一邊）
  const keep = Math.floor((n - 1) / 2);
  const base = { dx: p.dx, dy: p.dy };

  const children = [];
  offsets.forEach((deg, i) => {
    if (i === keep) return;
    const c = { ...p, ...base, id: `${p.id}/${i}`, done: false };
    rotateDir(c, deg);
    children.push(c);
  });
  rotateDir(p, offsets[keep]);

  burst(p.x, p.y, p.type === 'fire' ? FIRE_PAL : WATER_PAL, 18, 3.5, 1);
  for (const c of children) {
    fx.projectiles.push(c);
    moveProjectile(c, rest);
  }
}

function rotateDir(p, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.dx * c - p.dy * s;
  const dy = p.dx * s + p.dy * c;
  p.dx = dx; p.dy = dy;
}

// 畫面座標 y 向下，所以正角度是順時針（右轉）
function turnProjectile(p, deg) {
  rotateDir(p, deg);
  burst(p.x, p.y, p.type === 'fire' ? FIRE_PAL : WATER_PAL, 10, 2.5, 0.8);
}

function trail(p, f) {
  const back = 1.2;
  if (p.type === 'fire') {
    for (let i = 0; i < 4 * f; i++) {
      fx.particles.push(makeP(
        p.x + rand(-4, 4), p.y + rand(-4, 4),
        -p.dx * back + rand(-0.6, 0.6), -p.dy * back + rand(-0.6, 0.6),
        rand(250, 450), pick(FIRE_PAL), rand(4, 9), { drag: 0.94, gravity: -0.04 }));
    }
  } else {
    for (let i = 0; i < 3 * f; i++) {
      fx.particles.push(makeP(
        p.x + rand(-3, 3), p.y + rand(-3, 3),
        -p.dx * back + rand(-0.8, 0.8), -p.dy * back + rand(-0.8, 0.8),
        rand(300, 500), pick(WATER_PAL), rand(2, 5), { drag: 0.9 }));
    }
  }
}

// anchors：{ me: {x, y}, op: {x, y} }，護盾跟隨各自主人的身體中心
export function updateEffects(dt, f, anchors) {
  // 用複本走訪：分岔時新增的投射物在 splitProjectile 裡已經走過這一幀
  for (const p of [...fx.projectiles]) {
    moveProjectile(p, p.speed * dt / 1000);
  }
  for (const p of fx.projectiles) {
    if (!p.done) trail(p, f);
  }
  fx.projectiles = fx.projectiles.filter(p => !p.done);

  for (const s of fx.shields) {
    const a = anchors[s.owner];
    s.x = a.x; s.y = a.y;
    s.life -= dt;
    if (Math.random() < 0.3 * f) {
      const t = s.angle + rand(-0.5, 0.5) * s.spread;
      fx.particles.push(makeP(s.x + Math.cos(t) * s.radius, s.y + Math.sin(t) * s.radius,
        Math.cos(t) * 0.4, Math.sin(t) * 0.4, rand(300, 600), pick(SHIELD_PAL), rand(2, 4)));
    }
  }
  fx.shields = fx.shields.filter(s => s.life > 0);

  for (const d of fx.dashes) {
    const a = anchors[d.owner];
    d.life -= dt;
    for (let i = 0; i < 3 * f; i++) {
      fx.particles.push(makeP(a.x + rand(-10, 10), a.y + rand(-22, 22), rand(-0.3, 0.3), rand(-0.3, 0.3),
        rand(200, 380), pick(DASH_PAL), rand(4, 8), { drag: 0.9 }));
    }
  }
  fx.dashes = fx.dashes.filter(d => d.life > 0);

  for (const p of fx.particles) {
    p.vx *= Math.pow(p.drag, f);
    p.vy *= Math.pow(p.drag, f);
    p.x += p.vx * f;
    p.y += p.vy * f;
    p.vy += p.gravity * f;
    p.life -= dt;
    p.size *= Math.pow(0.985, f);
  }
  fx.particles = fx.particles.filter(p => p.life > 0 && p.size > 0.4);

  for (const r of fx.ripples) {
    if (r.delay > 0) { r.delay -= dt; continue; }
    r.r += 1.8 * f;
    r.life -= dt / 900;
  }
  fx.ripples = fx.ripples.filter(r => r.life > 0);

  fx.shake *= Math.pow(0.85, f);
}