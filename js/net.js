// 連線：使用 PeerJS 建立兩人之間的 WebRTC 資料通道
//   hostRoom()  建立房間，取得房間代碼後等待對手加入
//   joinRoom()  用房間代碼加入
//   send()      傳送訊息給對手
//   onData()    設定收到訊息時的處理函式
//   onClose()   設定對手離線時的處理函式
//   leave()     主動離開並關閉連線

import { NET } from './config.js';

let peer = null;
let conn = null;
let timeoutId = 0;
let dataHandler = () => {};
let closeHandler = () => {};

export const onData = fn => { dataHandler = fn; };
export const onClose = fn => { closeHandler = fn; };

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易看錯的 I O 0 1
const makeCode = () =>
  Array.from({ length: NET.codeLength }, () => CHARS[(Math.random() * CHARS.length) | 0]).join('');

const ERRORS = {
  'peer-unavailable': '找不到這個房間',
  'network': '無法連上連線伺服器',
  'server-error': '連線伺服器發生錯誤',
  'socket-error': '無法連上連線伺服器',
  'browser-incompatible': '這個瀏覽器不支援連線對戰',
  'unavailable-id': '房間代碼重複，請再試一次',
};
const errorText = e => ERRORS[e && e.type] || '連線發生錯誤';

function peerJsReady(onError) {
  if (typeof window.Peer === 'undefined') {
    onError('無法載入連線元件，請確認網路');
    return false;
  }
  return true;
}

export function hostRoom({ onCode, onConnected, onError }, tries = 0) {
  leave();
  if (!peerJsReady(onError)) return;

  const code = makeCode();
  const p = new window.Peer(NET.prefix + code, NET.peerOptions);
  peer = p;
  p.on('open', () => onCode(code));
  p.on('connection', c => {
    if (conn) { c.on('open', () => c.close()); return; } // 房間已滿
    attach(c, onConnected);
  });
  p.on('error', e => {
    if (peer !== p) return;
    if (e.type === 'unavailable-id' && tries < 3) {
      hostRoom({ onCode, onConnected, onError }, tries + 1);
      return;
    }
    leave();
    onError(errorText(e));
  });
}

export function joinRoom(code, { onConnected, onError }) {
  leave();
  if (!peerJsReady(onError)) return;

  const p = new window.Peer(NET.peerOptions);
  peer = p;
  const fail = msg => { if (peer !== p) return; leave(); onError(msg); };

  p.on('open', () => {
    attach(p.connect(NET.prefix + code, { reliable: true }), onConnected);
  });
  p.on('error', e => fail(errorText(e)));
  timeoutId = setTimeout(() => {
    if (!conn || !conn.open) fail('連線逾時，請確認房間代碼');
  }, NET.connectTimeoutMs);
}

function attach(c, onConnected) {
  conn = c;
  c.on('open', () => {
    clearTimeout(timeoutId);
    onConnected();
  });
  c.on('data', d => { if (conn === c) dataHandler(d); });
  c.on('close', () => {
    if (conn !== c) return; // 自己主動離開時不觸發
    conn = null;
    closeHandler();
  });
  c.on('error', () => {});
}

export function send(msg) {
  if (conn && conn.open) conn.send(msg);
}

export function leave() {
  clearTimeout(timeoutId);
  const c = conn, p = peer;
  conn = null;
  peer = null;
  if (c) c.close();
  if (p) p.destroy();
}
