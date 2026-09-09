# -*- coding: utf-8 -*-
"""第三步：输入事件 / HitTest / CPU 采样结构。"""
import gzip
import json
import collections

PATH = r"E:\AAAAA\Trace-20260909T084158.json.gz"
with gzip.open(PATH, 'rt', encoding='utf-8') as fh:
    data = json.load(fh)
ev = data['traceEvents']

# ---------- A. EventDispatch 按 type ----------
agg = collections.Counter()
cnt = collections.Counter()
mx = collections.Counter()
for e in ev:
    if e.get('name') == 'EventDispatch' and e.get('ph') == 'X':
        t = (e.get('args', {}).get('data', {}) or {}).get('type', '?')
        d = e.get('dur', 0)
        agg[t] += d
        cnt[t] += 1
        mx[t] = max(mx[t], d)
print('=== EventDispatch by type (main thread 50540) ===')
for t, c in cnt.most_common(25):
    print('  %-26s x%-5d total=%9.1fms max=%8.1fms' % (t, c, agg[t] / 1000.0, mx[t] / 1000.0))

# ---------- B. InputLatency 分布 ----------
lat = collections.defaultdict(list)
for e in ev:
    n = e.get('name', '')
    if n.startswith('InputLatency::') and e.get('ph') == 'X':
        lat[n.split('::', 1)[1]].append(e.get('dur', 0))
print('\n=== InputLatency by type (ms) ===')
for t, v in sorted(lat.items(), key=lambda x: -len(x[1])):
    v.sort()
    def q(p):
        return v[min(len(v) - 1, int(len(v) * p))] / 1000.0
    print('  %-24s n=%-5d p50=%7.1f p90=%7.1f p99=%8.1f max=%9.1f' % (t, len(v), q(.5), q(.9), q(.99), v[-1] / 1000.0))

# ---------- C. HitTest 内部 ----------
hits = [e for e in ev if e.get('name') == 'HitTest' and e.get('ph') == 'X']
hits.sort(key=lambda e: -e.get('dur', 0))
print('\n=== 3 slowest HitTest + children ===')
for h in hits[:3]:
    t0 = h['ts']
    t1 = t0 + h['dur']
    tid = h['tid']
    print('  HitTest dur=%.1fms ts=%s' % (h['dur'] / 1000.0, t0))
    kids = [e for e in ev
            if e.get('ph') == 'X' and e.get('tid') == tid and e is not h
            and e.get('ts', 0) >= t0 and e.get('ts', 0) + e.get('dur', 0) <= t1]
    kids.sort(key=lambda e: -e.get('dur', 0))
    for k in kids[:10]:
        print('      %8.2fms  %s' % (k['dur'] / 1000.0, k.get('name')))

# ---------- D. Profile 结构 ----------
print('\n=== Profile / ProfileChunk structure ===')
seen = 0
for e in ev:
    if e.get('name') in ('Profile', 'ProfileChunk'):
        a = e.get('args', {}).get('data', {}) or {}
        cp = a.get('cpuProfile', {}) or {}
        print('  pid=%s tid=%s name=%-12s dataKeys=%s cpKeys=%s nodes=%d samples=%d deltas=%d'
              % (e.get('pid'), e.get('tid'), e.get('name'), list(a.keys()), list(cp.keys()),
                 len(cp.get('nodes') or []), len(cp.get('samples') or []), len(cp.get('timeDeltas') or [])))
        ns = cp.get('nodes') or []
        if ns:
            print('     node0=%s' % json.dumps(ns[0], ensure_ascii=False)[:280])
        seen += 1
        if seen >= 4:
            break
