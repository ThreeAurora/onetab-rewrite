<div align="center">

# OneTab Rewrite

**把「标签页列表」做到 10 万条也不卡。**

虚拟滚动 + 每行 1 个 DOM 节点的 OneTab 替代品 · Chrome / Edge (MV3)

[English](./README.en-US.md) · [功能清单](./FEATURES.md) · [性能诊断报告](./docs/diagnostics/findings.md)

![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Platform](https://img.shields.io/badge/platform-Chrome%20%2F%20Edge-brightgreen)
![Manifest](https://img.shields.io/badge/manifest-V3-orange)
![Size](https://img.shields.io/badge/source-~25%20KB%20JS-lightgrey)

</div>

---

## 为什么要重写一个

官方 OneTab 2.18 在 **4396 条**时，鼠标动一下掉 2 帧。不是错觉，是可测量的：

| 官方 OneTab 2.18（4396 条，144 Hz 屏，帧预算 6.9 ms） | 实测 |
|---|---|
| DOM 节点 / 布局对象 | 42420 / 41555 |
| 鼠标命中测试（HitTest）单次 p50 | **13.09 ms** |
| 主线程 26.4 s 内 RunTask 占比 | 6.86 s（26%），其中 HitTest 占 52% |

根因不是 favicon、不是阴影、不是 JS 慢——是**几千个条目全量渲染进 DOM，多层定位嵌套，
命中测试成本随布局对象数线性上涨**。

对照实验最能说明问题（同样条目数、不同 DOM 形态，`elementFromPoint` × 150 取平均）：

| DOM 形态 | 1000 条 | 3838 条 | 8000 条 |
|---|---|---|---|
| 官方新版形态（每条约 11.7 节点 + 绝对定位图标） | 2.98 ms | **13.24 ms** | 26.01 ms |
| 旧版形态（裸 `<a>`，1 节点） | 0.06 ms | **0.28 ms** | **0.50 ms** |

> 旧版 8000 条 0.50 ms，新版 3838 条 13.24 ms——差 **76 倍**。这是实现退化，不是数据太多。

完整证据链（trace 分析、干预实验、排除项）见 **[docs/diagnostics/findings.md](./docs/diagnostics/findings.md)**，
复现脚本在 `docs/diagnostics/` 下。

### 那旧版呢？旧版其实更快，只是装不上了

上面那张表里 0.50 ms 的一行，就是旧版（2.0 之前）的 DOM 形态——每行一个裸 `<a>`，又快又好用。
问题出在时代：**旧版是 MV2 扩展，而 Edge 152 与现代 Chrome 已经停用 MV2**。商店里能装到的只剩
为适配 MV3 重写过的 2.x，而那次重写顺手把渲染做坏了（数据层搬进 service worker、列表改由多层
嵌套节点拼装）。

同类里 [OneTab-Reborn](https://github.com/Nuzza/OneTab-Reborn) 复刻的正是这个好用的旧版，
但它的 manifest 同样是 `manifest_version: 2`——在现在的 Edge / Chrome 上根本加载不了，
只能跑在仍支持 MV2 的 Firefox ESR 一类环境里。

所以本项目想做的不是"比旧版更好"，而是：**把旧版那套渲染纪律（每行一个节点、不做花活）
重新搬回 MV3**，再补一层旧版也没有的虚拟滚动。

> 口径说明：0.50 ms 这一行是按旧版 DOM 形态合成的基准（`dom_bench.html`），不是实测旧版 OneTab
> 本体——它已经装不上了。合成基准的意义在于排除 favicon、脚本逻辑等干扰，只看 DOM 形态这一
> 个变量的代价。

## 本项目的做法

| 约束 | 落地方式 |
|---|---|
| 每行 ≤ 2 个 DOM 节点 | **每行严格 1 个节点**。删除叉是 `::after` 伪元素、折叠箭头是 `::before`，零 DOM 成本 |
| DOM 常驻行数恒定 | `virtual-list.js`：可视区 + 上下各 10 行缓冲（约 40 行），与总条数无关 |
| 图标用 CSS 背景 | `background-image: url(chrome-extension://…/_favicon/?pageUrl=…)`，不用 `<img>` |
| 行内禁止 `position:absolute` | 叉用 `float:right`，箭头用 inline-block，不引入定位上下文 |
| 启动一次性读库 | IndexedDB 全量 `getAll` 一次进内存，滚动路径不碰数据库 |
| 固定行高 | 26 px，超长标题 `ellipsis`（动态行高留到 v2） |
| 滚动回调只做切片 | `scroll` → rAF 节流（passive）→ 重建可视区 DOM，无排序/过滤/IO |

## 性能验收

真实数据只有几千条，所以内置了压测参数——**数据只进内存，不写库**，不污染你的真数据。

```text
chrome-extension://<扩展ID>/src/list.html?stress=100000
```

打开后 F12 → Console → 粘贴 [`tools/bench_rewrite.js`](./tools/bench_rewrite.js) 并回车（约 10 秒）。

| 指标 | 要求 | 脚本判定 |
|---|---|---|
| DOM 常驻节点数 | < 2000，且**与数据量无关** | 自动 |
| HitTest（`elementFromPoint` ×150 平均） | < 1.0 ms | 自动 |
| 滚动 rAF 帧间隔 p95 | ≤ 16.7 ms，无 > 50 ms 长帧 | 自动 |
| 10 万条首次可交互 | < 1500 ms | 输出 `DOMContentLoaded` 参考值 |
| 内存 | < 300 MB | 输出 JS 堆（Edge 可能关闭 `performance.memory`） |

「与数据量无关」这一条：用 `?stress=1000` 和 `?stress=100000` 各跑一次，两次的 DOM 节点数应当完全一致。

## 安装

1. `edge://extensions`（Chrome 为 `chrome://extensions`）→ 打开右上角「开发人员模式」
2. 「加载解压缩的扩展」→ 选择本仓库目录
3. 工具栏出现蓝色 `1T` 图标

也可以直接下载 Release 里的 `onetab-rewrite-v0.1.0.zip`，解压后加载该目录（无需构建、无依赖）。

## 从官方 OneTab 迁移（一条不丢）

1. 打开官方 OneTab 页面，F12 Console 粘贴 [`tools/export_onetab.js`](./tools/export_onetab.js) 回车
2. 自动下载 `onetab-export-<日期>.json`（含 tabs + 带组名的 groups）
3. 本扩展列表页 →「导入」→ 选该文件（默认按 URL 去重，重复导入不会翻倍）

也兼容官方「导出 URL 列表」的纯文本、以及 HANDOFF 时代的纯 tab 数组 JSON。
⚠️ 导出文件含完整浏览记录，注意保管。

## 功能一览

保存（单页/当前窗口/所有窗口）· 分组（新建、重命名、折叠、删除）· 搜索 · 回收站（恢复/永久删除/清空）·
导入导出 · 右键菜单 · 键盘操作（`/` `↑↓` `Enter` `Delete` `Esc`）。

完整清单见 **[FEATURES.md](./FEATURES.md)**。

## 与同类项目的差异

同类不少，值得 Respect 的也很多——但它们几乎都在卷**功能数量**，没有一个把**渲染预算**当第一约束：

| 项目 | 状态 | 定位 |
|---|---|---|
| OneTab 官方 2.18 | 闭源 | 4396 条即掉帧（本项目实测） |
| [better-onetab](https://github.com/cnwangjie/better-onetab) | 1.7k★ **已归档** | Vue，功能派（同步/配置/拖拽），2018 年后停更 |
| [N-Tab](https://github.com/scoful/N-Tab) | 0.9k★ 活跃 | 中文，功能派，Chrome/Edge |
| [NiceTab](https://github.com/web-dahuyou/NiceTab) | 0.75k★ 活跃 | TS/React，目前功能最全（同步、主题、多格式导入、拖拽排序） |
| [OneTab-Reborn](https://github.com/Nuzza/OneTab-Reborn) | 21★ | 复刻的正是更好用的旧版（pre-2.0）——但它是 `manifest_version: 2`，现代 Chrome / Edge 已无法加载 |
| [onetab (反混淆版)](https://github.com/AltarBeastiful/onetab) | 58★ | 官方代码反混淆 + 补快捷键 |

本项目的取舍很清楚：

- **功能比它们少**（没有云同步、主题、拖拽排序、缩略图——见 [FEATURES.md](./FEATURES.md) 的「不做」清单）
- **性能是硬指标且可复现**：每行 1 节点、DOM 常驻与数据量无关、附验收脚本与诊断证据链
- **代码极小**：约 25 KB 原生 JS（无框架、无构建步骤），能一眼看完 `virtual-list.js`

如果你要的是「功能最多的标签管理器」，用 NiceTab；
如果你有几万条舍不得删的历史标签，想在 144 Hz 屏上滚得动——用这个。

## 目录结构

```
onetab-rewrite/
├── manifest.json              MV3 清单
├── src/
│   ├── background.js          service worker：快捷键、右键菜单、点击图标开列表
│   ├── actions.js             保存标签页（SW 与列表页共用）
│   ├── virtual-list.js        虚拟滚动核心（约 100 行）
│   ├── store.js               IndexedDB 封装（tabs / groups）
│   ├── importer.js            导入解析（3 种格式）
│   ├── favicon.js             _favicon URL 生成
│   └── list.html / css / js   列表页
├── assets/icons/              16 / 32 / 48 / 128
├── tools/
│   ├── bench_rewrite.js       性能验收脚本
│   ├── export_onetab.js       官方 OneTab 数据导出（在其 Console 里跑）
│   └── make_icons.py          图标生成
└── docs/
    ├── HANDOFF.md             设计约束与交接说明
    └── diagnostics/           官方 OneTab 卡顿诊断：报告 + 可复现脚本
```

数据模型（IndexedDB 库名 `onetab-rewrite`）：

```text
tabs:   { id, url, title, groupId, createDate, order, deletedFrom? }
groups: { id, label, collapsed, createDate, order, fixed? }
```

固定组 `__trash__` 是回收站。删除单条只是把 `groupId` 改成 `__trash__` 并记录 `deletedFrom`，
所以**永远可恢复**。`groupId: null` 的条目显示在置顶的「未分组」虚拟组。

## 开发与贡献

无构建、无依赖：`git clone` → `edge://extensions` 加载目录即可。改完刷新扩展页面。

欢迎的 PR 方向：动态行高、拖拽排序、暗色主题、Firefox 适配。
**请注意提交规范**：一个功能一笔提交，中文人话描述（见 [docs/HANDOFF.md](./docs/HANDOFF.md)）。

## 许可证

[GPL-3.0](./LICENSE)。与使用 GPL-3.0 的 [Gaze](https://github.com/ThreeAurora/gaze-image-viewer) 保持一致。
