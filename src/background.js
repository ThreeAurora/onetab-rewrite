// background.js — MV3 service worker
// K3：SW 随时休眠，不依赖模块级变量存状态；每次操作都从 IndexedDB 读写。

import { ensureDefaults } from './store.js';
import { saveTabs } from './actions.js';

// ---------- 启动期幂等初始化（SW 每次唤醒都会执行顶层代码） ----------

setupMenus();
ensureDefaults().catch(() => {});

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ot-save-this-tab',
      title: '把此标签页存进 OneTab Rewrite',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'ot-save-window',
      title: '保存当前窗口全部标签页',
      contexts: ['page', 'action']
    });
    chrome.contextMenus.create({
      id: 'ot-save-all-windows',
      title: '保存所有窗口的全部标签页',
      contexts: ['page', 'action']
    });
  });
}

// ---------- 交互入口 ----------

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('src/list.html');
  const existing = await chrome.tabs.query({ url });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== chrome.windows.WINDOW_ID_CURRENT) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'save-all-tabs') return;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await saveTabs(tabs);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ot-save-this-tab') {
    if (tab) await saveTabs([tab]);
  } else if (info.menuItemId === 'ot-save-window') {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    await saveTabs(tabs);
  } else if (info.menuItemId === 'ot-save-all-windows') {
    const tabs = await chrome.tabs.query({});
    await saveTabs(tabs);
  }
});
