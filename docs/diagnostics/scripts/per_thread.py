# -*- coding: utf-8 -*-
"""第五步：按采样线程分组的热点。"""
import gzip
import json
import collections

PATH = r"E:\AAAAA\Trace-20260909T084158.json.gz"
with gzip.open(PATH, 'rt', encoding='utf-8') as fh:
    data = json.load(fh)
ev = data['traceEvents']

nodes_by_tid = collections.defaultdict(dict)
samples_by_tid = collections.defaultdict(list)
deltas_by_tid = collections.defaultdict(list)
chunk_count = collections.Counter()

for e in ev:
    if e.get('name') in ('Profile', 'ProfileChunk'):
        tid = e.get('tid')
        chunk_count[tid] += 1
        d = e.get('args', {}).get('data', {}) or {}
        cp = d.get('cpuProfile', {}) or {}
        for n in (cp.get('nodes') or []):
            if n.get('id') is not None:
                nodes_by_tid[tid][n['id']] = n
        samples_by_tid[tid].extend(cp.get('samples') or [])
        deltas_by_tid[tid].extend(d.get('timeDeltas') or [])

print('=== profile chunks per tid ===', dict(chunk_count))

threads = {}
for e in ev:
    if e.get('ph') == 'M' and e.get('name') == 'thread_name':
        threads[e.get('tid')] = e.get('args', {}).get('name')

for tid in sorted(samples_by_tid, key=lambda t: -len(samples_by_tid[t])):
    nodes = nodes_by_tid[tid]
    samples = samples_by_tid[tid]
    deltas = deltas_by_tid[tid]
    if not samples:
        continue
    self_time = collections.Counter()
    for sid, dt in zip(samples, deltas):
        self_time[sid] += dt
    total = sum(self_time.values())
    print('\n########## tid=%s (%s)  nodes=%d samples=%d  total=%.1f s ##########'
          % (tid, threads.get(tid, '?'), len(nodes), len(samples), total / 1e6))
    for nid, t in self_time.most_common(18):
        n = nodes.get(nid) or {}
        cf = n.get('callFrame', {}) or {}
        fn = cf.get('functionName') or '(anonymous)'
        url = cf.get('url') or ''
        if url.startswith('chrome-extension://'):
            url = url.rsplit('/', 1)[-1]
        print('  %9.1f ms  %-32s %s:%s' % (t / 1000.0, fn[:32], url[-42:], cf.get('lineNumber')))

    # 只对最热的 3 个非 idle 节点打印调用路径
    print('  --- call paths ---')
    shown = 0
    for nid, t in self_time.most_common(40):
        n = nodes.get(nid) or {}
        cf = n.get('callFrame', {}) or {}
        fn = cf.get('functionName') or '(anonymous)'
        if fn in ('(idle)', '(root)', '(program)', '(garbage collector)'):
            continue
        path = []
        cur = nid
        seen = set()
        guard = 0
        while cur and cur in nodes and cur not in seen and guard < 10:
            seen.add(cur)
            c2 = (nodes.get(cur) or {}).get('callFrame', {}) or {}
            u = c2.get('url') or ''
            if u.startswith('chrome-extension://'):
                u = u.rsplit('/', 1)[-1]
            path.append('%s@%s:%s' % (c2.get('functionName') or '(anon)', u[-26:], c2.get('lineNumber')))
            cur = (nodes.get(cur) or {}).get('parent')
            guard += 1
        print('  [%8.1f ms] %s' % (t / 1000.0, '  <-  '.join(path)))
        shown += 1
        if shown >= 5:
            break
