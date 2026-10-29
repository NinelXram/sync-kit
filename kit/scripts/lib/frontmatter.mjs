import { normalizeText } from './io.mjs';

export function splitFrontmatter(text) {
  const t = normalizeText(text);
  const m = t.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { fm: null, body: t };
  return { fm: m[1], body: t.slice(m[0].length) };
}

// Minimal YAML: `key: value`, `key: [a, b]`, one nested level (`targets:` + indented `fe: pending`).
export function parseFrontmatter(text) {
  const { fm } = splitFrontmatter(text);
  if (fm === null) return null;
  const data = {};
  let parent = null;
  for (const raw of fm.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indented = /^\s+/.test(raw);
    const kv = raw.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = parseScalar(rawValue);
    if (indented && parent) {
      data[parent][key] = value;
    } else if (rawValue === '') {
      data[key] = {};
      parent = key;
    } else {
      data[key] = value;
      parent = null;
    }
  }
  return data;
}

export function parseScalar(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  }
  return unquote(v);
}

export function unquote(v) {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
