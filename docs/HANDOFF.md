# OneTab 重写项目 · 交接文档

> 本文档自包含。接手者无需任何前置上下文，读完即可开工。
> 编写日期：2026-09-09

---

## 0. 一句话任务

**从零重写一个 OneTab 替代品**（不是给官方扩展打补丁），要求：**10 万条标签页数据下，列表滚动与鼠标操作保持满帧**。

现有官方 OneTab 2.18 在 **4396 条**时鼠标一动就掉 2 帧，根因是它的渲染方式（见 §2）。用户要的是彻底重写，不是修补。

---

## 1. 用户与环境

| 项 | 值 |
|---|---|
| 平台 | Windows |
| 浏览器 | Microsoft Edge **152.0.4191.66** |
| 显示器 | 144 Hz（**帧预算 6.9 ms**，这是所有性能指标的分母） |
| 现有数据 | OneTab 2.18：**4396 条**（4230 tab + 166 group，其中 553 条在 trash） |
| 现有扩展数 | 约 40 个（AdGuard / SingleFile / Obsidian Clipper / 各类采集助手等） |
| 工作目录 | `E:\CCSpace\projects\2026\09\OneTab性能诊断\` |
| 用户诉求 | 保留全部数据、保留 favicon 图标、不删条目、要的是「优化」不是「关掉功能」 |

**用户的历史参照**：2023 年的 OneTab（MV2 时代）**几万条同时展示都不卡**。所以这不是「数据太多」的问题，是**新版实现退化**。重写目标就是回到甚至超越那个水平。

---

## 2. 诊断结论（为什么必须重写）

### 2.1 根因

官方 2.18 把**全部条目一次性渲染进 DOM**（无虚拟滚动），导致：

- 3838 个 `.tab` 元素 → **42420 个 DOM 节点** → **41555 个布局对象**
- 浏览器每次鼠标移动都要做命中测试（HitTest），成本 ∝ 布局对象数
- 实测 **HitTest 单次 12–13 ms**，而帧预算只有 6.9 ms → **鼠标每动一下掉 2 帧**

### 2.2 关键实测数据

**真实 OneTab 页面**（4396 条）：

| 指标 | 值 |
|---|---|
| DOM 节点 | 42420 |
| `.tab` 元素 | 3838 |
| 节点数/条目 | **11.7** |
| HitTest 单次（p50） | **13.09 ms**（430 次采样，max 20.09 ms） |
| 主线程 26.4 s trace 中 RunTask | 6.86 s（26%） |
| 其中 HitTest 占比 | 52% |
| 滚动 rAF 帧间隔 | 7.2 ms（**合成器线程，所以滚动本身不卡**） |

**合成基准**（同样 3838 条，不同 DOM 形态，`elementFromPoint` × 150 次取平均）：

| DOM 形态 | 1000 条 | 3838 条 | 8000 条 |
|---|---|---|---|
| `complex`（新版形态） | 2.98 ms | **13.24 ms** | 26.01 ms |
| `noabs`（去掉绝对定位图标） | 0.60 | 3.65 | 7.16 |
| `noimg`（去掉 favicon） | 2.71 | 10.18 | 21.61 |
| **`simple`（旧版形态：裸 `<a>`）** | **0.06** | **0.28** | **0.50** |

> **旧版 8000 条只要 0.50 ms，新版 3838 条要 13.24 ms —— 差 76 倍。**

**成本分解**（真实页面逐项干预）：

| 干预 | HitTest | 归因 |
|---|---|---|
| baseline | 12.85 | — |
| `.tab` 子元素全 `display:none` | **2.63** | 条目内容贡献 **80%** |
| `.tabInner` 去 `position:relative` | 9.08 | 定位上下文 **29%** |
| 隐藏 favicon | 9.46 | favicon **27%** |
| `content-visibility: auto` | 6.86 | 屏幕外条目跳过布局，**−44%**（CSS 方案的上限） |
| 去掉 box-shadow / flex / 圆角 | 12.8–12.9 | **无关** |

### 2.3 已排除的假设（别再走这些弯路）

- ❌ **不是 favicon 网络问题**：本地 `_favicon` API 实测 200 可用，仅 18 次回退 `t2.gstatic.com`
- ❌ **不是阴影/圆角/边框**：去掉无改善
- ❌ **不是 flex 布局**：`display:block` 替换无改善
- ❌ **不是绝对定位图标**：`.tabCrossImg/.tabTickImg` 全页只有 144 个
- ❌ **不是硬件加速**：未关闭
- ❌ **不是某段调试代码**：`new Error().stack` 所在的 handler 工厂 `rc` 是死代码，从未被调用
- ❌ **不是主线程 JS 慢**：pointermove 333 次共 26.5 ms，click 2 次共 2.6 ms

**结论：是 3838 个条目 × 11.7 个节点 × 多层定位嵌套的累积成本，没有单一元凶。**

---

## 3. 硬性技术约束（新实现必须满足）

| # | 约束 | 依据 |
|---|---|---|
| C1 | **每行 ≤ 2 个 DOM 节点** | 旧版 `simple @ 8000 = 0.50 ms`，即每行 1 个节点 |
| C2 | **DOM 中常驻的行数恒定**，与数据量无关 | 成本 ∝ 布局对象数，不虚拟化就必然退化 |
| C3 | **图标用 CSS `background-image`**，不用 `<img>` | 每张 `<img>` 至少 +1 节点，且易被写成绝对定位居中 |
| C4 | **禁止用 `position: absolute` 做居中** | 绝对定位元素显著抬高 HitTest 成本 |
| C5 | MV3，**禁止远程代码** | Edge 152 已禁 MV2 |
| C6 | 数据层用 IndexedDB，**列表页启动时一次性读入内存** | 避免滚动时访问数据库 |
| C7 | 行高固定（MVP），超长标题 `ellipsis` | 固定行高才能用最简单的虚拟滚动 |
| C8 | 滚动回调里**只做 DOM 切片**，不做排序/过滤/IO | 保证每帧 < 4 ms |

---

## 4. 目标架构

### 4.1 项目结构

```
onetab-rewrite/
├── manifest.json
├── src/
│   ├── background.js      # MV3 service worker：收集标签页、命令、右键菜单
│   ├── list.html          # 列表页
│   ├── list.css
│   ├── list.js            # 入口：装配虚拟列表 + 搜索 + 交互
│   ├── virtual-list.js    # 虚拟滚动核心（§4.4）
│   ├── store.js           # IndexedDB 封装
│   ├── importer.js        # 从官方 OneTab 迁移数据（§5）
│   └── favicon.js         # favicon URL 生成（§4.5）
├── assets/icons/
└── tools/
    ├── collect.js         # 性能采集脚本（沿用现有）
    └── dom_bench.html     # DOM 形态基准（沿用现有）
