# -*- coding: utf-8 -*-
"""第二步：定位 Extension Renderer 主线程的热点。"""
import gzip
import json
import collections

PATH = r"E:\AAAAA\Trace-20260909T084158.json.gz"

with gzip.open(PATH, 'rt', encoding='utf-8') as fh:
    data = json.load(fh)
ev = data['traceEvents']

# ---------- 线程名 ----------
threads = {}
for e in ev:
    if e.get('ph') == 'M' and e.get('name') == 'thread_name':
        threads[(e.get('pid'), e.get('tid'))] = e.get('args', {}).get('name')
procs = {}
for e in ev:
    if e.get('ph') == 'M' and e.get('name') == 'process_name':
        procs[e.get('pid')] = e.get('args', {}).get('name')

print('=== threads (pid, tid) -> name ===')
for k, v in sorted(threads.items(), key=lambda x: str(x[0])):
    print('  %s %-12s %s' % (k, procs.get(k[0], '?'), v))

# ---------- X 事件按线程计数 ----------
x_by_thread = collections.Counter()
for e in ev:
    if e.get('ph') == 'X':
        x_by_thread[(e.get('pid'), e.get('tid'))] += 1
print('\n=== X events per thread (top 12) ===')
for k, c in x_by_thread.most_common(12):
    print('  pid=%s tid=%s %-14s %-22s %d' % (k[0], k[1], procs.get(k[0], '?'), threads.get(k, '?'), c))

# ---------- 扩展渲染进程主线程 ----------
EXT_PID = 32232
main_tids = [k[1] for k in x_by_thread if k[0] == EXT_PID]
main_tid = max(main_tids, key=lambda t: x_by_thread[(EXT_PID, t)])
print('\n=== Extension Renderer main thread: tid=%s ===' % main_tid)

# 按 name 聚合总耗时（仅 X 事件，主线程）
agg = collections.Counter()
cnt = collections.Counter()
longest = []
for e in ev:
    if e.get('ph') == 'X' and e.get('pid') == EXT_PID and e.get('tid') == main_tid:
        dur = e.get('dur') or 0
        nm = e.get('name')
        agg[nm] += dur
        cnt[nm] += 1
        if dur > 5000:
            longest.append((dur, nm, e.get('ts'), e.get('cat'), e.get('args')))

print('\n=== top 30 by total duration (us) ===')
for nm, total in agg.most_common(30):
    print('  %12.1f ms  x%-6d %s' % (total / 1000.0, cnt[nm], nm))

longest.sort(reverse=True)
print('\n=== 25 longest single events (us) ===')
for dur, nm, ts, cat, args in longest[:25]:
    extra = ''
    if args:
        d = args.get('data') if isinstance(args, dict) else None
        if isinstance(d, dict):
            keys = ['functionName', 'url', 'lineNumber', 'type', 'frame', 'beginData', 'endData', 'stackTrace']
            bits = []
            for k in keys:
                if k in d and not isinstance(d[k], (dict, list)):
                    bits.append('%s=%s' % (k, str(d[k])[:80]))
            if 'stackTrace' in d and isinstance(d['stackTrace'], list):
                bits.append('stack=' + ' < '.join(str(x.get('functionName')) for x in d['stackTrace'][:6]))
            extra = ' | ' + ' '.join(bits)
    print('  %9.1f ms  ts=%-14s %-38s %s%s' % (dur / 1000.0, ts, nm[:38], (cat or '')[:28], extra))

# ---------- CPU 采样热点 ----------
nodes = {}
samples_by_tid = collections.defaultdict(list)
deltas_by_tid = collections.defaultdict(list)
for e in ev:
    if e.get('name') in ('Profile', 'ProfileChunk') and e.get('ph') == 'P':
        d = e.get('args', {}).get('data', {}) or {}
        cp = d.get('cpuProfile', {}) or {}
        for n in (cp.get('nodes') or []):
            nodes[n.get('id')] = n
        tid = e.get('tid')
        samples_by_tid[tid].extend(cp.get('samples') or [])
        deltas_by_tid[tid].extend(cp.get('timeDeltas') or [])

print('\n=== cpu profile: nodes=%d, threads with samples=%s ===' % (len(nodes), dict((k, len(v)) for k, v in samples_by_tid.items())))

for tid in (main_tid, 50540, 49484):
    if tid not in samples_by_tid:
        continue
    self_time = collections.Counter()
    for sid, dt in zip(samples_by_tid[tid], deltas_by_tid[tid]):
        self_time[sid] += dt
    print('\n--- top self-time frames on tid=%s (%s) ---' % (tid, threads.get((EXT_PID, tid), '?')))
    for nid, t in self_time.most_common(25):
        n = nodes.get(nid) or {}
        cf = n.get('callFrame', {}) or {}
        fn = cf.get('functionName') or '(anonymous)'
        url = (cf.get('url') or '')
        if url.startswith('chrome-extension://'):
            url = url.split('/')[-1]
        print('  %10.1f ms  %-34s %s:%s' % (t / 1000.0, fn[:34], url[-52:], cf.get('lineNumber')))
