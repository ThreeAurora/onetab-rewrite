// tools/export_onetab.js — 在【官方 OneTab】的页面 Console 里跑
// 用法：打开 chrome-extension://hoimpamkkoehapgenciaoajfkfkpgfop/onetab.html
//       F12 → Console → 粘贴本文件全部内容并回车
// 产出：自动下载 onetab-export-<日期>.json（含 tabs + groups 带组名），
//       然后在 OneTab Rewrite 列表页点「导入」选择该文件。
//
// ⚠️ 隐私提示：导出内容包含完整浏览记录 URL，文件请妥善保管、用完可删。

(async () => {
  const open = (name) => new Promise((res, rej) => {
    const q = indexedDB.open(name);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  const all = (db, store) => new Promise((res, rej) => {
    const q = db.transaction([store], 'readonly').objectStore(store).getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });

  const db = await open('onetab');
  const items = await all(db, 'item');

  const isTrash = (x) => (x.parentIds || []).includes('trash');

  const groups = items
    .filter(x => x.type === 'group')
    .map(x => ({ id: x.id, label: x.label || x.title || '分组', createDate: x.createDate || 0 }));

  const tabs = items
    .filter(x => x.type === 'tab')
    .map(x => ({
      url: x.url,
      title: x.title || x.url,
      groupId: (x.parentIds || [])[0] || null,
      createDate: x.createDate || 0,
      inTrash: isTrash(x)
    }));

  const payload = {
    app: 'onetab-official-export',
    exportedAt: new Date().toISOString(),
    groups,
    tabs
  };

  const total = tabs.length;
  const kept = tabs.filter(t => !t.inTrash).length;
  console.log(`官方 OneTab: ${total} 条（回收站 ${total - kept} 条，已在导出中标记 inTrash，导入端可自行决定是否保留）`);

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'onetab-export-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  console.log('已触发下载，接下来在 OneTab Rewrite 列表页点「导入」选择该文件。');
})();
