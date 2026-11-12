// 遊戲狀態、施法規則與對戰同步
//
// 咒語格式：主魔法 [½ 參數] [½ 參數] ...
//   空白鍵立即施放；R 鍵把畫好的咒語先儲存起來（當下就扣魔力），之後再按 R 朝當時的面朝方向發動
//   一般筆畫組成「字」，Shift 筆畫（長度減半，方向任意）是字與字之間的連接符。
//   第一個字必須是主魔法，後面的字必須是附加參數。
//
// 對戰同步採「各自負責自己」的方式：
//   - 自己的人物位置、施法由自己決定，傳給對手
//   - 對手的魔法是否打中自己，由自己判定，再把結果（命中或被擋）傳回去
//   - 場地道具由房主（left）產生並判定誰撿到

import {
  DIRS, PARAMS, DEFAULT_PARAMS, MAX_TURNS, PARAM_COST, COLORS, FAIL_MS, HALF_LEN,
  MANA, SPELL_COST, COMBAT, NET, WORLD, SPELL_BASE, ITEMS,
} from './config.js';
import { segKey } from './utils.js';
import { matchSpell, matchParam } from './shapes.js';
import {
  fx, castSpell, spawnSmoke, updateEffects, resolveProjectile, clearEffects, shieldBlocks, pickupFx,
} from './effects.js';
import { resetItems, addItem, removeItem, touching, updateItems } from './items.js';
import {
  me, op, held, placeHero, updateLocalHero, updateRemoteHero, castOrigin, heroCenter, dirOf, startDash,
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
  stored: null,      // R 鍵儲存的魔法 { type, params, extraCost }
  t: 0,
};

// ---------------- 對局狀態 ----------------
// state：lobby（大廳）/ solo（單人練習）/ playing（對戰中）/ over（分出勝負）
export const match = { state: 'lobby', side: 'left', result: null };

let listener = () => {};
export const setMatchListener = fn => { listener = fn; };
export const isActive = () => match.state === 'solo' || match.state === 'playing';
export const showOpponent = () => match.state === 'playing' || match.state === 'over';
const isHost = () => match.state === 'solo' || match.side === 'left'; // 負責道具的一方
const otherSide = () => (match.side === 'left' ? 'right' : 'left');

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
  game.stored = null;
  resetItems();
  held.clear();
  placeHero(me, side);
  placeHero(op, side === 'left' ? 'right' : 'left');
  castCount = 0;
  setState(mode, { side, result: null });
}

export function toLobby() {
  clearEffects();
  resetItems();
  game.stored = null;
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

  const params = { ...DEFAULT_PARAMS, path: [] };
  const seen = new Set();
  let extraCost = 0;
  for (const w of words.slice(1)) {
    const key = matchParam(w); // 依形狀比對，可反轉
    if (!key) return null;
    const def = PARAMS[key];
    if (seen.has(key) && !def.repeatable) return null; // 不可重複的參數
    seen.add(key);
    if (def.set) Object.assign(params, def.set);
    if (def.turn) params.path.push(def.turn);
    if (def.split) params.path.push('split');
    extraCost += PARAM_COST + (def.cost ?? 0); // 每個參數固定 +PARAM_COST，再加上參數自己的消耗
  }
  if (params.path.filter(e => e !== 'split').length > MAX_TURNS) return null;
  return { type, params, extraCost };
}

export function spellCost(spell) {
  return (SPELL_COST[spell.type] ?? 0) + (spell.extraCost ?? 0);
}

// 取出畫線區的咒語：檢查形狀與魔力，成功就扣魔力、清空畫線區並回傳咒語，失敗回傳 null
function takeDrawnSpell() {
  if (!game.strokes.length) return null;
  const spell = parseSpell(game.strokes);
  if (!spell) { fail(); return null; }

  const cost = spellCost(spell);
  if (game.mana < cost) {
    game.manaFlash = 1;
    fail();
    return null;
  }
  game.mana -= cost;

  game.ghost = { pts: game.points.slice(), halves: game.halves.slice(), color: COLORS[spell.type], a: 1 };
  resetDrawing();
  return spell;
}

// 空白鍵：立即施放
function cast() {
  const spell = takeDrawnSpell();
  if (spell) release(spell);
}

// R 鍵：沒有儲存的魔法時把畫好的咒語存起來；已經有儲存的魔法時發動它（不影響畫到一半的線）
function store() {
  if (game.stored) {
    const spell = game.stored;
    game.stored = null;
    release(spell);
    return;
  }
  if (game.mode !== 'draw') return;
  const spell = takeDrawnSpell();
  if (spell) game.stored = spell;
}

