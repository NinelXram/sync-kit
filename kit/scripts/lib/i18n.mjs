import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cache = {};
const BOT = 'sync-bot';

function dict(lang) {
  if (!cache[lang]) {
    const file = fileURLToPath(new URL(`../i18n/${lang}.json`, import.meta.url));
    try { cache[lang] = JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new Error(`i18n: unknown language "${lang}"`); }
  }
  return cache[lang];
}

/** Translate `key` for `lang`, replacing `{name}` placeholders. `{bot}` defaults to "sync-bot". */
export function t(lang, key, vars = {}) {
  const d = dict(lang);
  if (!(key in d)) throw new Error(`i18n: missing key "${key}" for lang "${lang}"`);
  const all = { bot: BOT, ...vars };
  return d[key].replace(/\{(\w+)\}/g, (m, k) => (k in all ? String(all[k]) : m));
}
