# 畫線施法：對戰版

## 執行
專案使用 ES 模組，需透過網頁伺服器開啟：

    python -m http.server

再打開 http://localhost:8000 。對戰時兩邊都需要連上網路（PeerJS 公用伺服器負責配對，配對後雙方直接連線）。

要和其他電腦的人對戰，雙方各自在本機開啟即可；也可以把整個資料夾放上 GitHub Pages 等靜態網站，讓對手直接開網址。

## 對戰流程
1. 一方按「建立房間」，取得 5 碼房間代碼
2. 另一方輸入代碼後按「加入」
3. 連上後自動開始；任一方血量歸零即分出勝負

## 自架 PeerJS 伺服器
在 js/config.js 的 NET.peerOptions 填入 host、port、path 即可。
