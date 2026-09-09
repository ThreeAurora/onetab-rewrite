// list.js — 列表页入口：装配虚拟列表 + 搜索 + 分组 + 右键菜单 + 导入导出
// 硬约束回顾：每行 1 个 DOM 节点（C1）、DOM 常驻恒定（C2）、图标走 CSS 背景（C3）、
// 行内零 position:absolute（C4）、启动一次性读库（C6）、滚动回调只做切片（C8）。

import { VirtualList } from './virtual-list.js';
import { faviconUrl } from './favicon.js';
import { saveTabs } from './actions.js';
import { parseImport } from './importer.js';
import {
  TRASH_ID, UNGROUPED_ID,
  getAllTabs, getAllGroups, putTabs, putGroups, deleteTabs, deleteGroups,
  ensureDefaults
} from './store.js';

const state = { tabs: [], groups: [], q: '', rows: [], hl: -1 };
let vl = null;

// ---------- 启动 ----------

init();

async function init() {
  vl = new VirtualList(document.getElementById('viewport'), renderRow);
  bindListEvents();
  bindToolbar();
  bindKeyboard();

  const params = new URLSearchParams(location.search);
  const stress = parseInt(params.get('stress') || '0', 10);
  if (stress > 0) {
    loadStress(stress);
    return;
  }

  await ensureDefaults();
  await reload();
}

async function reload() {
  const [tabs, groups] = await Promise.all([getAllTabs(), getAllGroups()]);
  state.tabs = tabs;
  state.groups = groups;
  state.hl = -1;
  rebuild();
}

// ---------- 压测数据（?stress=N，只进内存不写库，用于 §6.1 验收） ----------

function loadStress(n) {
  const hosts = ['github.com', 'stackoverflow.com', 'zhihu.com', 'bilibili.com',
    'juejin.cn', 'docs.qq.com', 'mail.163.com', 'taobao.com', 'jd.com', 'wikipedia.org',
    'developer.mozilla.org', 'npmjs.com', 'sspai.com', 'v2ex.com', 'douban.com'];
  const words = ['性能', '优化', '虚拟列表', '渲染', '缓存', '索引', '架构',
    '设计', '调试', '部署', '前端', '后端', '数据库', '网络', '安全'];
  const G = Math.min(500, Math.max(1, Math.floor(n / 200)));
  const groups = [], tabs = [];
  for (let g = 0; g < G; g++) {
    groups.push({
      id: 'sg' + g, label: '压测分组 ' + g, collapsed: g % 7 === 0,
      createDate: Date.now() - g, order: g + 1
    });
  }
  for (let i = 0; i < n; i++) {
    const h = hosts[i % hosts.length];
    tabs.push({
      id: 'st' + i,
      url: 'https://' + h + '/page/' + i + '?q=' + i,
      title: words[i % words.length] + ' · 压测条目 ' + i + ' · Performance item ' + i,
      groupId: 'sg' + (i % G),
      createDate: Date.now() - i * 1000,
      order: i,
      ...(i % 20 === 0 ? { deletedFrom: 'sg' + (i % G) } : {}),
      ...(i % 20 === 0 ? { groupId: TRASH_ID } : {})
    });
  }
  groups.push({
    id: TRASH_ID, label: '回收站', collapsed: false, fixed: true,
    createDate: Date.now(), order: Number.MAX_SAFE_INTEGER
  });
  state.tabs = tabs;
  state.groups = groups;
  rebuild();
  toast(`压测模式：${n} 条 / ${G} 组（仅内存，不写库）`);
}

// ---------- rows 构建（纯内存，无 DOM/IO） ----------

function isTrashTab(t) { return t.groupId === TRASH_ID; }

