// favicon.js — 图标 URL 生成
// C3/C4：图标走 CSS background-image，绝不用 <img> + position:absolute 居中。
// chrome/edge 内置 _favicon API 本地生成（诊断已实测 200 可用，仅极少数回退 gstatic）。

export function faviconUrl(pageUrl, size = 16) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}
