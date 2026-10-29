import { assertEnv, postJson } from './http.mjs';

export const name = 'gchat';
export const flavor = 'gchat';
export const limit = 4096;
export const minIntervalMs = 1100;
export const requiredEnv = ['GCHAT_WEBHOOK_URL'];

/** POST `{ text }` to the incoming webhook; `opts.threadKey` groups messages about one note into a thread. */
export async function send(text, env = process.env, opts = {}) {
  assertEnv(name, requiredEnv, env);
  let url = env.GCHAT_WEBHOOK_URL;
  if (opts.threadKey) {
    let u;
    try { u = new URL(url); } catch { throw new Error(`${name}: GCHAT_WEBHOOK_URL is not a valid URL`); }
    u.searchParams.set('threadKey', opts.threadKey);
    u.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    url = u.toString();
  }
  await postJson(name, url, { text }, { headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
}