function buildRows() {
  const { tabs, groups, q } = state;

  // 搜索：平铺非回收站命中项
  if (q) {
    const ql = q.toLowerCase();
    const hits = tabs.filter(t =>
      !isTrashTab(t) &&
      ((t.title || '').toLowerCase().includes(ql) || t.url.toLowerCase().includes(ql))
    );
    hits.sort((a, b) => b.createDate - a.createDate);
    const rows = [{ kind: 'info', text: `找到 ${hits.length} 条匹配「${q}」` }];
    for (const t of hits) rows.push({ kind: 'tab', tab: t });
    return rows;
  }

  const byGroup = new Map();
  for (const t of tabs) {
    const gid = t.groupId || UNGROUPED_ID;
    if (isTrashTab(t)) {
      if (!byGroup.has(TRASH_ID)) byGroup.set(TRASH_ID, []);
      byGroup.get(TRASH_ID).push(t);
      continue;
    }
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(t);
  }

  const normal = groups
    .filter(g => g.id !== TRASH_ID)
    .sort((a, b) => a.order - b.order || a.createDate - b.createDate);
  const trash = groups.find(g => g.id === TRASH_ID);

  const rows = [];

  // 未分组（虚拟组，置顶）
  const ungrouped = byGroup.get(UNGROUPED_ID) || [];
  if (ungrouped.length) {
    pushGroup(rows, UNGROUPED_ID, '未分组', ungrouped, collapsedOf(UNGROUPED_ID));
  }

  for (const g of normal) {
    const list = byGroup.get(g.id) || [];
    pushGroup(rows, g.id, g.label, list, g.collapsed);
  }

  if (trash && (byGroup.get(TRASH_ID) || []).length) {
    pushGroup(rows, TRASH_ID, trash.label, byGroup.get(TRASH_ID), trash.collapsed);
  }
  return rows;
}

function pushGroup(rows, gid, label, list, collapsed) {
  rows.push({ kind: 'group', gid, label, count: list.length, collapsed, trash: gid === TRASH_ID });
  if (!collapsed) {
    list.sort((a, b) => b.createDate - a.createDate || a.order - b.order);
    for (const t of list) rows.push({ kind: 'tab', tab: t });
  }
}

function collapsedOf(gid) {
  try { return localStorage.getItem('ot.collapsed.' + gid) === '1'; } catch (e) { return false; }
}
function setCollapsedOf(gid, v) {
  try { localStorage.setItem('ot.collapsed.' + gid, v ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

function rebuild() {
  state.rows = buildRows();
  if (state.hl >= state.rows.length) state.hl = state.rows.length - 1;
  vl.setData(state.rows);
  updateStats();
}

function updateStats() {
  const total = state.tabs.length;
  const trashN = state.tabs.reduce((n, t) => n + (isTrashTab(t) ? 1 : 0), 0);
  const groupsN = state.groups.filter(g => g.id !== TRASH_ID).length;
  document.getElementById('stats').textContent =
    `共 ${total.toLocaleString()} 条 · ${groupsN} 组 · 回收站 ${trashN.toLocaleString()}`;
}

// ---------- 行渲染：每类行严格 1 个 DOM 节点 ----------

function renderRow(item) {
  if (item.kind === 'group') {
    const d = document.createElement('div');
    d.className = 'row group-row' + (item.collapsed ? ' collapsed' : '') + (item.trash ? ' trash-row' : '');
    d.dataset.gid = item.gid;
    d.textContent = `${item.label} (${item.count})`;
    return d;
  }
  if (item.kind === 'info') {
    const d = document.createElement('div');
    d.className = 'row info-row';
    d.textContent = item.text;
    return d;
  }
  const a = document.createElement('a');
  const inTrash = isTrashTab(item.tab);
  a.className = 'row tab-row' + (inTrash ? ' tab-in-trash' : '');
  a.href = item.tab.url;
  a.dataset.id = item.tab.id;
  a.title = item.tab.url;
  a.textContent = item.tab.title || item.tab.url;
  a.draggable = false;
  a.style.backgroundImage = `url("${faviconUrl(item.tab.url)}")`;
  return a;
}

// ---------- 列表事件（全部委托，行上零监听） ----------

function bindListEvents() {
  const viewport = document.getElementById('viewport');

  viewport.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    if (row.classList.contains('tab-row')) {
      // 悬停叉：行右侧 26px 区域点击 = 删除
      if (e.offsetX > row.clientWidth - 26) {
        removeTab(row.dataset.id);
        return;
      }
      e.preventDefault();
      openTab(row.dataset.id, e.ctrlKey || e.metaKey);
    } else if (row.classList.contains('group-row')) {
      toggleGroup(row.dataset.gid);
    }
  });

  viewport.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const row = e.target.closest('a.tab-row');
    if (!row) return;
    e.preventDefault();
    openTab(row.dataset.id, true);
  });

  viewport.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    e.preventDefault();
    const idx = rowIndexFromEvent(e);
    setHighlight(idx);
    showRowMenu(e.clientX, e.clientY, row, idx);
  });

  // 点击别处关闭自绘菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctxmenu')) hideMenu();
  }, true);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#viewport') && !e.target.closest('#ctxmenu')) hideMenu();
  }, true);
}