```

### 4.2 manifest.json

```json
{
  "manifest_version": 3,
  "name": "OneTab Rewrite",
  "version": "0.1.0",
  "description": "Virtualized tab list — built to handle 100k entries without lag.",
  "permissions": [
    "tabs", "storage", "unlimitedStorage", "favicon",
    "scripting", "contextMenus", "tabGroups"
  ],
  "background": { "service_worker": "src/background.js", "type": "module" },
  "action": { "default_icon": { "32": "assets/icons/32.png" } },
  "commands": {
    "save-all-tabs": {
      "suggested_key": { "default": "Alt+Shift+1" },
      "description": "把当前窗口所有标签页存进列表"
    }
  }
}
```

> `unlimitedStorage` 必加：10 万条 URL 会超过默认配额。
> `favicon` 权限用于本地图标 API（§4.5）。

### 4.3 数据模型

```js
// object store: "tabs"
{ id: string,          // uuid
  url: string,
  title: string,
  groupId: string|null,
  createDate: number,  // ms
  order: number }      // 组内排序

// object store: "groups"
{ id: string,
  label: string,
  parentId: string|null,
  collapsed: boolean,
  createDate: number,
  order: number }
```

**内存中的扁平数组**：启动时 `getAll()` 一次，转成 `rows[]`，排序后常驻内存。10 万条约 30 MB，可接受。

### 4.4 虚拟列表（核心模块）

固定行高 26 px，滚动时只渲染可视区 + 上下各 10 行缓冲，DOM 常驻 ≈ 40 行。

```js
// virtual-list.js
const ROW_H = 26;
const BUFFER = 10;

export class VirtualList {
  constructor(viewport, renderRow) {
    this.viewport = viewport;
    this.renderRow = renderRow;
    this.rows = [];
    this._raf = 0;
    this._lastKey = '';

    this.spacer = document.createElement('div');
    this.spacer.style.cssText = 'height:0;width:1px;';

    this.list = document.createElement('div');
    this.list.style.cssText =
      'position:absolute;top:0;left:0;right:0;will-change:transform;';

    viewport.style.position = 'relative';
    viewport.appendChild(this.spacer);
    viewport.appendChild(this.list);
    viewport.addEventListener('scroll', () => this._schedule(), { passive: true });
  }

