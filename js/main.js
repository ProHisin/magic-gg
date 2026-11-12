// 進入點：初始化並啟動主迴圈

import { setupCanvases } from './canvas.js';
import { loadHeroSprites } from './sprites.js';
import { bindInput } from './input.js';
import { initLobby } from './lobby.js';
import { update } from './game.js';
import { drawScene } from './scene.js';
import { drawSlate } from './slate.js';

setupCanvases();
loadHeroSprites(); // 載入人物圖片（路徑設定在 config.js 的 HERO.sprites）
bindInput();
initLobby();

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(50, now - lastTime); // 切回分頁時避免一次跳太多
  lastTime = now;
  update(dt);
  drawScene();
  drawSlate();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