function rowIndexFromEvent(e) {
  const el = e.target.closest('.row');
  if (!el) return -1;
  const list = el.parentNode;
  const i = Array.prototype.indexOf.call(list.children, el);
  return i < 0 ? -1 : vl.start + i;
}

// ---------- 行为动作 ----------

function openTab(id, background) {
  const t = state.tabs.find(x => x.id === id);
  if (!t) return;
  chrome.tabs.create({ url: t.url, active: !background });
}

function removeTab(id) {
  const t = state.tabs.find(x => x.id === id);
  if (!t || isTrashTab(t)) return;
  t.deletedFrom = t.groupId || null;
  t.groupId = TRASH_ID;
  putTabs([t]).then(reload);
}

function restoreTab(id) {
  const t = state.tabs.find(x => x.id === id);
  if (!t) return;
  const back = t.deletedFrom || null;
  delete t.deletedFrom;
  t.groupId = back && state.groups.some(g => g.id === back) ? back : null;
  putTabs([t]).then(reload);
}

function purgeTab(id) {
  state.tabs = state.tabs.filter(x => x.id !== id);
  deleteTabs([id]).then(reload);
}

function toggleGroup(gid) {
  if (gid === UNGROUPED_ID) {
    setCollapsedOf(gid, !collapsedOf(gid));
    rebuild();
    return;
  }
  const g = state.groups.find(x => x.id === gid);
  if (!g) return;
  g.collapsed = !g.collapsed;
  putGroups([g]).then(rebuild);
}

function removeGroup(gid) {
  if (gid === UNGROUPED_ID) return;
  const g = state.groups.find(x => x.id === gid);
  if (!g) return;
  const members = state.tabs.filter(t => t.groupId === gid && !isTrashTab(t));
  for (const t of members) { t.deletedFrom = gid; t.groupId = TRASH_ID; }
  state.groups = state.groups.filter(x => x.id !== gid);
  putTabs(members).then(() => deleteGroups([gid])).then(reload);
}

function emptyTrash() {
  const ids = state.tabs.filter(isTrashTab).map(t => t.id);
  state.tabs = state.tabs.filter(t => !isTrashTab(t));
  deleteTabs(ids).then(reload);
}

async function renameGroup(gid, current) {
  const name = await askText('重命名分组', current || '');
  if (name == null) return;
  const label = name.trim();
  if (!label) return;
  if (gid === UNGROUPED_ID) return;
  const g = state.groups.find(x => x.id === gid);
  if (!g) return;
  g.label = label;
  putGroups([g]).then(rebuild);
}

async function newGroup() {
  const name = await askText('新建分组', '新建分组');
  if (name == null) return;
  const label = name.trim() || '新建分组';
  const minOrder = state.groups
    .filter(g => g.id !== TRASH_ID)
    .reduce((m, g) => Math.min(m, g.order), 0);
  const g = {
    id: crypto.randomUUID(), label, collapsed: false,
    createDate: Date.now(), order: minOrder - 1
  };
  await putGroups([g]);
  await reload();
  toast(`已创建分组「${label}」`);
}