  setData(rows) {
    this.rows = rows;
    this.spacer.style.height = (rows.length * ROW_H) + 'px';
    this._lastKey = '';
    this.render(true);
  }

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }

  render(force) {
    const sc = this.viewport.scrollTop;
    const vh = this.viewport.clientHeight;
    const start = Math.max(0, Math.floor(sc / ROW_H) - BUFFER);
    const end = Math.min(this.rows.length, Math.ceil((sc + vh) / ROW_H) + BUFFER);
    const key = start + ':' + end;
    if (!force && key === this._lastKey) return;
    this._lastKey = key;

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) frag.appendChild(this.renderRow(this.rows[i], i));

    this.list.textContent = '';
    this.list.appendChild(frag);
    this.list.style.transform = `translateY(${start * ROW_H}px)`;
  }

  scrollToIndex(i) {
    this.viewport.scrollTop = i * ROW_H;
  }
}
```

**行渲染（1 个节点，图标走 CSS 背景）**：

```js
// list.js
import { faviconUrl } from './favicon.js';

function renderRow(item) {
  const a = document.createElement('a');
  a.className = 'row';
  a.dataset.id = item.id;
  a.textContent = item.title || item.url;
  a.title = item.url;
  a.style.backgroundImage = `url("${faviconUrl(item.url)}")`;
  return a;
}
```

```css
/* list.css —— 注意：没有绝对定位、没有嵌套结构 */
.row {
  display: block;
  height: 26px;
  line-height: 26px;
  padding-inline: 24px 12px;
  background: 4px center / 16px 16px no-repeat;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: none;
  color: #222;
  contain: layout paint;      /* 限制重排范围 */
}
.row:hover { background-color: #f2f2f2; }
```

**点击用事件委托**（不要给每行绑监听）：

```js
list.addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (!row) return;
  e.preventDefault();
  chrome.tabs.create({ url: row.href });
});
```

### 4.5 图标方案

使用 Chrome/Edge 的本地 favicon API（**已验证可用，返回 200**）：

```js
// favicon.js
export function faviconUrl(pageUrl, size = 16) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}
```

**绝对不要**写成 `<picture>` + `<img>` + `position:absolute` + `transform` 居中——官方就是这么干的，每条约目多 2 个节点且引入定位上下文。

CSP 需允许 `img-src 'self' data:`。若本地 API 失败，再回退 `https://t2.gstatic.com/faviconV2?...`（但国内环境会慢，仅作兜底）。

### 4.6 background（service worker）

职责：收集标签页、响应命令、写库。

```js
// background.js
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'save-all-tabs') return;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await saveTabs(tabs);
});

async function saveTabs(tabs) {
  const items = tabs
    .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('edge://'))
    .map(t => ({
      id: crypto.randomUUID(),
      url: t.url,
      title: t.title || t.url,
      groupId: null,
      createDate: Date.now(),
      order: t.index
    }));
  await store.putTabs(items);
  await chrome.tabs.remove(tabs.filter(t => !t.pinned).map(t => t.id));
}
```

> **MV3 注意**：service worker 会被休眠，**不要依赖模块级变量存状态**，每次从 IndexedDB 读。也不要指望 `setInterval` 常驻。

---

## 5. 数据迁移（4396 条一条不能丢）

### 5.1 官方 OneTab 的存储结构（已逆向确认）

- IndexedDB 数据库名 `onetab`，**version 2**
- object store **`item`**，keyPath `id`
  - 索引：`type`、`groupType`、`task`、`parentIds`（multiEntry）
- object store `attr`、`shareUpdate`
- 初始三个根分组：`root` / `quickList` / `trash`
- 条目形态：`{ id, type: 'tab'|'group', url, title, parentIds: [], childIds: [], createDate, ... }`
- 实测：4396 条 = 4230 `tab` + 166 `group`，**553 条在 trash**，JSON 约 1.41 MB

### 5.2 迁移路径 A（推荐）：让用户导出

用户操作：官方 OneTab 页面 → 导出 URL 列表（纯文本，每行一个 URL）→ 新扩展提供「导入文本」入口解析。

优点：零技术风险、不碰官方数据库、用户可控。

### 5.3 迁移路径 B：在 OneTab 页面里读库

**跨扩展读 IndexedDB 是读不到的**（同源隔离），必须在 OneTab 自己的页面里执行：

```js
// 在 chrome-extension://hoimpamkkoehapgenciaoajfkfkpgfop/onetab.html 的 Console 里跑
(async () => {
  const db = await new Promise((res, rej) => {
    const q = indexedDB.open('onetab');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  const all = await new Promise((res, rej) => {
    const q = db.transaction(['item'], 'readonly').objectStore('item').getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  const out = all
    .filter(x => x.type === 'tab' && !(x.parentIds || []).includes('trash'))
    .map(x => ({ url: x.url, title: x.title, groupId: x.parentIds?.[0] ?? null,
                 createDate: x.createDate ?? 0 }));
  console.log('EXPORT ' + JSON.stringify(out));
})();
```

输出复制存成文件，由新扩展导入。

> ⚠️ 该脚本会把用户的完整浏览 URL 暴露在 Console 里，提醒用户注意隐私。

### 5.4 迁移后的校验

