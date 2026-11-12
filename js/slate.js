// 下方畫線區：格點、線條（半長筆畫為金色）、筆尖、殘影

import { COLORS, reduceMotion } from './config.js';
import { slateCtx as ctx, size } from './canvas.js';
import { game } from './game.js';

let viewScale = 1; // 圖形變大時自動縮小，避免畫出界

export function drawSlate() {
  const { w, h } = size.slate;
  if (!w) return;

  drawBackground(w, h);

  const S = computeScale(w, h);
  const ox = w / 2, oy = h / 2;
  const toPx = p => ({ x: ox + p.x * S, y: oy + p.y * S });

  drawGrid(w, h, ox, oy, S);
  drawOrigin(ox, oy);

  const gh = game.ghost;
  if (gh) {
    drawStrokes(gh.pts.map(toPx), gh.halves, () => gh.color, Math.max(0, gh.a), 1);
  }
  if (game.points.length > 1) {
    const colorOf = game.mode === 'fail'
      ? () => COLORS.fail
      : half => (half ? COLORS.half : COLORS.chalk);
    drawStrokes(game.points.map(toPx), game.halves, colorOf, 1, game.segAnim);
  }
  if (game.mode === 'draw') drawPenTip(toPx);
}

function drawBackground(w, h) {
  const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  bg.addColorStop(0, '#2b3042');
  bg.addColorStop(1, '#171a26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
}

function computeScale(w, h) {
  const base = Math.min(w, h) * 0.15;
  const pts = game.ghost && game.points.length < 2 ? game.ghost.pts : game.points;
  let ext = 1;
  for (const p of pts) {
    ext = Math.max(ext, Math.abs(p.x) * base / (w * 0.42), Math.abs(p.y) * base / (h * 0.4));
  }
  viewScale += (1 / ext - viewScale) * 0.15;
  return base * viewScale;
}

function drawGrid(w, h, ox, oy, S) {
  ctx.fillStyle = 'rgba(239,230,200,0.12)';
  const nx = Math.ceil(w / 2 / S), ny = Math.ceil(h / 2 / S);
  for (let i = -nx; i <= nx; i++) {
    for (let j = -ny; j <= ny; j++) {
      ctx.beginPath(); ctx.arc(ox + i * S, oy + j * S, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawOrigin(ox, oy) {
  ctx.strokeStyle = 'rgba(239,230,200,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ox, oy, 9, 0, Math.PI * 2); ctx.stroke();
}

function drawPenTip(toPx) {
  const pts = game.points;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] || last;
  const k = game.segAnim;
  const tip = toPx({ x: prev.x + (last.x - prev.x) * k, y: prev.y + (last.y - prev.y) * k });
  const pulse = reduceMotion ? 0 : Math.sin(game.t / 260) * 2;
  const halfMode = game.shiftHeld || game.halfNext;
  const col = halfMode ? COLORS.half : COLORS.chalk;
  const r = (halfMode ? 5 : 7) + pulse;

  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// 逐段繪製；lastProgress < 1 時最後一段只畫一部分（延伸動畫）
function drawStrokes(px, halves, colorOf, alpha, lastProgress) {
  if (px.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 16;

  for (let i = 1; i < px.length; i++) {
    const a = px[i - 1], b = px[i];
    const p = i === px.length - 1 ? lastProgress : 1;
    const col = colorOf(halves[i]);
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.lineWidth = halves[i] ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  const end = px.length - (lastProgress < 1 ? 1 : 0);
  for (let i = 1; i < end; i++) {
    ctx.fillStyle = colorOf(halves[i]);
    ctx.beginPath(); ctx.arc(px[i].x, px[i].y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
