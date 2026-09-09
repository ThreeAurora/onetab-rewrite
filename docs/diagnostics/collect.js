// OneTab 性能采集脚本（只读，不修改任何数据）
// 用法：在 Edge 里打开 chrome-extension://hoimpamkkoehapgenciaoajfkfkpgfop/onetab.html
//      F12 -> Console -> 粘贴本文件全部内容 -> 回车 -> 把 ONETAB_DIAG 那一行整段发回
(async () => {
  const out = { step: 'start' };
  try {
    // 1) 数据规模：直接读 OneTab 的 IndexedDB
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('onetab');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const q = db.transaction(['item'], 'readonly').objectStore('item').getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const byType = {};
    let childRefs = 0;
    let trashed = 0;
    for (const it of all) {
      byType[it.type] = (byType[it.type] || 0) + 1;
      if (Array.isArray(it.childIds)) childRefs += it.childIds.length;
      if (Array.isArray(it.parentIds) && it.parentIds.indexOf('trash') >= 0) trashed++;
    }
    out.items = all.length;
    out.byType = byType;
    out.childIdRefs = childRefs;
    out.inTrash = trashed;
    out.jsonMB = +(JSON.stringify(all).length / 1048576).toFixed(2);
    out.domNodes = document.querySelectorAll('*').length;
    out.dbVersion = db.version;

    // 2) 资源加载统计（favicon 走本地 _favicon 还是 Google gstatic）
    const res = performance.getEntriesByType('resource');
    out.resources = res.length;
    out.faviconLocal = res.filter(r => r.name.indexOf('/_favicon/') >= 0).length;
    out.faviconGstatic = res.filter(r => r.name.indexOf('gstatic') >= 0).length;
    out.slowRes = res.filter(r => r.duration > 500).length;
    out.topSlow = res.slice().sort((a, b) => b.duration - a.duration).slice(0, 5)
      .map(r => ({ d: Math.round(r.duration), t: r.initiatorType, n: r.name.slice(0, 70) }));

    // 3) 长任务监听
    const longTasks = [];
    const po = new PerformanceObserver(l => l.getEntries().forEach(e => longTasks.push(Math.round(e.duration))));
    try { po.observe({ entryTypes: ['longtask'] }); } catch (e) { out.longTaskUnsupported = true; }

    // 4) 滚动 3 秒的帧率采样
    const sc = document.scrollingElement || document.documentElement;
    const frames = [];
    let last = performance.now();
    let run = true;
    const tick = t => { frames.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      const max = sc.scrollHeight - sc.clientHeight;
      sc.scrollTop = max > 0 ? (sc.scrollTop + 600) % max : 0;
      await new Promise(r => setTimeout(r, 16));
    }
    run = false;
    await new Promise(r => setTimeout(r, 400));
    frames.sort((a, b) => a - b);
    out.scroll = {
      frames: frames.length,
      avgMs: +(frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)).toFixed(1),
      p95Ms: +(frames[Math.floor(frames.length * 0.95)] || 0).toFixed(1),
      maxMs: +(frames[frames.length - 1] || 0).toFixed(1),
      over50ms: frames.filter(f => f > 50).length
    };
    out.longTasks = {
      count: longTasks.length,
      maxMs: longTasks.length ? Math.max.apply(null, longTasks) : 0,
      totalMs: longTasks.reduce((a, b) => a + b, 0)
    };
    po.disconnect();
    out.step = 'done';
  } catch (e) {
    out.error = String(e);
  }
  console.log('ONETAB_DIAG ' + JSON.stringify(out));
})();
