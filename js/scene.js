// 上方遊戲畫面：草地、人物、魔法

import { COLORS, MANA, WORLD, HERO, COMBAT, PALETTES, reduceMotion } from './config.js';
import { rand, hexA, seeded } from './utils.js';
import { sceneCtx as ctx, size } from './canvas.js';
import { game, parseSpell, spellCost, showOpponent } from './game.js';
import { fx } from './effects.js';
import { me, op, drawHero } from './hero.js';

let grass = null; // 預先畫好的草地，尺寸改變時才重畫

export function drawScene() {
  const { w, h } = size.scene;
  if (!w) return;

  if (!grass || grass.w !== w || grass.h !== h || grass.dpr !== size.dpr) {
    grass = { w, h, dpr: size.dpr, canvas: buildGrass(w, h, size.dpr) };
  }

  ctx.save();
  if (fx.shake > 0.3) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));

  ctx.drawImage(grass.canvas, -12, -12, w + 24, h + 24);

  // 世界座標 → 畫面：等比縮放並置中，雙方看到的場地比例一致
  const scale = Math.min(w / WORLD.w, h / WORLD.h);
  ctx.translate((w - WORLD.w * scale) / 2, (h - WORLD.h * scale) / 2);
  ctx.scale(scale, scale);

  drawArena();
  drawRipples();

  const heroes = [{ h: me, pal: PALETTES.me, set: HERO.sprites }];
  if (showOpponent()) heroes.push({ h: op, pal: PALETTES.op, set: HERO.opponentSprites || HERO.sprites });
  heroes.sort((a, b) => a.h.y - b.h.y); // 下方的人畫在前面
  for (const { h: hh, pal, set } of heroes) drawHero(ctx, hh, pal, set);

  drawShields();
  drawProjectiles();
  drawParticles();
  if (showOpponent()) for (const { h: hh, pal } of heroes) drawHpBar(hh, pal.hp);

  ctx.restore();
  drawManaBar(w); // 介面不跟著畫面震動
}

// 場地邊界
function drawArena() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 240, 0.22)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(4, 4, WORLD.w - 8, WORLD.h - 8, 18) : ctx.rect(4, 4, WORLD.w - 8, WORLD.h - 8);
  ctx.stroke();
  ctx.restore();
}

// 頭上的血條
function drawHpBar(h, color) {
  const bw = 58, bh = 7;
  const x = h.x - bw / 2, y = h.y - HERO.size - 22;
  const ratio = Math.max(0, h.hp / COMBAT.maxHp);
  ctx.save();
  ctx.fillStyle = 'rgba(15, 20, 30, 0.6)';
  ctx.fillRect(x - 2, y - 2, bw + 4, bh + 4);
  ctx.fillStyle = h.hurt > 0 ? '#ffffff' : color;
  ctx.fillRect(x, y, bw * ratio, bh);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(x, y, bw * ratio, bh * 0.4);
  ctx.restore();
}

