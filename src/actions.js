// actions.js — 保存标签页（background service worker 与列表页共用）

import { ensureDefaults, putGroups, putTabs } from './store.js';

const INTERNAL = /^(chrome|edge|about|devtools|view-source|chrome-extension|edge-extension):/i;

export function groupLabel(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 保存一组标签页：过滤内部页 → 批内去重 → 建新分组 → 写库 → 关闭已保存的非固定标签
export async function saveTabs(tabs) {
  const seen = new Set();
  const picked = [];
  for (const t of tabs || []) {
    if (!t || !t.url || INTERNAL.test(t.url)) continue;
    if (seen.has(t.url)) continue;
    seen.add(t.url);
    picked.push(t);
  }
  if (!picked.length) return { saved: 0, groupId: null };

  await ensureDefaults();

  const now = Date.now();
  const group = {
    id: crypto.randomUUID(),
    label: groupLabel(new Date(now)),
    collapsed: false,
    createDate: now,
    order: -now // 新组排最前（order 升序）
  };
  const items = picked.map(t => ({
    id: crypto.randomUUID(),
    url: t.url,
    title: t.title || t.url,
    groupId: group.id,
    createDate: t.lastAccessed || now,
    order: t.index
  }));

  await putGroups([group]);
  await putTabs(items);

  // 关闭已保存且未固定的标签
  const closable = picked.filter(t => !t.pinned && t.id != null);
  if (closable.length) {
    try { await chrome.tabs.remove(closable.map(t => t.id)); } catch (e) { /* 已被用户关掉等情况 */ }
  }
  return { saved: items.length, groupId: group.id };
}
