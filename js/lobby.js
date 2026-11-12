// 大廳介面：建立房間、加入房間、單人練習、結算與再戰

import { NET } from './config.js';
import { match, startMatch, toLobby, requestRematch, setMatchListener } from './game.js';
import { hostRoom, joinRoom, leave, onClose } from './net.js';

const $ = id => document.getElementById(id);
const overlay = $('lobby');
const views = [...overlay.querySelectorAll('[data-view]')];
const exitBtn = $('btn-exit');
const codeInput = $('join-code');

function show(view) {
  overlay.hidden = !view;
  exitBtn.hidden = !!view;
  for (const v of views) v.hidden = v.dataset.view !== view;
  if (view === 'menu') setBusy(false);
}

function status(text = '') {
  $('status').textContent = text;
}

function setBusy(busy) {
  for (const id of ['btn-host', 'btn-join', 'btn-solo']) $(id).disabled = busy;
  codeInput.disabled = busy;
}

function onNetError(text) {
  show('menu');
  status(text);
}

export function initLobby() {
  codeInput.maxLength = NET.codeLength;

  $('btn-host').addEventListener('click', () => {
    setBusy(true);
    status('建立房間中…');
    hostRoom({
      onCode: code => {
        $('room-code').textContent = code;
        $('copy-state').textContent = '';
        status('');
        show('waiting');
      },
      onConnected: () => startMatch('playing', 'left'),
      onError: onNetError,
    });
  });

  const join = () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== NET.codeLength) {
      status(`請輸入 ${NET.codeLength} 碼房間代碼`);
      codeInput.focus();
      return;
    }
    setBusy(true);
    status('連線中…');
    joinRoom(code, {
      onConnected: () => startMatch('playing', 'right'),
      onError: onNetError,
    });
  };
  $('btn-join').addEventListener('click', join);
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('btn-solo').addEventListener('click', () => {
    status('');
    startMatch('solo', 'left');
  });

  $('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('room-code').textContent);
      $('copy-state').textContent = '已複製';
    } catch {
      $('copy-state').textContent = '無法複製，請手動抄下代碼';
    }
  });

  $('btn-cancel').addEventListener('click', () => {
    leave();
    show('menu');
    status('');
  });

  $('btn-rematch').addEventListener('click', requestRematch);

  $('btn-leave').addEventListener('click', () => {
    leave();
    toLobby();
  });

  exitBtn.addEventListener('click', () => {
    leave();
    toLobby();
  });

  onClose(() => {
    if (match.state === 'playing' || match.state === 'over') {
      toLobby();
      status('對手已離線');
    }
  });

  setMatchListener(m => {
    if (m.state === 'lobby') {
      show('menu');
    } else if (m.state === 'over') {
      const win = m.result === 'win';
      const el = $('result-text');
      el.textContent = win ? '勝利' : '落敗';
      el.className = `result ${win ? 'win' : 'lose'}`;
      show('result');
    } else {
      show(null); // solo / playing：關閉介面開始遊戲
      document.activeElement && document.activeElement.blur();
    }
  });

  show('menu');
}
