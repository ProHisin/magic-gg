// 人物圖片載入與繪製
//
// 使用方式：
//   1. 把圖片放到 config.js 中 HERO.sprites（對手為 HERO.opponentSprites）指定的路徑
//   2. main.js 會在啟動時呼叫 loadHeroSprites()
//   3. hero.js 繪製時呼叫 drawHeroSprite()；回傳 false 代表圖片還不能用，改畫替代人物

import { HERO } from './config.js';

const images = new Map(); // src -> { img, ready }

export function loadHeroSprites() {
  const sets = [HERO.sprites, HERO.opponentSprites].filter(Boolean);
  for (const set of sets) {
    for (const spec of Object.values(set)) {
      if (images.has(spec.src)) continue;
      const entry = { img: new Image(), ready: false };
      entry.img.onload = () => { entry.ready = true; };
      entry.img.onerror = () => { console.info(`找不到人物圖片 ${spec.src}，改用替代人物`); };
      entry.img.src = spec.src;
      images.set(spec.src, entry);
    }
  }
}

// set：一組方向圖片設定；(x, y) 是人物腳底中心；height 是顯示高度
export function drawHeroSprite(ctx, set, dir, frameIndex, x, y, height) {
  const spec = set && set[dir];
  const entry = spec && images.get(spec.src);
  if (!entry || !entry.ready) return false;

  const frames = spec.frames || 1;
  const fw = entry.img.naturalWidth / frames;
  const fh = entry.img.naturalHeight;
  const frame = frameIndex % frames;
  const w = height * (fw / fh);

  ctx.save();
  ctx.imageSmoothingEnabled = !HERO.pixelArt;
  ctx.translate(x, y - height);
  if (spec.mirror) ctx.scale(-1, 1);
  ctx.drawImage(entry.img, frame * fw, 0, fw, fh, -w / 2, 0, w, height);
  ctx.restore();
  return true;
}
