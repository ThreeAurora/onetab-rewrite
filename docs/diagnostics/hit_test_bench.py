# -*- coding: utf-8 -*-
"""合成 HitTest 基准：对比不同 DOM 形态的命中测试成本。

对照：
  complex  = 新版 OneTab 的条目形态（div.tab + picture/img + a + 按钮 + 2 个绝对定位图标 + 阴影圆角）
  noabs    = 去掉绝对定位图标
  noimg    = 去掉 favicon 的 picture/img
  simple   = 旧版 OneTab 的形态（裸 <a>，每条约目 1 个节点）
"""
from playwright.sync_api import sync_playwright

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 13px sans-serif; }
  .tab { border-radius: 10px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
         border: 1px solid #eee; height: 26px; position: relative; box-sizing: border-box; }
  .tabInner { display: flex; align-items: center; gap: 6px; height: 100%; }
</style></head><body><div id="root"></div>
<script>
function el(tag, cls, css) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) e.style.cssText = css;
  return e;
}
function build(kind, n) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    if (kind === 'simple') {
      const a = el('a', '', 'display:block;height:26px;line-height:26px');
      a.textContent = 'item ' + i;
      frag.appendChild(a);
      continue;
    }
    const d = el('div', 'tab');
    const inner = el('div', 'tabInner');
    if (kind !== 'noimg') {
      const pic = el('picture', 'lightDarkPicture');
      pic.appendChild(el('img', 'lightDarkInnerImg', 'width:16px;height:16px'));
      inner.appendChild(pic);
    }
    const a = el('a', 'tabLink tabLinkText');
    a.textContent = 'item ' + i;
    inner.appendChild(a);
    inner.appendChild(el('div', 'tabMoreButton', 'width:16px;height:15px'));
    if (kind !== 'noabs') {
      inner.appendChild(el('img', 'tabCrossImg', 'position:absolute;top:4px;right:4px;width:16px;height:16px'));
      inner.appendChild(el('img', 'tabTickImg', 'position:absolute;top:4px;right:24px;width:16px;height:16px'));
    }
    d.appendChild(inner);
    frag.appendChild(d);
  }
  return frag;
}
function probe(n) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) document.elementFromPoint(600, 200 + (i % 500));
  return (performance.now() - t0) / n;
}
window.__build = build;
window.__probe = probe;
</script></body></html>"""

KINDS = ['complex', 'noabs', 'noimg', 'simple']
SIZES = [1000, 3838, 8000]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        page.set_content(PAGE)
        for n in SIZES:
            print('--- %d items ---' % n)
            for kind in KINDS:
                page.evaluate(
                    "(a) => { const r = document.getElementById('root'); r.innerHTML='';"
                    " r.appendChild(window.__build(a[0], a[1])); }", [kind, n])
                page.wait_for_timeout(400)
                ms = page.evaluate("window.__probe(150)")
                nodes = page.evaluate("document.getElementsByTagName('*').length")
                print('  %-8s hitTest=%7.2f ms   domNodes=%d' % (kind, ms, nodes))
        browser.close()


if __name__ == '__main__':
    main()
