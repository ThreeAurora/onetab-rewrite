# -*- coding: utf-8 -*-
"""第四步：修正 CPU 采样解析 + 输入延迟 + HitTest 调用者。"""
import gzip
import json
import collections

PATH = r"E:\AAAAA\Trace-20260909T084158.json.gz"
with gzip.open(PATH, 'rt', encoding='utf-8') as fh:
    data = json.load(fh)
ev = data['traceEvents']

# ---------- A. InputLatency 事件结构 ----------
print('=== InputLatency event shapes (first 3) ===')
seen = 0
for e in ev:
    if 'InputLatency' in (e.get('name') or ''):
        print('  ph=%s name=%s dur=%s cat=%s argsKeys=%s'
              % (e.get('ph'), e.get('name'), e.get('dur'), e.get('cat'),
                 list((e.get('args') or {}).keys())))
        seen += 1
        if seen >= 3:
            break

lat = collections.defaultdict(list)
for e in ev:
    n = e.get('name') or ''
    if n.startswith('InputLatency::') and e.get('dur'):
        lat[n.split('::', 1)[1]].append(e['dur'])
print('\n=== InputLatency durations (ms) ===')
for t, v in sorted(lat.items(), key=lambda x: -len(x[1])):
    v.sort()
    def q(p):
        return v[min(len(v) - 1, int(len(v) * p))] / 1000.0
    print('  %-26s n=%-5d p50=%7.1f p90=%7.1f p99=%8.1f max=%9.1f' % (t, len(v), q(.5), q(.9), q(.99), v[-1] / 1000.0))

# ---------- B. HitTest 的父事件 ----------
hits = [e for e in ev if e.get('name') == 'HitTest' and e.get('ph') == 'X']
hits.sort(key=lambda e: -e.get('dur', 0))
print('\n=== HitTest callers (top 5 slowest) ===')
xev = [e for e in ev if e.get('ph') == 'X' and e.get('tid') == 50540]
for h in hits[:5]:
    t0, t1 = h['ts'], h['ts'] + h['dur']
    parents = [e for e in xev
               if e is not h and e.get('ts', 0) <= t0 and e.get('ts', 0) + e.get('dur', 0) >= t1
               and (e.get('dur') or 0) < (h.get('dur') or 0) * 12]
    parents.sort(key=lambda e: e.get('dur') or 0)
    chain = ' < '.join('%s(%.1fms)' % (p.get('name'), p.get('dur', 0) / 1000.0) for p in parents[:4])
    print('  HitTest %.1fms  <- %s' % (h['dur'] / 1000.0, chain))

# ---------- C. CPU profile（修正 timeDeltas 位置）----------
nodes = {}
samples = []
deltas = []
for e in ev:
    if e.get('name') in ('Profile', 'ProfileChunk'):
        d = e.get('args', {}).get('data', {}) or {}
        cp = d.get('cpuProfile', {}) or {}
        for n in (cp.get('nodes') or []):
            if n.get('id') is not None:
                nodes[n['id']] = n
        samples.extend(cp.get('samples') or [])
        deltas.extend(d.get('timeDeltas') or [])

print('\n=== cpu profile: nodes=%d samples=%d deltas=%d ===' % (len(nodes), len(samples), len(deltas)))

self_time = collections.Counter()
for sid, dt in zip(samples, deltas):
    self_time[sid] += dt

def frame_of(nid):
    n = nodes.get(nid) or {}
    cf = n.get('callFrame', {}) or {}
    url = cf.get('url') or ''
    if url.startswith('chrome-extension://'):
        url = url.rsplit('/', 1)[-1]
    return cf.get('functionName') or '(anonymous)', url, cf.get('lineNumber'), n.get('parent')

print('\n=== top 30 self-time (ms) ===')
for nid, t in self_time.most_common(30):
    fn, url, line, parent = frame_of(nid)
    print('  %9.1f ms  %-30s %s:%s' % (t / 1000.0, fn[:30], url[-46:], line))

print('\n=== call paths of top 8 hot nodes ===')
for nid, t in self_time.most_common(8):
    fn, url, line, parent = frame_of(nid)
    path = ['%s@%s:%s' % (fn, url[-24:], line)]
    seen_ids = set([nid])
    guard = 0
    while parent and parent in nodes and parent not in seen_ids and guard < 12:
        seen_ids.add(parent)
        pfn, purl, pline, pparent = frame_of(parent)
        path.append('%s@%s:%s' % (pfn, purl[-24:], pline))
        parent = pparent
        guard += 1
    print('  [%8.1f ms] %s' % (t / 1000.0, '  <-  '.join(path)))
