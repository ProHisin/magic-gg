// 共用小工具

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 可指定種子的亂數，讓草地裝飾在縮放視窗時保持一致
export function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 線段的唯一鍵值（不分方向，用來判斷是否完全重合）
const r3 = v => Math.round(v * 1000) / 1000;
export function segKey(a, b) {
  const p = `${r3(a.x)},${r3(a.y)}`;
  const q = `${r3(b.x)},${r3(b.y)}`;
  return p < q ? `${p}|${q}` : `${q}|${p}`;
}