- 条数一致（应为 4396 − 553 trash = **3843**，若含 trash 则 4396）
- 随机抽 20 条，URL 与标题与官方一致
- 分组层级一致（166 个 group）

---

## 6. 验收标准

### 6.1 性能（硬指标）

| 场景 | 指标 |
|---|---|
| 10 万条数据，首次打开列表页 | < 1500 ms 可交互 |
| 10 万条，滚动 | rAF 帧间隔 p95 **≤ 16.7 ms**，无 > 50 ms 长帧 |
| 10 万条，`document.elementFromPoint` × 150 | 平均 **< 1.0 ms** |
| DOM 常驻节点数 | **< 2000**，且**与数据量无关**（1000 条与 10 万条相同） |
| 鼠标快速移动 | 无可感知掉帧 |
| 内存占用 | 10 万条 < 300 MB |

### 6.2 功能（MVP 必须）

- [ ] 保存当前窗口全部标签页（含快捷键 `Alt+Shift+1`）
- [ ] 保存单个标签页 / 当前窗口 / 所有窗口
- [ ] 列表页：打开单条（点击行）
- [ ] 列表页：删除单条（→ trash，可恢复）
- [ ] 列表页：搜索过滤
- [ ] 分组：新建 / 重命名 / 折叠 / 展开
- [ ] 从官方 OneTab 导入
- [ ] 导出为文本
- [ ] 右键菜单

### 6.3 明确不在 MVP 范围

- 拖拽排序（虚拟列表里实现成本高）
- 云同步 / 分享
- 多设备
- 标签组（Edge tabGroups）双向同步

---

## 7. 已知坑位

| # | 坑 | 规避 |
|---|---|---|
| K1 | 跨扩展读 IndexedDB 会被同源策略挡住 | 走 §5.3 的页面内脚本 |
| K2 | content script **不能注入到其他扩展的页面**（`chrome-extension://`） | 别想用注入方式改官方 OneTab |
| K3 | MV3 service worker 随时休眠 | 状态放 IndexedDB，不放内存 |
| K4 | `chrome.favicon` 需 `favicon` 权限，URL 形如 `chrome.runtime.getURL('/_favicon/?pageUrl=…&size=16')` | 见 §4.5 |
| K5 | Edge 152 不支持 MV2 | 只能用 MV3 |
| K6 | 用 `<img>` 做图标 → 容易被写成绝对定位居中 → HitTest 暴涨 | 用 CSS `background-image` |
| K7 | `transform` 平移列表时，`scrollTop` 与 `translateY` 会冲突 | `spacer` 撑高度、`list` 绝对定位 + transform |
| K8 | 长标题换行会破坏固定行高 | MVP 用 `ellipsis`；动态行高留到 v2 |
| K9 | 滚动事件高频触发 | `requestAnimationFrame` 节流 + `{ passive: true }` |
| K10 | 默认存储配额不够 | 加 `unlimitedStorage` 权限 |
| K11 | `elementFromPoint` 的基准测试若被浮层遮挡会失真 | 基准页的探测点要避开面板区域（已有教训） |
| K12 | 合成基准 ≠ 真实页面 | 给 favicon 用普通 `<img>` 的基准会漏掉「绝对定位」成本，结论不能直接外推 |

---

## 8. 附件清单

全部位于 `E:\CCSpace\projects\2026\09\OneTab性能诊断\`：

| 文件 | 用途 |
|---|---|
| `findings.md` | 诊断报告（含完整证据链） |
| `collect.js` | 浏览器端采集脚本：条目数 / DOM 节点 / 滚动帧率 / 长任务 / favicon 来源 |
| `scan_onetab_store.py` | 扫描 OneTab IndexedDB 规模 |
| `hit_test_bench.py` | 合成基准（Playwright，需解除沙箱管道限制才能跑） |
| `dom_bench.html` | **在真实 Edge 里跑的 DOM 形态基准**（§2.2 那张表的来源） |
| `explore_trace.py` / `hotspots.py` / `inputs.py` / `cpuprofile.py` / `per_thread.py` / `timeline.py` | Chrome trace 分析脚本 |

原始 trace：`E:\AAAAA\Trace-20260909T084158.json.gz`（26.4 s，115535 事件，可能已被用户清理）

**复现基准的方法**：用 Edge 打开 `dom_bench.html`，它会自动跑 12 组对照并出表。判读标准见 §2.2。

---

## 9. 给接手者的三条忠告

1. **不要相信「数据量太大」这个解释**。旧版 8000 条 0.50 ms，新版 3838 条 13.24 ms——差距来自实现，不是规模。
2. **每个新增的 DOM 节点都要付出代价**。每行多加 1 个节点，10 万条就是 10 万个节点。做减法，不做加法。
3. **验收必须用 §6.1 的量化指标**，不要靠「感觉快了」。基准脚本已经现成，跑一遍就能出数。
