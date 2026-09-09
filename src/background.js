// background.js — MV3 service worker
//
// ⚠️ 关键约束：service worker 在初始化阶段（顶层代码）抛出任何未捕获异常，
//   浏览器只会笼统报「无法加载背景脚本」，不给具体原因。
//   因此本文件顶层**只注册监听器**，不执行任何 IO；实际工作都在事件回调里做，
//   并统一用 safe() 兜住，避免单个 API 失败拖垮整个 worker 的注册。
//
// K3：SW 随时休眠，不依赖模块级变量存状态；每次操作都从 IndexedDB 读写。

import { ensureDefaults } from './store.js';
import { saveTabs } from './actions.js';

function safe(label, fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') {
      r.catch((e) => console.error('[OneTabRewrite] ' + label + ': ' + (e && e.message ? e.message : e)));
    }
  } catch (e) {
    console.error('[OneTabRewrite] ' + label + ': ' + (e && e.message ? e.message : e));
  }
}

// ---------- 右键菜单（安装与浏览器启动时重建；休眠唤醒后由浏览器保留） ----------

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    const items = [
      { id: 'ot-save-this-tab', title: '把此标签页存进 OneTab Rewrite', contexts: ['page'] },
      { id: 'ot-save-window', title: '保存当前窗口全部标签页', contexts: ['page', 'action'] },
      { id: 'ot-save-all-windows', title: '保存所有窗口的全部标签页', contexts: ['page', 'action'] }
    ];
    for (const it of items) safe('createMenu:' + it.id, () => chrome.contextMenus.create(it));
  });
}

// ---------- 事件入口（顶层只做注册） ----------

chrome.runtime.onInstalled.addListener(() => {
  safe('setupMenus', setupMenus);
  safe('ensureDefaults', ensureDefaults);
});

chrome.runtime.onStartup.addListener(() => safe('setupMenus', setupMenus));

chrome.action.onClicked.addListener(() => safe('openList', openList));

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== 'save-all-tabs') return;
  safe('saveCurrentWindow', saveCurrentWindow);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ot-save-this-tab') {
    if (tab) safe('saveThisTab', () => saveTabs([tab]));
  } else if (info.menuItemId === 'ot-save-window') {
    safe('saveCurrentWindow', saveCurrentWindow);
  } else if (info.menuItemId === 'ot-save-all-windows') {
    safe('saveAllWindows', saveAllWindows);
  }
});

// ---------- 具体动作 ----------

function saveCurrentWindow() {
  return chrome.tabs.query({ currentWindow: true }).then(tabs => saveTabs(tabs));
}

function saveAllWindows() {
  return chrome.tabs.query({}).then(tabs => saveTabs(tabs));
}

function openList() {
  return (async () => {
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
  })();
}
