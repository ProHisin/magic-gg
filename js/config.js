// 遊戲規則與外觀設定

const D = Math.SQRT1_2; // 讓斜線與直線等長

// 按鍵 -> 方向向量
export const DIRS = {
  q: [-D, -D], w: [0, -1], e: [D, -D],
  a: [-1, 0],              d: [1, 0],
  z: [-D, D],  s: [0, 1],  c: [D, D],
};

// 鍵盤實體按鍵 -> 畫線方向（用 code，按住 Shift 時也能正確辨識）
export const CODE_TO_DIR = {
  KeyQ: 'q', KeyW: 'w', KeyE: 'e',
  KeyA: 'a', KeyD: 'd',
  KeyZ: 'z', KeyS: 's', KeyC: 'c',
};

export const HALF_LEN = 0.5; // Shift 筆畫（連接符）的長度比例

// 主魔法：按鍵順序 -> 魔法種類（新增魔法時也要到 effects.js 寫特效）
// 寫成字串代表必須照順序畫；寫成物件可放寬比對（由 shapes.js 處理）：
//   rotate: 90 | 45  可旋轉（90 只轉直角，45 連斜放的菱形也算）
//   mirror: true     可左右翻轉
//   reverse: true    可反向繞行（順時針、逆時針都行）
//   anyStart: true   封閉圖形可從任一個點起筆
//   anySize: true    可等比放大（例如每邊畫兩筆）
export const SPELLS = {
  eca: 'fire',
  ce: 'water',
  wdsa: { type: 'shield', rotate: 45, reverse: true, anyStart: true, anySize: true }, // 任何正方形
};

// 附加參數：按鍵順序 -> 要覆寫的參數
export const PARAMS = {
  decd: { length: 2 },
};
export const DEFAULT_PARAMS = { length: 1 };

// 魔力
export const MANA = {
  max: 100,     // 魔力上限
  start: 100,   // 開始時的魔力
  regen: 8,     // 每秒自動回復量
};

// 各魔法消耗的魔力
export const SPELL_COST = {
  fire: 25,
  water: 20,
  shield: 35,
};

// 遊戲世界大小（固定座標系，雙方螢幕大小不同也會一致）
export const WORLD = { w: 1000, h: 560 };

// 戰鬥數值
export const COMBAT = {
  maxHp: 100,
  damage: { fire: 25, water: 15 },  // 命中傷害（護盾可完全擋下）
  knockback: { water: 520 },        // 擊退初速（世界單位/秒）
  hitRadius: 24,                    // 人物受擊半徑
};

// 連線設定（PeerJS）
export const NET = {
  prefix: 'magicline-v1-',  // 房間代碼前綴，避免和其他 PeerJS 應用撞名
  codeLength: 5,            // 房間代碼長度
  sendHz: 20,               // 每秒同步人物狀態的次數
  connectTimeoutMs: 12000,
  // 傳給 new Peer() 的選項；預設使用 PeerJS 公用伺服器，自架時可填 host、port、path
  peerOptions: { debug: 0 },
};

// 魔法的基礎數值（length 參數會乘上射程與護盾寬度）
export const SPELL_BASE = {
  range: 240,          // 投射物飛行距離（世界單位）
  speed: 460,          // 投射物速度（世界單位/秒）
  shieldRadius: 54,    // 護盾離人物的距離
  shieldSpread: 1.1,   // 護盾張開的角度（弧度）
  shieldMs: 3000,      // 護盾持續時間
};

// 人物設定與圖片
// 每個方向一張「橫向排列的影格圖」（sprite sheet），frames 是影格數量。
// 只有單張圖就把 frames 設為 1。mirror: true 代表把該圖左右翻轉後使用。
// 圖片載入失敗或尚未提供時，會自動畫出內建的替代人物。
export const HERO = {
  size: 72,          // 顯示高度（世界單位）
  speed: 210,        // 移動速度（世界單位/秒）
  animFps: 8,        // 走路動畫每秒影格數
  pixelArt: false,   // 像素風圖片設為 true，放大時不會模糊
  sprites: {
    down:  { src: 'assets/hero/down.png',  frames: 4 },
    up:    { src: 'assets/hero/up.png',    frames: 4 },
    right: { src: 'assets/hero/right.png', frames: 4 },
    left:  { src: 'assets/hero/right.png', frames: 4, mirror: true },
  },
  // 對手的圖片，格式同上；設為 null 代表與自己共用同一組圖片
  opponentSprites: null,
};

// 替代人物（沒有圖片時）與血條的配色
export const PALETTES = {
  me: { robe: '#5b4bb7', hat: '#3d2f86', trim: '#d8b86a', hp: '#6fe09a' },
  op: { robe: '#b8473f', hat: '#7a2723', trim: '#f0d070', hp: '#ff7a6b' },
};

export const COLORS = {
  chalk: '#efe6c8',
  half: '#d8b86a',
  fire: '#ff8a3d',
  water: '#4fb3ff',
  shield: '#7ee0c3',
  fail: '#e5484d',
};

export const FAIL_MS = 900; // 失敗時紅線停留時間

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
