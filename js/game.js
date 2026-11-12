// 遊戲狀態、施法規則與對戰同步
//
// 咒語格式：主魔法 [½ 參數] [½ 參數] ...
//   一般筆畫組成「字」，Shift 筆畫（長度減半，方向任意）是字與字之間的連接符。
//   第一個字必須是主魔法，後面的字必須是附加參數。
//
// 對戰同步採「各自負責自己」的方式：
//   - 自己的人物位置、施法由自己決定，傳給對手
//   - 對手的魔法是否打中自己，由自己判定，再把結果（命中或被擋）傳回去

import {
  DIRS, PARAMS, DEFAULT_PARAMS, COLORS, FAIL_MS, HALF_LEN,
  MANA, SPELL_COST, COMBAT, NET, WORLD,
} from './config.js';
import { segKey } from './utils.js';
import { matchSpell } from './shapes.js';
import {
  fx, castSpell, spawnSmoke, updateEffects, resolveProjectile, clearEffects, shieldBlocks,
} from './effects.js';
import {
  me, op, held, placeHero, updateLocalHero, updateRemoteHero, castOrigin, heroCenter, dirOf,
} from './hero.js';
import { send, onData } from './net.js';

// ---------------- 畫線狀態 ----------------
export const game = {
  points: [],        // 畫線區的邏輯座標（1 = 一段完整線長）
  halves: [],        // halves[i] 為 true 代表 points[i-1]→points[i] 是半長筆畫
  strokes: [],       // 輸入紀錄 [{ k, half }]
  used: new Set(),   // 已畫過的線段
  segAnim: 1,        // 最後一筆的延伸動畫進度 0~1
  mode: 'draw',      // draw / fail
  timer: 0,
  ghost: null,       // 施法成功後淡出的圖形 { pts, halves, color, a }
  halfNext: false,   // 觸控用：下一筆是否為半長
  shiftHeld: false,  // 鍵盤 Shift 是否按住（用來改變筆尖顏色）
  mana: MANA.start,
  manaFlash: 0,      // 魔力不足時魔力條閃紅 1→0
  t: 0,
};

// ---------------- 對局狀態 ----------------
// state：lobby（大廳）/ solo（單人練習）/ playing（對戰中）/ over（分出勝負）
export const match = { state: 'lobby', side: 'left', result: null };

let listener = () => {};
export const setMatchListener = fn => { listener = fn; };
export const isActive = () => match.state === 'solo' || match.state === 'playing';
export const showOpponent = () => match.state === 'playing' || match.state === 'over';

let castCount = 0;
let sendTimer = 0;

function setState(state, extra = {}) {
  Object.assign(match, { state }, extra);
  listener(match);
}

export function startMatch(mode, side = match.side) {
  clearEffects();
  resetDrawing();
  game.mode = 'draw';
  game.ghost = null;
  game.mana = MANA.start;
  game.manaFlash = 0;
  held.clear();
  placeHero(me, side);
  placeHero(op, side === 'left' ? 'right' : 'left');
  castCount = 0;
  setState(mode, { side, result: null });
}

export function toLobby() {
  clearEffects();
  held.clear();
  setState('lobby', { result: null });
}

function endMatch(result) {
  if (match.state !== 'playing') return;
  setState('over', { result });
}

export function requestRematch() {
  send({ t: 'rematch' });
  startMatch('playing');
}

// ---------------- 畫線 ----------------
export function resetDrawing() {
  game.points = [{ x: 0, y: 0 }];
  game.halves = [false];
  game.strokes = [];
  game.used = new Set();
  game.segAnim = 1;
  game.halfNext = false;
}
resetDrawing();

function addStroke(k, half) {
  const [dx, dy] = DIRS[k];
  const len = half ? HALF_LEN : 1;
  const last = game.points[game.points.length - 1];
  const next = { x: last.x + dx * len, y: last.y + dy * len };
  const key = segKey(last, next);
  game.points.push(next);
  game.halves.push(half);
  game.strokes.push({ k, half });
  game.segAnim = 0;
  if (game.used.has(key)) { fail(); return; } // 線條完全重合，立即失敗
  game.used.add(key);
}

function undo() {
  if (game.points.length < 2) return;
  const b = game.points.pop();
  game.halves.pop();
  game.strokes.pop();
  game.used.delete(segKey(game.points[game.points.length - 1], b));
  game.segAnim = 1;
}

// 把筆畫解析成 { type, params }；不合法時回傳 null
export function parseSpell(strokes) {
  const words = [''];
  for (const s of strokes) {
    if (s.half) words.push('');
    else words[words.length - 1] += s.k;
  }
  if (words.some(w => !w)) return null;

  const type = matchSpell(words[0]);
  if (!type) return null;

  const params = { ...DEFAULT_PARAMS };
  const seen = new Set();
  for (const w of words.slice(1)) {
    if (!PARAMS[w] || seen.has(w)) return null;
    seen.add(w);
    Object.assign(params, PARAMS[w]);
  }
  return { type, params };
}

export function spellCost(spell) {
  return SPELL_COST[spell.type] ?? 0;
}

function cast() {
  if (!game.strokes.length) return;
  const spell = parseSpell(game.strokes);
  if (!spell) { fail(); return; }

  const cost = spellCost(spell);
  if (game.mana < cost) {
    game.manaFlash = 1;
    fail();
    return;
  }
  game.mana -= cost;

  const o = castOrigin(me);
  const dir = { x: me.fx, y: me.fy };
  const id = `${match.side}-${++castCount}`;
  castSpell(spell.type, spell.params, o, dir, 'me', id);
  send({ t: 'cast', id, type: spell.type, params: spell.params, x: o.x, y: o.y, dx: dir.x, dy: dir.y });

  game.ghost = { pts: game.points.slice(), halves: game.halves.slice(), color: COLORS[spell.type], a: 1 };
  resetDrawing();
}

