// 人物：自己（方向鍵控制）與對手（依網路資料平滑移動）

import { HERO, WORLD, COMBAT } from './config.js';
import { drawHeroSprite } from './sprites.js';

export const held = new Set(); // 目前按住的方向鍵（ArrowUp 等）

export function makeHero() {
  return {
    x: WORLD.w / 2, y: WORLD.h * 0.6, // 腳底位置（世界座標）
    tx: 0, ty: 0,       // 對手用：網路傳來的目標位置
    fx: 1, fy: 0,       // 面朝方向（單位向量，可為斜向）
    dir: 'right',       // 圖片方向：up / down / left / right
    moving: false,
    animT: 0,
    hp: COMBAT.maxHp,
    hurt: 0,            // 受傷閃爍 1→0
    kx: 0, ky: 0,       // 擊退速度
  };
}

export const me = makeHero();
export const op = makeHero();

export function dirOf(fx, fy) {
  return Math.abs(fx) >= Math.abs(fy) ? (fx > 0 ? 'right' : 'left') : (fy > 0 ? 'down' : 'up');
}

// 開局時放到左側或右側，面向場地中央
export function placeHero(h, side) {
  h.x = h.tx = side === 'left' ? WORLD.w * 0.22 : WORLD.w * 0.78;
  h.y = h.ty = WORLD.h * 0.6;
  h.fx = side === 'left' ? 1 : -1;
  h.fy = 0;
  h.dir = dirOf(h.fx, h.fy);
  h.moving = false;
  h.animT = 0;
  h.hp = COMBAT.maxHp;
  h.hurt = 0;
  h.kx = h.ky = 0;
}

function clamp(h) {
  const s = HERO.size;
  h.x = Math.min(Math.max(h.x, s * 0.4), WORLD.w - s * 0.4);
  h.y = Math.min(Math.max(h.y, s), WORLD.h - 6);
}

export function updateLocalHero(h, dt, canMove) {
  const f = dt / 16.67;
  let dx = 0, dy = 0;
  if (canMove) {
    dx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    dy = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
  }
  h.moving = dx !== 0 || dy !== 0;

  if (h.moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    h.fx = dx; h.fy = dy;
    h.dir = dirOf(dx, dy);
    const step = HERO.speed * dt / 1000;
    h.x += dx * step;
    h.y += dy * step;
    h.animT += dt;
  } else {
    h.animT = 0;
  }

  // 擊退
  h.x += h.kx * dt / 1000;
  h.y += h.ky * dt / 1000;
  h.kx *= Math.pow(0.86, f);
  h.ky *= Math.pow(0.86, f);

  h.hurt = Math.max(0, h.hurt - dt / 500);
  clamp(h);
}

export function updateRemoteHero(h, dt) {
  const dist = Math.hypot(h.tx - h.x, h.ty - h.y);
  if (dist > 220) { h.x = h.tx; h.y = h.ty; }   // 差太多直接對齊
  else {
    const a = Math.min(1, dt / 70);
    h.x += (h.tx - h.x) * a;
    h.y += (h.ty - h.y) * a;
  }
  h.animT = h.moving ? h.animT + dt : 0;
  h.hurt = Math.max(0, h.hurt - dt / 500);
}

// 人物身體中心（受擊判定與護盾圍繞的點）
export function heroCenter(h) {
  return { x: h.x, y: h.y - HERO.size * 0.45 };
}

// 魔法發射點：身體中心往面朝方向偏移
export function castOrigin(h) {
  const c = heroCenter(h);
  return { x: c.x + h.fx * HERO.size * 0.4, y: c.y + h.fy * HERO.size * 0.3 };
}

export function drawHero(ctx, h, palette, spriteSet) {
  const s = HERO.size;
  const frame = h.moving ? Math.floor((h.animT / 1000) * HERO.animFps) : 0;

  ctx.fillStyle = 'rgba(20, 40, 15, 0.3)';
  ctx.beginPath();
  ctx.ellipse(h.x, h.y, s * 0.28, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (h.hurt > 0 && Math.floor(h.hurt * 12) % 2) ctx.globalAlpha = 0.35; // 受傷閃爍
  if (!drawHeroSprite(ctx, spriteSet, h.dir, frame, h.x, h.y, s)) {
    drawPlaceholder(ctx, h, s, frame, palette);
  }
  ctx.restore();
}

// 圖片還沒提供時使用的簡單法師
function drawPlaceholder(ctx, h, s, frame, pal) {
  const bob = h.moving ? Math.abs(Math.sin(frame * Math.PI / 2)) * s * 0.04 : 0;
  const step = h.moving ? (frame % 2 ? 1 : -1) * s * 0.05 : 0;
  const x = h.x, y = h.y - bob;

  ctx.fillStyle = '#3a2c4f';
  ctx.beginPath(); ctx.ellipse(x - s * 0.09, h.y - s * 0.03 + step, s * 0.06, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.09, h.y - s * 0.03 - step, s * 0.06, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = pal.robe;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.24, y - s * 0.06);
  ctx.quadraticCurveTo(x, y + s * 0.02, x + s * 0.24, y - s * 0.06);
  ctx.lineTo(x + s * 0.13, y - s * 0.52);
  ctx.lineTo(x - s * 0.13, y - s * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.trim;
  ctx.fillRect(x - s * 0.17, y - s * 0.3, s * 0.34, s * 0.035);

  const hx = x + h.fx * s * 0.03, hy = y - s * 0.62;
  ctx.fillStyle = '#f2d3b3';
  ctx.beginPath(); ctx.arc(hx, hy, s * 0.13, 0, Math.PI * 2); ctx.fill();

  if (h.dir !== 'up') {
    ctx.fillStyle = '#2a2238';
    const ex = h.fx * s * 0.06;
    const ey = hy + Math.max(0, h.fy) * s * 0.02;
    if (h.dir === 'down') {
      ctx.beginPath(); ctx.arc(hx - s * 0.045 + ex, ey, s * 0.018, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + s * 0.045 + ex, ey, s * 0.018, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(hx + ex, ey, s * 0.018, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = pal.hat;
  ctx.beginPath();
  ctx.ellipse(hx, hy - s * 0.08, s * 0.2, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.12, hy - s * 0.09);
  ctx.lineTo(hx - h.fx * s * 0.08, hy - s * 0.36);
  ctx.lineTo(hx + s * 0.12, hy - s * 0.09);
  ctx.closePath();
  ctx.fill();
}
