// store.js — IndexedDB 封装（MV3 service worker 与列表页共用）
// 原则 C6：列表页启动时一次性 getAll 读入内存；滚动路径绝不访问数据库。

export const TABS_STORE = 'tabs';
export const GROUPS_STORE = 'groups';
export const TRASH_ID = '__trash__';        // 固定组：回收站
export const UNGROUPED_ID = '__ungrouped__'; // 隐式组：未分组条目（不落库）

const DB_NAME = 'onetab-rewrite';
const DB_VERSION = 1;

let _dbPromise = null;

export function dbOpen() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const q = indexedDB.open(DB_NAME, DB_VERSION);
    q.onupgradeneeded = () => {
      const db = q.result;
      if (!db.objectStoreNames.contains(TABS_STORE)) {
        const s = db.createObjectStore(TABS_STORE, { keyPath: 'id' });
        s.createIndex('by-group', 'groupId', { unique: false });
      }
      if (!db.objectStoreNames.contains(GROUPS_STORE)) {
        db.createObjectStore(GROUPS_STORE, { keyPath: 'id' });
      }
    };
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  return _dbPromise;
}

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllTabs() {
  const db = await dbOpen();
  return _req(db.transaction([TABS_STORE], 'readonly').objectStore(TABS_STORE).getAll());
}

export async function getAllGroups() {
  const db = await dbOpen();
  return _req(db.transaction([GROUPS_STORE], 'readonly').objectStore(GROUPS_STORE).getAll());
}

export async function putTabs(items) {
  if (!items || !items.length) return;
  const db = await dbOpen();
  const tx = db.transaction([TABS_STORE], 'readwrite');
  const os = tx.objectStore(TABS_STORE);
  for (const it of items) os.put(it);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

export async function putGroups(items) {
  if (!items || !items.length) return;
  const db = await dbOpen();
  const tx = db.transaction([GROUPS_STORE], 'readwrite');
  const os = tx.objectStore(GROUPS_STORE);
  for (const it of items) os.put(it);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

export async function deleteTabs(ids) {
  if (!ids || !ids.length) return;
  const db = await dbOpen();
  const tx = db.transaction([TABS_STORE], 'readwrite');
  const os = tx.objectStore(TABS_STORE);
  for (const id of ids) os.delete(id);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

export async function deleteGroups(ids) {
  if (!ids || !ids.length) return;
  const db = await dbOpen();
  const tx = db.transaction([GROUPS_STORE], 'readwrite');
  const os = tx.objectStore(GROUPS_STORE);
  for (const id of ids) os.delete(id);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

// 首次初始化：确保回收站固定组存在（幂等）
export async function ensureDefaults() {
  const groups = await getAllGroups();
  if (groups.some(g => g.id === TRASH_ID)) return;
  await putGroups([{
    id: TRASH_ID,
    label: '回收站',
    collapsed: true,
    fixed: true,
    createDate: Date.now(),
    order: Number.MAX_SAFE_INTEGER
  }]);
}
