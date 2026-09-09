# -*- coding: utf-8 -*-
"""第一步：探查 Chrome trace 结构。"""
import gzip
import json
import collections

PATH = r"E:\AAAAA\Trace-20260909T084158.json.gz"

with gzip.open(PATH, 'rt', encoding='utf-8') as fh:
    data = json.load(fh)

print('type:', type(data).__name__)
if isinstance(data, dict):
    for k, v in data.items():
        if k == 'traceEvents':
            print('  %s: %d events' % (k, len(v)))
        elif isinstance(v, (str, int, float)):
            print('  %s: %r' % (k, str(v)[:120]))
        else:
            print('  %s: %s len=%s' % (k, type(v).__name__, len(v) if hasattr(v, '__len__') else '?'))

ev = data['traceEvents'] if isinstance(data, dict) else data

names = collections.Counter(e.get('name') for e in ev)
print('\n=== top 45 event names ===')
for name, count in names.most_common(45):
    print('%9d  %s' % (count, name))

print('\n=== process/thread with most events ===')
pt = collections.Counter((e.get('pid'), e.get('tid')) for e in ev)
for (pid, tid), count in pt.most_common(12):
    print('pid=%s tid=%s  events=%d' % (pid, tid, count))

print('\n=== phases ===')
print(collections.Counter(e.get('ph') for e in ev).most_common())

# 找进程名
print('\n=== process names ===')
for e in ev:
    if e.get('ph') == 'M' and e.get('name') == 'process_name':
        print('  pid=%s  %s' % (e.get('pid'), e.get('args', {}).get('name')))
