// 鍵盤與觸控輸入
//   方向鍵        移動人物
//   q w e a d z s c  畫線（按住 Shift 為半長筆畫）
//   空白鍵        施法
//   Backspace     復原上一筆
//   Esc           清除

import { CODE_TO_DIR } from './config.js';
import { game, handleKey, isActive } from './game.js';
import { held } from './hero.js';

const MOVE_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function bindInput() {
  window.addEventListener('keydown', e => {
    if (e.key === 'Shift') game.shiftHeld = true;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea')) return; // 正在輸入房間代碼
    if (!isActive()) return; // 大廳或結算畫面時不攔截按鍵

    if (MOVE_CODES.has(e.code)) {
      e.preventDefault();
      held.add(e.code);
      return;
    }

    const dir = CODE_TO_DIR[e.code];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) handleKey(dir, e.shiftKey);
    } else if (e.code === 'Space') {
      e.preventDefault(); // 避免頁面捲動
      if (!e.repeat) handleKey(' ');
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      e.preventDefault();
      if (!e.repeat) handleKey(e.key);
    }
    syncHalfButton();
  });

  window.addEventListener('keyup', e => {
    if (e.key === 'Shift') game.shiftHeld = false;
    held.delete(e.code);
  });

  // 視窗失去焦點時放開所有按鍵，避免人物一直走
  window.addEventListener('blur', () => {
    held.clear();
    game.shiftHeld = false;
  });

  bindTouchPads();
}

const halfBtn = document.querySelector('.stroke-pad .half');
function syncHalfButton() {
  if (halfBtn) halfBtn.classList.toggle('on', game.halfNext);
}

function bindTouchPads() {
  document.querySelectorAll('.stroke-pad button').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      handleKey(btn.dataset.k);
      syncHalfButton();
    });
  });

  document.querySelectorAll('.move-pad button').forEach(btn => {
    const code = btn.dataset.move;
    const release = () => held.delete(code);
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!isActive()) return;
      btn.setPointerCapture(e.pointerId);
      held.add(code);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  });
}