// ---------- 键盘 ----------

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if (inInput) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (!dialog.hidden) {
      if (e.key === 'Escape') { dialog.hidden = true; resolveAsk(null); }
      if (e.key === 'Enter') { dialog.hidden = true; resolveAsk(dialogInput.value); }
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('search').focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!state.rows.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight(Math.min(state.rows.length - 1, Math.max(0, (state.hl < 0 ? (d > 0 ? -1 : 0) : state.hl) + d)));
      if (state.hl >= 0) vl.scrollToIndex(state.hl, false);
    } else if (e.key === 'Enter') {
      if (state.hl < 0) return;
      const item = state.rows[state.hl];
      if (!item) return;
      if (item.kind === 'tab') openTab(item.tab.id, e.ctrlKey || e.metaKey);
      else if (item.kind === 'group') toggleGroup(item.gid);
    } else if (e.key === 'Delete') {
      if (state.hl < 0) return;
      const item = state.rows[state.hl];
      if (item && item.kind === 'tab') removeTab(item.tab.id);
    } else if (e.key === 'Escape') {
      const s = document.getElementById('search');
      if (s.value) { s.value = ''; state.q = ''; rebuild(); }
    }
  });
}

function setHighlight(idx) {
  const old = state.hl;
  state.hl = idx;
  if (old === idx) return;
  const oldEl = old >= 0 ? vl.rowAt(old) : null;
  const newEl = idx >= 0 ? vl.rowAt(idx) : null;
  if (oldEl) oldEl.classList.remove('hl');
  if (newEl) newEl.classList.add('hl');
  if ((idx >= 0 && !newEl) || (old >= 0 && !oldEl)) vl.render(true);
}

// ---------- 右键菜单 ----------

const ctxmenu = document.getElementById('ctxmenu');

function hideMenu() { ctxmenu.hidden = true; }

function showRowMenu(x, y, rowEl, idx) {
  const item = state.rows[idx];
  if (!item) return;
  const menu = [];
  if (item.kind === 'tab') {
    const id = item.tab.id;
    if (!item.tab || item.tab.groupId === TRASH_ID) {
      menu.push({ label: '恢复到原分组', fn: () => restoreTab(id) });
      menu.push({ sep: true });
      menu.push({ label: '永久删除', danger: true, fn: () => purgeTab(id) });
    } else {
      menu.push({ label: '打开', fn: () => openTab(id, false) });
      menu.push({ label: '后台打开', fn: () => openTab(id, true) });
      menu.push({ label: '复制 URL', fn: () => navigator.clipboard.writeText(item.tab.url) });
      menu.push({ sep: true });
      menu.push({ label: '删除（进回收站）', danger: true, fn: () => removeTab(id) });
    }
  } else if (item.kind === 'group') {
    const gid = item.gid;
    if (gid === TRASH_ID) {
      menu.push({ label: '清空回收站', danger: true, fn: () => { if (confirm('永久删除回收站内全部条目？')) emptyTrash(); } });
    } else {
      menu.push({ label: item.collapsed ? '展开' : '折叠', fn: () => toggleGroup(gid) });
      if (gid !== UNGROUPED_ID) {
        menu.push({ label: '重命名', fn: () => renameGroup(gid, item.label) });
        menu.push({ sep: true });
        menu.push({ label: '删除分组（条目进回收站）', danger: true, fn: () => removeGroup(gid) });
      }
    }
  } else {
    return;
  }

  ctxmenu.textContent = '';
  for (const m of menu) {
    if (m.sep) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      ctxmenu.appendChild(sep);
      continue;
    }
    const d = document.createElement('div');
    d.className = 'ctx-item' + (m.danger ? ' danger' : '');
    d.textContent = m.label;
    d.addEventListener('click', () => { hideMenu(); m.fn(); });
    ctxmenu.appendChild(d);
  }
  ctxmenu.hidden = false;
  const r = ctxmenu.getBoundingClientRect();
  ctxmenu.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
  ctxmenu.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
}

// ---------- 对话框 ----------

const dialog = document.getElementById('dialog');
const dialogInput = document.getElementById('dialog-input');
let _askResolve = null;

