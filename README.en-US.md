<div align="center">

# OneTab Rewrite

**A tab list that stays at 60 fps with 100,000 entries.**

Virtualized OneTab alternative — 1 DOM node per row · Chrome / Edge (MV3)

[中文](./README.md) · [Features](./FEATURES.en-US.md) · [Performance diagnosis](./docs/diagnostics/findings.md)

![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Platform](https://img.shields.io/badge/platform-Chrome%20%2F%20Edge-brightgreen)
![Manifest](https://img.shields.io/badge/manifest-V3-orange)
![Size](https://img.shields.io/badge/source-~25%20KB%20JS-lightgrey)

</div>

---

## Why rewrite it

Official OneTab 2.18 drops frames on every mouse move at just **4,396 entries**. That is not a feeling —
it is measurable:

| OneTab 2.18, 4,396 entries, 144 Hz display (6.9 ms frame budget) | Measured |
|---|---|
| DOM nodes / layout objects | 42,420 / 41,555 |
| Hit test (single, p50) | **13.09 ms** |
| Main-thread RunTask in a 26.4 s trace | 6.86 s (26%), 52% of it hit testing |

The cause is not favicons, not shadows, not slow JS — it is **rendering every entry into the DOM at once,
with nested positioned boxes**, so hit-test cost scales with the number of layout objects.

A control experiment says it best (same entry count, different DOM shapes, `elementFromPoint` × 150):

| DOM shape | 1,000 | 3,838 | 8,000 |
|---|---|---|---|
| Current OneTab (~11.7 nodes/row + absolutely positioned icons) | 2.98 ms | **13.24 ms** | 26.01 ms |
| Old OneTab (bare `<a>`, 1 node) | 0.06 ms | **0.28 ms** | **0.50 ms** |

> 0.50 ms for 8,000 rows versus 13.24 ms for 3,838 — a **76×** gap. That is an implementation regression,
> not "too much data".

Full evidence (trace analysis, intervention experiments, ruled-out hypotheses):
**[docs/diagnostics/findings.md](./docs/diagnostics/findings.md)**, with reproduction scripts alongside it.

## How this build avoids it

| Constraint | Implementation |
|---|---|
| ≤ 2 DOM nodes per row | **Exactly 1 node per row.** The delete `×` is an `::after` pseudo-element, the collapse arrow is `::before` |
| Constant number of live rows | `virtual-list.js`: viewport + 10 rows of buffer above and below (~40 rows), independent of total count |
| Icons via CSS background | `background-image: url(chrome-extension://…/_favicon/?pageUrl=…)` — no `<img>` |
| No `position:absolute` inside rows | `float:right` for the ×, inline-block for the arrow — no positioning context |
| Read the database once | One `getAll` into memory at startup; scrolling never touches IndexedDB |
| Fixed row height | 26 px, long titles get `ellipsis` (variable row height is a v2 item) |
| Scroll handler only slices | `scroll` → rAF-throttled (passive) → rebuild the visible slice. No sorting, filtering, or IO |

## Benchmarks

Real libraries only have a few thousand entries, so a stress mode is built in — **memory only, nothing
is written to the database**:

```text
chrome-extension://<extension-id>/src/list.html?stress=100000
```

Then open DevTools → Console → paste [`tools/bench_rewrite.js`](./tools/bench_rewrite.js) (takes ~10 s).

| Metric | Target | Checked by script |
|---|---|---|
| Live DOM nodes | < 2000 and **independent of entry count** | yes |
| Hit test (`elementFromPoint` ×150, avg) | < 1.0 ms | yes |
| Scroll rAF interval, p95 | ≤ 16.7 ms, no frame > 50 ms | yes |
| Time to interactive at 100k | < 1500 ms | prints `DOMContentLoaded` |
| Memory | < 300 MB | prints JS heap (Edge may disable `performance.memory`) |

For the "independent of entry count" claim, run it twice — `?stress=1000` and `?stress=100000` — the DOM
node count should be identical.

## Install

1. `edge://extensions` (`chrome://extensions` on Chrome) → enable **Developer mode**
2. **Load unpacked** → pick this repository's directory
3. A blue `1T` icon appears in the toolbar

Or download `onetab-rewrite-v0.1.0.zip` from Releases, unzip, and load that folder. No build step, no dependencies.

## Migrating from official OneTab (without losing a single entry)

1. Open the official OneTab page, paste [`tools/export_onetab.js`](./tools/export_onetab.js) into the DevTools console
2. It downloads `onetab-export-<date>.json` (tabs **and** groups with their names)
3. In this extension: **Import** → pick that file. URLs already in the library are skipped, so importing
   twice will not duplicate anything

Also accepts OneTab's plain-text URL export and bare tab-array JSON.
⚠️ The export contains your full browsing history — store it accordingly.

## Features at a glance

Save (single tab / current window / all windows) · groups (create, rename, collapse, delete) · search ·
trash (restore / delete forever / empty) · import & export · context menus · keyboard
(`/` `↑↓` `Enter` `Delete` `Esc`).

Full list: **[FEATURES.en-US.md](./FEATURES.en-US.md)**.

## How it differs from similar projects

Plenty of alternatives exist, several of them excellent — but they compete on **feature count**. None of
them treats **render budget** as a first-class constraint:

| Project | Status | Angle |
|---|---|---|
| OneTab 2.18 (official) | closed source | drops frames at 4,396 entries (measured here) |
| [better-onetab](https://github.com/cnwangjie/better-onetab) | 1.7k★ **archived** | Vue, feature-rich (sync, config, DnD), last active 2018 |
| [N-Tab](https://github.com/scoful/N-Tab) | 0.9k★ active | Chinese, feature-rich, Chrome/Edge |
| [NiceTab](https://github.com/web-dahuyou/NiceTab) | 0.75k★ active | TS/React, currently the most complete (sync, themes, many import formats, DnD) |
| [OneTab-Reborn](https://github.com/Nuzza/OneTab-Reborn) | 21★ | restyled fork of pre-2.0 OneTab |
| [onetab (deobfuscated)](https://github.com/AltarBeastiful/onetab) | 58★ | official code, deobfuscated + extra shortcuts |

The trade-off is honest:

- **Fewer features** than NiceTab (no cloud sync, themes, drag-and-drop, thumbnails — see the "won't do"
  list in [FEATURES.en-US.md](./FEATURES.en-US.md))
- **Performance as a reproducible hard metric**: 1 node per row, DOM count independent of data size,
  benchmark script and diagnostic evidence included
- **Tiny codebase**: ~25 KB of vanilla JS, no framework, no build step — you can read `virtual-list.js`
  in one sitting

If you want the most feature-complete tab manager, use NiceTab.
If you have tens of thousands of saved tabs you refuse to delete and want them to scroll smoothly on a
144 Hz display — use this.

## Layout

```
onetab-rewrite/
├── manifest.json              MV3 manifest
├── src/
│   ├── background.js          service worker: shortcuts, context menus, toolbar action
│   ├── actions.js             saving tabs (shared by SW and list page)
│   ├── virtual-list.js        virtualization core (~100 lines)
│   ├── store.js               IndexedDB wrapper (tabs / groups)
│   ├── importer.js            import parsing (3 formats)
│   ├── favicon.js             _favicon URL builder
│   └── list.html / css / js   list page
├── assets/icons/              16 / 32 / 48 / 128
├── tools/
│   ├── bench_rewrite.js       benchmark (run in the list page console)
│   ├── export_onetab.js       OneTab data export (run in OneTab's console)
│   └── make_icons.py          icon generator
└── docs/
    ├── HANDOFF.md             design constraints
    └── diagnostics/           why official OneTab is slow: report + repro scripts
```

Data model (IndexedDB database `onetab-rewrite`):

```text
tabs:   { id, url, title, groupId, createDate, order, deletedFrom? }
groups: { id, label, collapsed, createDate, order, fixed? }
```

`__trash__` is the built-in trash group. Deleting an entry only sets `groupId` to `__trash__` and records
`deletedFrom`, so **it is always recoverable**. Entries with `groupId: null` appear in a pinned
"Ungrouped" virtual group.

## Contributing

No build step, no dependencies: `git clone` → load the directory in `edge://extensions`.

PRs welcome for: variable row heights, drag-and-drop reordering, dark theme, Firefox support.
**Commit style**: one feature per commit, described in plain Chinese — see [docs/HANDOFF.md](./docs/HANDOFF.md).

## License

[GPL-3.0](./LICENSE), matching [Gaze](https://github.com/ThreeAurora/gaze-image-viewer).
