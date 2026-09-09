# OneTab 2.18 卡顿诊断报告

日期：2026-09-09
环境：Edge 152.0.4191.66 / OneTab 2.18（Edge 商店版，ID `hoimpamkkoehapgenciaoajfkfkpgfop`）/ Windows
数据规模：4396 条（4230 tab + 166 group，其中 553 条在 trash），IndexedDB 2.33 MB

## 结论

卡顿根因 = **4396 个条目全量渲染成 41555 个布局对象，导致鼠标命中测试（HitTest）单次耗时 13 ms**。
与 favicon 图标无关，与 box-shadow 无关。

## 证据链

### 1. 数据规模与渲染方式
- `onetab.html` 是空壳（只有 `<div id="contentAreaDiv">`），列表全部由 JS 现场生成
- 代码中无 `IntersectionObserver` / 虚拟滚动 / `requestIdleCallback` → 全量渲染
- 实测 42336 → 42420 DOM 节点；trace 中 `Layout` 事件 `totalObjects: 41555`

### 2. 主线程时间轴（26.4 s trace，pid=32232 tid=50540 CrRendererMain）
| 指标 | 值 |
|---|---|
| RunTask 忙碌 | 6.86 s（26%） |
| HitTest | 430 次，**p50 13.09 ms**，p90 14.63 ms，max 20.09 ms |
| HitTest > 4 ms | 253 / 430（59%） |
| 最忙的秒 | RunTask 600–840 ms/s，其中 HitTest 占 250–560 ms |
| 滚动 rAF 帧间隔 | avg 7.2 ms（合成器线程，不受影响） |

命中节点：`DIV class='tabInner'`、`A class='tabLink tabLinkText'`。
本机一帧 ≈ 6.9 ms（144 Hz），一次 HitTest = 掉 2 帧。

### 3. 干预实验（`document.elementFromPoint` × 60，单位 ms）
| 干预 | 耗时 | 结论 |
|---|---|---|
| baseline | 12.25 | — |
| `.tab { content-visibility: auto; contain-intrinsic-size: auto 26px }` | **6.86** | **有效，-44%** |
| `.tab { box-shadow:none; border-radius:0; border:none }` | 12.44 | 阴影无关 |
| `.tab { contain: layout paint style }` | 15.09 | 有害 |
| 隐藏一半 `.tab` | 8.19 | 成本与布局对象数正相关 |
| 隐藏整个列表容器 | 0.46 | 成本 100% 来自列表内部 |

### 4. 排除项
- **favicon**：`_favicon` 实测 fetch 200 可用；`favicon` 权限在 `chrome.permissions.getAll()` 中；仅 18 次回退 `t2.gstatic.com`。不是主因。
- **调试代码**：`new Error().stack` 所在的 handler 工厂 `rc`（onetab.js）**定义但从未调用**，是死代码。
- **JS 事件处理器**：pointermove 333 次共 26.5 ms，click 2 次共 2.6 ms，不慢。
- **硬件加速**：未关闭（默认值）。

### 5. 背景（版本退化方向）
OneTab 2.18 把数据层移入 background service worker，页面经 Proxy + `chrome.runtime.sendMessage` 走 RPC
（44 个 RPC 方法，`T.Ee` 21 处调用点）。旧版 MV2 直接在页面读 storage。此为次要因素（background 线程采样几乎全 idle）。

## 处置方案

### A. CSS 注入（已验证有效，-44%）
在 `...\Extensions\hoimpamkkoehapgenciaoajfkfkpgfop\2.18_0\onetab.css` 末尾追加：

```css
.tab { content-visibility: auto; contain-intrinsic-size: auto 26px; }
```

注意：OneTab 更新到新版本后会覆盖，需重做。可能影响屏幕外元素的拖拽/scrollIntoView 精度。

### B. 清理 trash
553 条（12.6%）在回收站，白付渲染成本。

### C. 归档旧分组
把不常看的整组导出成文本后删除，常驻条目压到 1000 以下。

## 诊断产物
- `scan_onetab_store.py` — 扫描 IndexedDB 规模
- `collect.js` — 浏览器端采集脚本（条目数 / 帧率 / 长任务 / favicon 来源）
- `explore_trace.py` / `hotspots.py` / `inputs.py` / `cpuprofile.py` / `per_thread.py` / `timeline.py` — trace 分析
- 原始 trace：`E:\AAAAA\Trace-20260909T084158.json.gz`
