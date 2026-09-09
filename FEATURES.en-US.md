# OneTab Rewrite — Features

> Companion to [README.en-US.md](./README.en-US.md). Everything below is **actually implemented** in
> v0.1.0, plus an explicit **won't-do** list so nothing is assumed to exist.

## 1. Saving tabs

- [x] Save all tabs in the current window
  - Toolbar button **Save current window**
  - Shortcut `Alt+Shift+1` (changeable at `edge://extensions/shortcuts`)
  - Page context menu / extension icon context menu
- [x] Save a single tab (page context menu) — the current tab stays open
- [x] Save all tabs from all windows
- [x] Each save creates a timestamped group (`2026/09/09 10:19:07`), matching OneTab's behavior
- [x] Deduplicate by URL within a batch
- [x] Skip internal pages (`chrome://` `edge://` `about:` `devtools:` `view-source:` …)
- [x] Close saved tabs afterwards; **pinned tabs are never closed**
- [ ] Save left / right / other tabs only
- [ ] Auto-group by domain when saving
- [ ] Scheduled auto-save

## 2. Browsing the list

- [x] Virtualized: ~40 live rows; 100,000 entries cost the same DOM as 1,000
- [x] Click a row to open it (new tab, foreground)
- [x] `Ctrl` / `⌘` + click or middle click → open in background
- [x] Hover reveals a trailing `×` to delete (pseudo-element, zero DOM cost)
- [x] Hover shows the full URL (native tooltip)
- [x] Favicons via the browser's local `_favicon` API — no network requests
- [x] Whole dataset loaded into memory once at startup; scrolling never hits IndexedDB
- [ ] Inline thumbnails
- [ ] Multi-select (marquee / shift-range) and bulk actions
- [ ] Variable row heights (wrap long titles)

## 3. Groups

- [x] Create a group (toolbar **+Group**, name it on creation)
- [x] Rename (context menu, custom input dialog)
- [x] Collapse / expand (click the group row or use the context menu; state persists)
- [x] Delete a group (its entries go to the trash and can be restored)
- [x] Group rows show their entry count: `Group name (N)`
- [x] "Ungrouped" virtual group for entries with no group, pinned at the top, collapsible
- [x] Newest group first (decreasing `order`)
- [ ] Drag-and-drop reordering (within / across groups)
- [ ] Nested groups
- [ ] Lock a group against accidental deletion

## 4. Trash

- [x] Deleting an entry moves it to the trash (only `groupId` changes; `deletedFrom` is recorded)
- [x] Restore to its original group (falls back to Ungrouped if that group is gone)
- [x] Delete an entry permanently
- [x] Empty the trash (with confirmation)
- [x] Trash is collapsed by default; entries render dimmed
- [ ] Auto-empty after N days

## 5. Search

- [x] Substring match on title and URL, filtered live
- [x] Hit count shown on the first row
- [x] Trash entries excluded from results
- [x] In-memory filtering — milliseconds even at `?stress=100000`
- [ ] Multiple keywords (space-separated AND)
- [ ] Regex / negation syntax
- [ ] Filter by domain or date

## 6. Import / export

- [x] Import official OneTab data (extended JSON, group names included)
- [x] Import a bare tab-array JSON (placeholder groups derived from `groupId`)
- [x] Import a plain-text URL list (OneTab's text export → one "Import YYYY-MM-DD" group)
- [x] Dedupe by URL on import and report "imported N, skipped K duplicates"
- [x] Export as text (one URL per line, group names as `#` comments)
- [x] Export a JSON backup (all entries, groups, and trash — full restore possible)
- [ ] Import this project's own JSON backup
- [ ] Import browser bookmarks HTML
- [ ] Import Toby / Session Buddy / N-Tab / NiceTab formats

## 7. Keyboard & context menus

- [x] `/` focus search
- [x] `↑` `↓` move the highlight, scrolling follows
- [x] `Enter` open the entry (or collapse/expand on a group row)
- [x] `Delete` delete the highlighted entry (to trash)
- [x] `Esc` clear search / close menus and dialogs
- [x] Entry menu: open / open in background / copy URL / delete
- [x] Trash entry menu: restore to original group / delete permanently
- [x] Group menu: collapse or expand / rename / delete group
- [x] Trash group menu: empty trash

## 8. Performance tooling (what sets this project apart)

- [x] Built-in stress mode: `src/list.html?stress=N` generates N fake entries (memory only; a refresh
      returns to your real data)
- [x] Benchmark script `tools/bench_rewrite.js`: DOM node count, average hit-test time, scroll frame
      interval p50/p95/max, long-frame count
- [x] Official OneTab diagnosis with reproduction scripts in `docs/diagnostics/`
  - `findings.md` — the full evidence chain
  - `dom_bench.html` (DOM shape benchmark in a real browser), `collect.js`, `hit_test_bench.py`,
    `scan_onetab_store.py`
  - `scripts/` — Chrome trace analysis scripts

## 9. Explicitly out of scope (v0.1.0)

- Cloud sync / multiple devices (needs accounts and a server; conflicts with local-first)
- Sharing lists, collaboration
- Drag-and-drop reordering (expensive under virtualization; lower priority than performance)
- Dark theme (PRs welcome)
- Firefox support (manifest needs small changes; PRs welcome)
- Two-way sync with native Edge tab groups
- Tab suspending / memory saving (that is a different kind of tool — this one manages the saved list)

## 10. Known trade-offs

- Fixed 26 px rows; long titles are ellipsized (full URL on hover)
- Within a group, newest first; manual ordering not supported yet
- `?stress=` data lives in memory only and is never written to IndexedDB
- Import dedupe compares URLs only, not titles