function fail() {
  game.mode = 'fail';
  game.timer = FAIL_MS;
  const o = castOrigin(me);
  spawnSmoke(o.x, o.y);
  send({ t: 'fail', x: o.x, y: o.y });
}

export function handleKey(k, half = false) {
  if (!isActive() || game.mode !== 'draw') return;
  if (DIRS[k]) {
    const h = half || game.halfNext;
    game.halfNext = false;
    addStroke(k, h);
  } else if (k === ' ') cast();
  else if (k === 'half') game.halfNext = !game.halfNext;
  else if (k === 'Backspace') undo();
  else if (k === 'Escape') resetDrawing();
}

// ---------------- 受擊判定（只判定對手打向自己的魔法） ----------------
function checkIncoming() {
  const c = heroCenter(me);
  for (const p of [...fx.projectiles]) {
    if (p.owner !== 'op') continue;

    const shield = fx.shields.find(s => s.owner === 'me' && shieldBlocks(s, p));
    if (shield) {
      resolveProjectile(p.id, p.x, p.y, true);
      send({ t: 'hit', id: p.id, type: p.type, x: p.x, y: p.y, blocked: true });
      continue;
    }

    if (Math.hypot(p.x - c.x, p.y - c.y) <= COMBAT.hitRadius + p.size * 0.6) {
      me.hp = Math.max(0, me.hp - (COMBAT.damage[p.type] ?? 0));
      me.hurt = 1;
      const kb = COMBAT.knockback[p.type];
      if (kb) { me.kx += p.dx * kb; me.ky += p.dy * kb; }
      resolveProjectile(p.id, p.x, p.y, false);
      send({ t: 'hit', id: p.id, type: p.type, x: p.x, y: p.y, blocked: false, hp: me.hp });
      if (me.hp <= 0) endMatch('lose');
    }
  }
}

// ---------------- 網路訊息 ----------------
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const VALID_TYPES = new Set(Object.keys(SPELL_COST));

function onNetMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.t) {
    case 'state': {
      const x = num(msg.x, 0, WORLD.w), y = num(msg.y, 0, WORLD.h);
      const fx_ = num(msg.fx, -1, 1), fy_ = num(msg.fy, -1, 1);
      if (x === null || y === null || fx_ === null || fy_ === null) return;
      op.tx = x; op.ty = y;
      op.fx = fx_; op.fy = fy_;
      op.dir = dirOf(fx_, fy_);
      op.moving = !!msg.moving;
      const hp = num(msg.hp, 0, COMBAT.maxHp);
      if (hp !== null) op.hp = hp;
      if (op.hp <= 0) endMatch('win');
      break;
    }
    case 'cast': {
      if (match.state !== 'playing' || !VALID_TYPES.has(msg.type)) return;
      const x = num(msg.x, -50, WORLD.w + 50), y = num(msg.y, -50, WORLD.h + 50);
      const dx = num(msg.dx, -1, 1), dy = num(msg.dy, -1, 1);
      if (x === null || y === null || dx === null || dy === null) return;
      const len = num(msg.params && msg.params.length, 1, 3) ?? 1;
      castSpell(msg.type, { ...DEFAULT_PARAMS, length: len }, { x, y }, { x: dx, y: dy }, 'op', String(msg.id));
      break;
    }
    case 'fail': {
      const x = num(msg.x, 0, WORLD.w), y = num(msg.y, 0, WORLD.h);
      if (x !== null && y !== null) spawnSmoke(x, y, false);
      break;
    }
    case 'hit': {
      const x = num(msg.x, -50, WORLD.w + 50), y = num(msg.y, -50, WORLD.h + 50);
      if (x === null || y === null) return;
      resolveProjectile(String(msg.id), x, y, !!msg.blocked, VALID_TYPES.has(msg.type) ? msg.type : null);
      if (!msg.blocked) {
        const hp = num(msg.hp, 0, COMBAT.maxHp);
        if (hp !== null) op.hp = hp;
        op.hurt = 1;
        if (op.hp <= 0) endMatch('win');
      }
      break;
    }
    case 'rematch':
      if (match.state === 'playing' || match.state === 'over') startMatch('playing');
      break;
  }
}
onData(onNetMessage);

function sendState(dt) {
  sendTimer -= dt;
  if (sendTimer > 0) return;
  sendTimer = 1000 / NET.sendHz;
  send({
    t: 'state',
    x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10,
    fx: me.fx, fy: me.fy, moving: me.moving, hp: me.hp,
  });
}

// ---------------- 每幀更新 ----------------
export function update(dt) {
  const f = dt / 16.67;
  game.t += dt;
  game.segAnim = Math.min(1, game.segAnim + dt / 110);

  if (game.mode === 'fail') {
    game.timer -= dt;
    if (game.timer <= 0) { game.mode = 'draw'; resetDrawing(); }
  }
  if (game.ghost) {
    game.ghost.a -= dt / 700;
    if (game.ghost.a <= 0) game.ghost = null;
  }
  game.mana = Math.min(MANA.max, game.mana + MANA.regen * dt / 1000);
  game.manaFlash = Math.max(0, game.manaFlash - dt / 700);

  updateLocalHero(me, dt, isActive());
  if (showOpponent()) updateRemoteHero(op, dt);
  updateEffects(dt, f, { me: heroCenter(me), op: heroCenter(op) });

  if (match.state === 'playing') {
    checkIncoming();
    sendState(dt);
  }
}
