import { assertEnv, postJson } from './http.mjs';

export const name = 'telegram';
export const flavor = 'html';
export const limit = 4096;
export const minIntervalMs = 1100;
export const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

/** Bot API error bodies are JSON with a `description` (e.g. "Bad Request: chat not found"); nothing else is shown. */
function describeError(bodyText, token) {
  const d = JSON.parse(bodyText)?.description;
  if (typeof d !== 'string' || !d.trim()) return '';
  return d.split(token).join('***').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Send one HTML part via the Bot API. `opts.threadKey` is ignored (no threads in a plain chat). */
export async function send(text, env = process.env, opts = {}) {
  assertEnv(name, requiredEnv, env);
  await postJson(name, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, { describe: (body) => describeError(body, env.TELEGRAM_BOT_TOKEN) });
}
