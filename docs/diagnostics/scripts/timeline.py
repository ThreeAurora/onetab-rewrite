# -*- coding: utf-8 -*-
"""第六步：主线程时间轴分布。"""
import gzip
import json
import collections

PATH = r"E:\AAAAA\Trace-20260909T084158.json.gz"
with gzip.open(PATH, 'rt', encoding='utf-8') as fh:
    data = json.load(fh)
ev = data['traceEvents']

xs = [e for e in ev if e.get('ph') == 'X' and e.get('tid') == 50540 and e.get('dur')]
t0 = min(e['ts'] for e in xs)
t1 = max(e['ts'] + e['dur'] for e in xs)
span = (t1 - t0) / 1e6
print('main-thread trace span: %.1f s' % span)

# 顶层 RunTask 忙碌占比
runs = [e for e in xs if e['name'] == 'RunTask']
busy = sum(e['dur'] for e in runs) / 1e6
print('RunTask busy: %.2f s  (%.1f%% of span)' % (busy, busy / span * 100))

# 按 1 秒分桶
buckets = collections.defaultdict(lambda: collections.Counter())
for e in xs:
    sec = int((e['ts'] - t0) / 1e6)
    if e['name'] in ('RunTask', 'HitTest', 'PrePaint', 'Paint', 'Layout', 'Commit', 'UpdateLayoutTree'):
        buckets[sec][e['name']] += e['dur']

print('\n=== per-second main-thread time (ms) ===')
print('%4s %9s %9s %9s %9s %9s %9s' % ('sec', 'RunTask', 'HitTest', 'PrePaint', 'Paint', 'Layout', 'Commit'))
for sec in sorted(buckets):
    b = buckets[sec]
    print('%4d %9.1f %9.1f %9.1f %9.1f %9.1f %9.1f'
          % (sec, b['RunTask'] / 1000.0, b['HitTest'] / 1000.0, b['PrePaint'] / 1000.0,
             b['Paint'] / 1000.0, b['Layout'] / 1000.0, b['Commit'] / 1000.0))

# HitTest 单次耗时分布
hits = sorted(e['dur'] / 1000.0 for e in xs if e['name'] == 'HitTest')
if hits:
    def q(p):
        return hits[min(len(hits) - 1, int(len(hits) * p))]
    print('\nHitTest n=%d  p50=%.2fms p90=%.2fms p99=%.2fms max=%.2fms'
          % (len(hits), q(.5), q(.9), q(.99), hits[-1]))
    over4 = sum(1 for h in hits if h > 4)
    print('HitTest > 4ms: %d / %d (%.0f%%)' % (over4, len(hits), over4 * 100.0 / len(hits)))

# 主线程最忙的 3 秒
print('\n=== busiest seconds by RunTask ===')
top = sorted(buckets.items(), key=lambda kv: -kv[1]['RunTask'])[:5]
for sec, b in top:
    print('  sec=%d  RunTask=%.1fms  HitTest=%.1fms  Paint=%.1fms  PrePaint=%.1fms'
          % (sec, b['RunTask'] / 1000.0, b['HitTest'] / 1000.0, b['Paint'] / 1000.0, b['PrePaint'] / 1000.0))
