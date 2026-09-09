// tools/bench_rewrite.js — OneTab Rewrite 性能验收（HANDOFF §6.1 硬指标）
// 用法：列表页带 ?stress=100000 打开 → F12 Console → 粘贴本文件全部内容回车。
// 依赖 K11 教训：elementFromPoint 探测点取列表视口内部，避开工具栏浮层。

(async () => {
  const $ = (s) => document.querySelector(s);
  const viewport = $('#viewport');
  const rows = parseInt(new URLSearchParams(location.search).get('stress') || '0', 10);
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log('%c=== OneTab Rewrite 性能验收 ===', 'font-weight:bold');

  // 0) 数据规模
  if (rows > 0) console.log(`压测数据规模: ${rows.toLocaleString()} 条`);
  else console.log('⚠️ 当前是真实数据库（未带 ?stress= 参数）');

  // 1) DOM 常驻节点数（要求 < 2000，且与数据量无关）
  const domCount = document.getElementsByTagName('*').length;
  out.domNodes = domCount;
  console.log(`DOM 常驻节点: ${domCount}  [要求 < 2000]  ${domCount < 2000 ? '✅' : '❌'}`);

  // 2) 首屏导航计时（参考值；严格口径用 Performance 面板录制）
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) {
    const t = nav.domContentLoadedEventEnd;
    console.log(`DOMContentLoaded: ${t.toFixed(0)} ms  [参考 < 1500 ms]  ${t < 1500 ? '✅' : '❌'}`);
    out.domContentLoaded = t;
  }

  // 3) HitTest：elementFromPoint × 150（视口内随机点，平均 < 1.0 ms）
  await sleep(300); // 等图标请求 settles
  const vpRect = viewport.getBoundingClientRect();
  const pts = [];
  for (let i = 0; i < 150; i++) {
    pts.push([
      vpRect.left + 4 + Math.random() * (vpRect.width - 8),
      vpRect.top + 4 + Math.random() * (vpRect.height - 8)
    ]);
  }
  // 预热
  for (const [x, y] of pts.slice(0, 20)) document.elementFromPoint(x, y);
  const t0 = performance.now();
  for (const [x, y] of pts) document.elementFromPoint(x, y);
  const hitMs = (performance.now() - t0) / pts.length;
  out.hitTestAvg = hitMs;
  console.log(`HitTest 平均: ${hitMs.toFixed(3)} ms（${pts.length} 次采样）  [要求 < 1.0 ms]  ${hitMs < 1.0 ? '✅' : '❌'}`);

  // 4) 滚动帧间隔（模拟连续滚动 6 秒：rAF 循环 + 每帧步进）
  const vh = viewport.clientHeight;
  const total = viewport.scrollHeight;
  const frameGaps = [];
  let last = performance.now();
  let dir = 1, pos = viewport.scrollTop;
  const DURATION = 6000, STEP = 120;
  const started = performance.now();

  await new Promise((resolve) => {
    function tick(now) {
      const gap = now - last;
      last = now;
      if (frameGaps.length) frameGaps.push(gap); // 丢掉首帧
      if (now - started > DURATION) return resolve();
      pos += STEP * dir;
      if (pos > total - vh) { pos = total - vh; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      viewport.scrollTop = pos;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  frameGaps.sort((a, b) => a - b);
  const p50 = frameGaps[Math.floor(frameGaps.length * 0.5)];
  const p95 = frameGaps[Math.floor(frameGaps.length * 0.95)];
  const max = frameGaps[frameGaps.length - 1];
  const longFrames = frameGaps.filter(g => g > 50).length;
  out.scroll = { p50, p95, max, longFrames, samples: frameGaps.length };
  console.log(`滚动帧间隔（${frameGaps.length} 帧）: p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} max=${max.toFixed(2)} ms`);
  console.log(`  p95 ≤ 16.7: ${p95 <= 16.7 ? '✅' : '❌'}   无 >50ms 长帧: ${longFrames === 0 ? '✅ (' + longFrames + ')' : '❌ (' + longFrames + ')'}`);

  // 5) 内存（10 万条 < 300 MB，换算值仅供参考）
  if (performance.memory) {
    const mb = performance.memory.usedJSHeapSize / 1048576;
    console.log(`JS 堆: ${mb.toFixed(1)} MB  [10 万条参考 < 300 MB]  ${mb < 300 ? '✅' : '❌'}`);
    out.heapMB = mb;
  } else {
    console.log('JS 堆: performance.memory 不可用（Edge 默认可能关闭），跳过');
  }

  console.log('%c=== 验收结束 ===', 'font-weight:bold');
  window.__BENCH_RESULT = out;
  console.log('明细已存到 window.__BENCH_RESULT');
})();
