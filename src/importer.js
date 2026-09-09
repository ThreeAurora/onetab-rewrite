// importer.js — 数据导入解析（从官方 OneTab 迁移 / 文本恢复）
// 支持三种输入：
//   1) 增强导出 JSON：{ tabs: [...], groups: [{id,label,...}] }   —— tools/export_onetab.js 的产物
//   2) HANDOFF §5.3 原版 JSON：纯 tab 数组 [{url,title,groupId,createDate}]
//   3) 纯文本：每行一个 URL（官方 OneTab「导出 URL 列表」的格式），支持 # 注释行
// 本模块只做解析，不写库；写入与去重由 list.js 完成。

// 输入 → { tabs: [{url,title,groupId,createDate}], groups: [{id,label,createDate}], mode }
// mode: 'json' | 'text'
export function parseImport(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('内容为空');

  // 剥掉 console 导出时可能带着的前缀（如 ONETAB_EXPORT ）
  let body = text.replace(/^\s*[A-Z_]*EXPORT[A-Z_]*\s*/, '');

  if (body[0] === '{' || body[0] === '[') {
    let obj;
    try {
      obj = JSON.parse(body);
    } catch (e) {
      throw new Error('JSON 解析失败：' + e.message);
    }
    return parseJson(obj);
  }
  return parseText(text);
}

function parseJson(obj) {
  const arr = Array.isArray(obj) ? obj : (Array.isArray(obj.tabs) ? obj.tabs : null);
  if (!arr) throw new Error('JSON 中没有 tabs 数组');
  const outTabs = [];
  const groupSeen = new Map(); // 官方组id -> 占位组
  let seq = 0;

  for (const t of arr) {
    if (!t || typeof t.url !== 'string' || !t.url) continue;
    const gid = typeof t.groupId === 'string' && t.groupId ? t.groupId : null;
    if (gid && !groupSeen.has(gid)) {
      seq += 1;
      const g = obj.groups && obj.groups.find(x => x && x.id === gid);
      groupSeen.set(gid, {
        id: gid,
        label: (g && g.label) || `导入分组 ${seq}`,
        createDate: (g && g.createDate) || Date.now()
      });
    }
    outTabs.push({
      url: t.url,
      title: typeof t.title === 'string' && t.title ? t.title : t.url,
      groupId: gid,
      createDate: Number(t.createDate) || Date.now()
    });
  }

  const groups = [...groupSeen.values()];
  // 增强导出里可能有空组（组还在但条目全在 trash 被过滤等）——补齐，保留结构
  if (!Array.isArray(obj) && Array.isArray(obj.groups)) {
    for (const g of obj.groups) {
      if (g && g.id && !groupSeen.has(g.id)) {
        groupSeen.set(g.id, {
          id: g.id,
          label: g.label || '导入分组',
          createDate: g.createDate || Date.now()
        });
        groups.push(groupSeen.get(g.id));
      }
    }
  }
  return { mode: 'json', tabs: outTabs, groups };
}

function parseText(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    // 官方文本导出偶发行首序号/前后修饰，尽量取其中的 URL
    const m = s.match(/https?:\/\/\S+/i);
    const url = m ? m[0] : (s && !/\s/.test(s) ? s : null);
    if (!url) continue;
    out.push({ url, title: '', groupId: null, createDate: Date.now() });
  }
  if (!out.length) throw new Error('没有解析到任何 URL');
  return { mode: 'text', tabs: out, groups: [] };
}