function buildGrass(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round((w + 24) * dpr);
  c.height = Math.round((h + 24) * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const W = w + 24, H = h + 24;
  const rnd = seeded(7);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#6aa84f');
  base.addColorStop(1, '#4f8f3e');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // 深淺色塊
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W, y = rnd() * H, r = 60 + rnd() * 140;
    const light = rnd() > 0.5;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, light ? 'rgba(160,210,110,0.25)' : 'rgba(40,90,40,0.22)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 草叢
  const tufts = Math.round((W * H) / 2600);
  g.lineCap = 'round';
  for (let i = 0; i < tufts; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.strokeStyle = rnd() > 0.35 ? 'rgba(48,105,40,0.75)' : 'rgba(150,205,105,0.7)';
    g.lineWidth = 1.4;
    for (let b = -1; b <= 1; b++) {
      g.beginPath();
      g.moveTo(x + b * 2, y);
      g.quadraticCurveTo(x + b * 3, y - 4, x + b * 5 + (rnd() - 0.5) * 3, y - 7 - rnd() * 4);
      g.stroke();
    }
  }

  // 小花
  const flowerCols = ['#fff7e8', '#ffe27a', '#f7a8c8', '#c9b6ff'];
  const flowers = Math.round((W * H) / 16000);
  for (let i = 0; i < flowers; i++) {
    const x = rnd() * W, y = rnd() * H;
    const col = flowerCols[(rnd() * flowerCols.length) | 0];
    g.fillStyle = col;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.beginPath(); g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f2b33d';
    g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function drawRipples() {
  ctx.lineWidth = 2;
  for (const r of fx.ripples) {
    if (r.delay > 0) continue;
    ctx.strokeStyle = hexA('#d6f0ff', 0.8 * r.life);
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * 2, r.r * 1.2, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawShields() {
  for (const s of fx.shields) {
    if (s.x === undefined) continue;
    const fadeIn = Math.min(1, (s.max - s.life) / 150);
    const fadeOut = Math.min(1, s.life / 400);
    const flicker = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(game.t / 60);
    const a = fadeIn * fadeOut * flicker;
    const a0 = s.angle - s.spread / 2, a1 = s.angle + s.spread / 2;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = COLORS.shield;
    ctx.shadowBlur = 20;

    // 半透明的護盾面
    ctx.fillStyle = hexA(COLORS.shield, 0.12 * a);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius + 6, a0, a1);
    ctx.arc(s.x, s.y, s.radius - 6, a1, a0, true);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hexA(COLORS.shield, 0.9 * a);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius + 6, a0, a1); ctx.stroke();
    ctx.strokeStyle = hexA('#e9fff8', 0.7 * a);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius - 6, a0, a1); ctx.stroke();

    // 符文刻度
    const ticks = Math.max(3, Math.round(s.spread * 6));
    ctx.lineWidth = 2;
    for (let i = 0; i <= ticks; i++) {
      const t = a0 + (i / ticks) * s.spread;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(t) * (s.radius - 6), s.y + Math.sin(t) * (s.radius - 6));
      ctx.lineTo(s.x + Math.cos(t) * (s.radius + 6), s.y + Math.sin(t) * (s.radius + 6));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawProjectiles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.projectiles) {
    const r = p.size;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
    if (p.type === 'fire') {
      g.addColorStop(0, 'rgba(255,250,220,1)');
      g.addColorStop(0.35, 'rgba(255,170,60,0.95)');
      g.addColorStop(1, 'rgba(255,60,20,0)');
    } else {
      g.addColorStop(0, 'rgba(240,250,255,1)');
      g.addColorStop(0.4, 'rgba(90,180,255,0.9)');
      g.addColorStop(1, 'rgba(30,110,220,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of fx.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    ctx.globalAlpha = p.glow ? a : a * 0.55;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------------- 魔力條 ----------------
let shownMana = MANA.start; // 消耗時緩慢追上的殘影值

function drawManaBar(w) {
  const x = 40, y = 18;
  const bw = Math.min(240, w * 0.4), bh = 12;
  const maxM = MANA.max;
  const cur = game.mana;
  if (shownMana < cur) shownMana = cur;
  else shownMana += (cur - shownMana) * 0.06;

  const toW = v => bw * Math.max(0, Math.min(1, v / maxM));

  ctx.save();

  // 魔力結晶圖示
  ctx.fillStyle = '#8fd0ff';
  ctx.shadowColor = '#5aa9ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 3);
  ctx.lineTo(x - 13, y + bh / 2);
  ctx.lineTo(x - 20, y + bh + 3);
  ctx.lineTo(x - 27, y + bh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // 底框
  roundRect(x - 3, y - 3, bw + 6, bh + 6, (bh + 6) / 2);
  ctx.fillStyle = 'rgba(15, 20, 40, 0.6)';
  ctx.fill();

  ctx.save();
  roundRect(x, y, bw, bh, bh / 2);
  ctx.clip();

  // 剛消耗掉的部分（殘影）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(x, y, toW(shownMana), bh);

  // 目前魔力
  const g = ctx.createLinearGradient(x, 0, x + bw, 0);
  g.addColorStop(0, '#4a8cff');
  g.addColorStop(1, '#9b8bff');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, toW(cur), bh);

  // 預覽：目前畫好的咒語會消耗的量
  const spell = game.mode === 'draw' && game.strokes.length ? parseSpell(game.strokes) : null;
  if (spell) {
    const cost = spellCost(spell);
    const enough = cur >= cost;
    const end = toW(cur);
    const start = Math.max(0, end - toW(cost));
    const blink = reduceMotion ? 0.7 : 0.55 + 0.3 * Math.sin(game.t / 150);
    ctx.fillStyle = hexA(enough ? COLORS.half : COLORS.fail, blink);
    ctx.fillRect(x + start, y, enough ? end - start : toW(cost), bh);
  }

  // 刻度
  ctx.fillStyle = 'rgba(15, 20, 40, 0.45)';
  for (let v = 25; v < maxM; v += 25) ctx.fillRect(x + toW(v) - 1, y, 2, bh);

  // 高光
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(x, y, bw, bh * 0.4);
  ctx.restore();

  // 外框（魔力不足時閃紅）
  roundRect(x - 3, y - 3, bw + 6, bh + 6, (bh + 6) / 2);
  ctx.lineWidth = 1.5;
  if (game.manaFlash > 0) {
    ctx.strokeStyle = hexA(COLORS.fail, 0.4 + 0.6 * game.manaFlash);
    ctx.shadowColor = COLORS.fail;
    ctx.shadowBlur = 14 * game.manaFlash;
  } else {
    ctx.strokeStyle = 'rgba(239, 230, 200, 0.35)';
  }
  ctx.stroke();
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
