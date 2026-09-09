# -*- coding: utf-8 -*-
"""扫描 OneTab 的 IndexedDB(LevelDB) 存储规模，只统计数量，不输出 URL 明文。"""
import os
import re
import collections

IDB = os.path.join(
    os.environ['LOCALAPPDATA'],
    r'Microsoft\Edge\User Data\Default\IndexedDB',
    'chrome-extension_hoimpamkkoehapgenciaoajfkfkpgfop_0.indexeddb.leveldb',
)

URL_RE = re.compile(rb'https?://[^\x00-\x20"\'\\]{4,2048}')
KEYS = [b'"url"', b'"title"', b'"timestamp"', b'"urls"', b'"id"',
        b'"groupId"', b'"label"', b'"starred"', b'"index"']


def main():
    print('scan dir:', IDB)
    if not os.path.isdir(IDB):
        print('NOT FOUND')
        return
    key_stats = collections.Counter()
    all_urls = []
    for name in sorted(os.listdir(IDB)):
        path = os.path.join(IDB, name)
        if not os.path.isfile(path):
            continue
        with open(path, 'rb') as fh:
            data = fh.read()
        urls = URL_RE.findall(data)
        printable = sum(1 for b in data if 32 <= b < 127)
        print('--- %s: %d bytes, ascii-ratio=%.2f, raw-http-matches=%d'
              % (name, len(data), printable / max(1, len(data)), len(urls)))
        for key in KEYS:
            key_stats[key.decode()] = key_stats[key.decode()] + data.count(key)
        all_urls.extend(urls)

    print('=== JSON key occurrences ===')
    for key, count in key_stats.most_common():
        print('  %-12s %d' % (key, count))

    uniq = set(all_urls)
    print('=== unique url strings: %d (of %d raw matches) ===' % (len(uniq), len(all_urls)))

    hosts = collections.Counter()
    for url in uniq:
        try:
            host = url.split(b'//', 1)[1].split(b'/', 1)[0].decode('utf-8', 'ignore').lower()
        except Exception:
            continue
        hosts[host] += 1
    print('=== unique hosts: %d ===' % len(hosts))
    for host, count in hosts.most_common(20):
        print('  %5d  %s' % (count, host))


if __name__ == '__main__':
    main()