// 朝目前面朝方向放出魔法（魔力已經扣過）
function release(spell) {
  const o = castOrigin(me);
  const dir = { x: me.fx, y: me.fy };
  const id = `${match.side}-${++castCount}`;
  if (spell.type === 'dash') startDash(me, SPELL_BASE.dashDist * spell.params.length, SPELL_BASE.dashMs);
  castSpell(spell.type, spell.params, o, dir, 'me', id);
  send({ t: 'cast', id, type: spell.type, params: spell.params, x: o.x, y: o.y, dx: dir.x, dy: dir.y });
}

function fail() {
  game.mode = 'fail';
  game.timer = FAIL_MS;
  const o = castOrigin(me);
  spawnSmoke(o.x, o.y);
  send({ t: 'fail', x: o.x, y: o.y });
}

export function handleKey(k, half = false) {
  if (!isActive()) return;
  if (k === 'store') { store(); return; } // 失敗冷卻中也能發動已儲存的魔法
  if (game.mode !== 'draw') return;
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
      const power = p.power ?? 1; // 分岔後的投射物威力較小
      me.hp = Math.max(0, me.hp - (COMBAT.damage[p.type] ?? 0) * power);
      me.hurt = 1;
      const kb = COMBAT.knockback[p.type];
      if (kb) { me.kx += p.dx * kb * power; me.ky += p.dy * kb * power; }
      resolveProjectile(p.id, p.x, p.y, false);
      send({ t: 'hit', id: p.id, type: p.type, x: p.x, y: p.y, blocked: false, hp: me.hp });
      if (me.hp <= 0) endMatch('lose');
    }
  }
}

// ---------------- 場地道具 ----------------
function applyItem(kind) {
  const def = ITEMS.kinds[kind];
  if (!def) return;
  if (def.hp) me.hp = Math.min(COMBAT.maxHp, me.hp + def.hp);
  if (def.mana) game.mana = Math.min(MANA.max, game.mana + def.mana);
}

// 道具被撿走或消失；by 是撿到的一方（'left' / 'right'），null 代表過期消失
function takeItem(id, by) {
  const it = removeItem(id);
  if (!it) return;
  if (by) pickupFx(it.x, it.y, ITEMS.kinds[it.kind]?.color ?? '#ffffff');
  if (by === match.side) applyItem(it.kind);
  if (isHost() && match.state === 'playing') send({ t: 'took', id, by });
}

function updateItemsStep(dt) {
  const online = match.state === 'playing';
  const { spawned, expired } = updateItems(dt, isHost());
  if (online) {
    for (const it of spawned) send({ t: 'item', id: it.id, kind: it.kind, x: it.x, y: it.y });
    for (const it of expired) send({ t: 'took', id: it.id, by: null });
  }
  if (!isHost()) return;

  const mine = touching(me);
  if (mine) takeItem(mine.id, match.side);
  if (online) {
    const theirs = touching(op);
    if (theirs) takeItem(theirs.id, otherSide());
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
      castSpell(msg.type, sanitizeParams(msg.params), { x, y }, { x: dx, y: dy }, 'op', String(msg.id));
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
    case 'item': {
      if (match.state !== 'playing' || isHost() || !ITEMS.kinds[msg.kind]) return;
      const x = num(msg.x, 0, WORLD.w), y = num(msg.y, 0, WORLD.h);
      if (x === null || y === null) return;
      addItem({ id: String(msg.id), kind: msg.kind, x, y });
      break;
    }
    case 'took': {
      if (match.state !== 'playing' || isHost()) return;
      const by = msg.by === 'left' || msg.by === 'right' ? msg.by : null;
      takeItem(String(msg.id), by);
      break;
    }
    case 'rematch':
      if (match.state === 'playing' || match.state === 'over') startMatch('playing');
      break;
  }
}
onData(onNetMessage);

// 檢查對手傳來的參數，避免異常數值
function sanitizeParams(p) {
  p = p && typeof p === 'object' ? p : {};
  // 路徑事件只接受 ±90 的轉彎與最多一次分岔
  const path = [];
  let turns = 0, splits = 0;
  for (const e of Array.isArray(p.path) ? p.path : []) {
    if ((e === 90 || e === -90) && turns < MAX_TURNS) { path.push(e); turns++; }
    else if (e === 'split' && splits < 1) { path.push(e); splits++; }
  }
  return {
    ...DEFAULT_PARAMS,
    length: num(p.length, 1, 3) ?? DEFAULT_PARAMS.length,
    speed: num(p.speed, 0.5, 3) ?? DEFAULT_PARAMS.speed,
    path,
  };
}

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
  if (isActive()) updateItemsStep(dt);
  updateEffects(dt, f, { me: heroCenter(me), op: heroCenter(op) });

  if (match.state === 'playing') {
    checkIncoming();
    sendState(dt);
  }
}