function askText(title, initial) {
  document.getElementById('dialog-title').textContent = title;
  dialogInput.value = initial || '';
  dialog.hidden = false;
  dialogInput.focus();
  dialogInput.select();
  return new Promise(res => { _askResolve = res; });
}
function resolveAsk(v) { if (_askResolve) { _askResolve(v); _askResolve = null; } }

document.getElementById('dialog-ok').addEventListener('click', () => { dialog.hidden = true; resolveAsk(dialogInput.value); });
document.getElementById('dialog-cancel').addEventListener('click', () => { dialog.hidden = true; resolveAsk(null); });
dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) { dialog.hidden = true; resolveAsk(null); } });

// ---------- 工具栏 ----------

function bindToolbar() {
  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    state.q = search.value.trim();
    state.hl = -1;
    rebuild();
  });

  document.getElementById('btn-save-window').addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const r = await saveTabs(tabs);
    await reload();
    toast(`已保存 ${r.saved} 条到新分组`);
  });

  document.getElementById('btn-save-all').addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const r = await saveTabs(tabs);
    await reload();
    toast(`已保存全部窗口共 ${r.saved} 条`);
  });

  document.getElementById('btn-new-group').addEventListener('click', newGroup);

  const fileInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) doImport(f);
  });

  document.getElementById('btn-export-text').addEventListener('click', exportText);
  document.getElementById('btn-export-json').addEventListener('click', exportJson);
}

async function doImport(file) {
  try {
    const text = await file.text();
    const parsed = parseImport(text);

    // 库内去重（不含回收站）：同 URL 已存在则跳过
    const existing = new Set(state.tabs.filter(t => !isTrashTab(t)).map(t => t.url));
    const batchSeen = new Set();
    const fresh = [], skipped = [];
    for (const t of parsed.tabs) {
      if (existing.has(t.url) || batchSeen.has(t.url)) { skipped.push(t.url); continue; }
      batchSeen.add(t.url);
      fresh.push({
        id: crypto.randomUUID(),
        url: t.url,
        title: t.title || t.url,
        groupId: t.groupId || null,
        createDate: t.createDate || Date.now(),
        order: fresh.length
      });
    }

    let groups = parsed.groups;
    if (parsed.mode === 'text') {
      // 纯文本 → 单个导入分组
      groups = [{
        id: crypto.randomUUID(),
        label: '导入 ' + new Date().toISOString().slice(0, 10),
        collapsed: false, createDate: Date.now(),
        order: (state.groups.reduce((m, g) => Math.min(m, g.order), 0)) - 1
      }];
      for (const t of fresh) t.groupId = groups[0].id;
    } else if (groups.length) {
      const maxOrder = state.groups.reduce((m, g) => Math.max(m, g.order), 0);
      groups = groups.map((g, i) => ({
        id: g.id, label: g.label, collapsed: false,
        createDate: g.createDate || Date.now(), order: maxOrder + 1 + i
      }));
    }

    await putGroups(groups);
    await putTabs(fresh);
    await reload();
    toast(`导入 ${fresh.length} 条 / ${groups.length} 组` + (skipped.length ? `，跳过 ${skipped.length} 条重复` : ''));
  } catch (err) {
    toast('导入失败：' + err.message);
  }
}

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportText() {
  const rows = buildRowsForExport();
  const lines = [];
  for (const r of rows) {
    if (r.kind === 'tab') lines.push(r.tab.url);
    else if (r.kind === 'group') lines.push(`# ${r.label}`);
  }
  download(`onetab-export-${todayStamp()}.txt`, lines.join('\n') + '\n');
}

function exportJson() {
  const payload = {
    app: 'onetab-rewrite', version: 1,
    exportedAt: new Date().toISOString(),
    groups: state.groups, tabs: state.tabs
  };
  download(`onetab-backup-${todayStamp()}.json`, JSON.stringify(payload));
}

// 导出用：忽略当前搜索状态，按完整结构出
function buildRowsForExport() {
  const savedQ = state.q;
  state.q = '';
  const rows = buildRows();
  state.q = savedQ;
  return rows;
}

// ---------- Toast ----------

let _toastTimer = 0;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}
