// 畫布初始化與尺寸管理

const sceneCv = document.getElementById('scene');
const slateCv = document.getElementById('slate');

export const sceneCtx = sceneCv.getContext('2d');
export const slateCtx = slateCv.getContext('2d');
export const size = {
  scene: { w: 0, h: 0 },
  slate: { w: 0, h: 0 },
  dpr: 1,
};

function fit(cv, ctx, key) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  size[key] = { w: r.width, h: r.height };
  size.dpr = dpr;
}

export function setupCanvases() {
  new ResizeObserver(() => fit(sceneCv, sceneCtx, 'scene')).observe(sceneCv);
  new ResizeObserver(() => fit(slateCv, slateCtx, 'slate')).observe(slateCv);
}
