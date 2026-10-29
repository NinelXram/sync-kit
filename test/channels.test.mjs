import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as gchat from '../kit/scripts/lib/channels/gchat.mjs';
import * as telegram from '../kit/scripts/lib/channels/telegram.mjs';
import { deliver } from '../kit/scripts/lib/channels/index.mjs';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const WEBHOOK = 'https://chat.googleapis.com/v1/spaces/AAA/messages?key=SECRETKEY&token=SECRETTOKEN';

function fakeFetch(res = { ok: true, status: 200 }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return { ok: res.ok, status: res.status, text: async () => res.body ?? '' };
  };
  return calls;
}

test('channel constants', () => {
  assert.equal(telegram.flavor, 'html');
  assert.equal(gchat.flavor, 'gchat');
  assert.equal(telegram.limit, 4096);
  assert.equal(gchat.limit, 4096);
  assert.equal(telegram.minIntervalMs, 1100);
  assert.equal(gchat.minIntervalMs, 1100);
  assert.deepEqual(telegram.requiredEnv, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']);
  assert.deepEqual(gchat.requiredEnv, ['GCHAT_WEBHOOK_URL']);
});

test('gchat posts {text} to webhook with threadKey and messageReplyOption added, key/token preserved', async () => {
  const calls = fakeFetch();
  await gchat.send('hello', { GCHAT_WEBHOOK_URL: WEBHOOK }, { threadKey: '2026-01-01-fe-a' });
  assert.equal(calls.length, 1);
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('key'), 'SECRETKEY');
  assert.equal(u.searchParams.get('token'), 'SECRETTOKEN');
  assert.equal(u.searchParams.get('threadKey'), '2026-01-01-fe-a');
  assert.equal(u.searchParams.get('messageReplyOption'), 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json; charset=UTF-8');
  assert.deepEqual(calls[0].body, { text: 'hello' });
});

test('gchat without threadKey leaves URL unchanged', async () => {
  const calls = fakeFetch();
  await gchat.send('hello', { GCHAT_WEBHOOK_URL: WEBHOOK });
  assert.equal(calls[0].url, WEBHOOK);
});

test('telegram posts parse_mode HTML', async () => {
  const calls = fakeFetch();
  await telegram.send('<b>hi</b>', { TELEGRAM_BOT_TOKEN: '123:ABC', TELEGRAM_CHAT_ID: '-100' }, { threadKey: 'ignored' });
  assert.equal(calls[0].url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  assert.deepEqual(calls[0].body, { chat_id: '-100', text: '<b>hi</b>', parse_mode: 'HTML', disable_web_page_preview: true });
});

test('send throws when env missing', async () => {
  const calls = fakeFetch();
  await assert.rejects(gchat.send('x', {}), /gchat: missing env GCHAT_WEBHOOK_URL/);
  await assert.rejects(telegram.send('x', { TELEGRAM_BOT_TOKEN: 't' }), /telegram: missing env TELEGRAM_CHAT_ID/);
  assert.equal(calls.length, 0);
});

test('network error message names channel and hides webhook url', async () => {
  globalThis.fetch = async (url) => { throw new TypeError(`fetch failed ${url}`, { cause: { code: 'ENOTFOUND' } }); };
  const err = await gchat.send('x', { GCHAT_WEBHOOK_URL: WEBHOOK }, { threadKey: 'k' }).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.match(err.message, /gchat/);
  assert.match(err.message, /ENOTFOUND/);
  assert.match(err.message, /see the sync-kit docs \(docs\/config\.md\)/);
  assert.ok(!err.message.includes(WEBHOOK));
  assert.ok(!err.message.includes('SECRET'));
  assert.ok(!String(err.stack).includes('SECRET'));
  const terr = await telegram.send('x', { TELEGRAM_BOT_TOKEN: '123:SECRETTOK', TELEGRAM_CHAT_ID: '1' }).catch((e) => e);
  assert.match(terr.message, /telegram: network error \(ENOTFOUND\)/);
  assert.ok(!terr.message.includes('SECRETTOK'));
});

test('invalid webhook url does not leak it', async () => {
  fakeFetch();
  const err = await gchat.send('x', { GCHAT_WEBHOOK_URL: 'not a url SECRET' }, { threadKey: 'k' }).catch((e) => e);
  assert.match(err.message, /gchat/);
  assert.ok(!err.message.includes('SECRET'));
});

test('HTTP 400 → throws "<channel>: HTTP 400"', async () => {
  fakeFetch({ ok: false, status: 400 });
  await assert.rejects(gchat.send('x', { GCHAT_WEBHOOK_URL: WEBHOOK }), (e) => e.message === 'gchat: HTTP 400');
  await assert.rejects(telegram.send('x', { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' }), (e) => e.message === 'telegram: HTTP 400');
});

test('telegram HTTP error appends the API description only; other bodies are never printed', async () => {
  const env = { TELEGRAM_BOT_TOKEN: '123:SECRETTOK', TELEGRAM_CHAT_ID: '1' };
  fakeFetch({ ok: false, status: 400, body: '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}' });
  await assert.rejects(telegram.send('x', env), (e) => e.message === 'telegram: HTTP 400 — Bad Request: chat not found');
  fakeFetch({ ok: false, status: 502, body: '<html>bad gateway https://api.telegram.org/bot123:SECRETTOK</html>' });
  await assert.rejects(telegram.send('x', env), (e) => e.message === 'telegram: HTTP 502');
  fakeFetch({ ok: false, status: 401, body: '{"ok":false,"description":"Unauthorized 123:SECRETTOK"}' });
  await assert.rejects(telegram.send('x', env), (e) => !e.message.includes('SECRETTOK') && e.message.startsWith('telegram: HTTP 401 — Unauthorized'));
  fakeFetch({ ok: false, status: 400, body: '{"description":"leak SECRETKEY"}' });
  await assert.rejects(gchat.send('x', { GCHAT_WEBHOOK_URL: WEBHOOK }), (e) => e.message === 'gchat: HTTP 400');
});

const cfg = (channel) => ({ lang: 'en', notify: { channel } });
const msg = (title, threadKey) => ({ icon: '', title, lines: ['x'.repeat(3000), 'y'.repeat(3000)], mentions: [], threadKey });
const quiet = () => { const out = []; return { out, log: (s) => out.push(s), error: (s) => out.push(s) }; };

test('deliver sends every part, waits minIntervalMs between sends, parts share threadKey', async () => {
  const calls = fakeFetch();
  const sleeps = [];
  const io = quiet();
  const code = await deliver([msg('A', 'k1'), msg('B', 'k2')], cfg('gchat'), {
    env: { GCHAT_WEBHOOK_URL: WEBHOOK }, sleep: async (ms) => { sleeps.push(ms); }, ...io,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 4);
  assert.deepEqual(sleeps, [1100, 1100, 1100]);
  assert.deepEqual(calls.map((c) => new URL(c.url).searchParams.get('threadKey')), ['k1', 'k1', 'k2', 'k2']);
  for (const c of calls) assert.ok(c.body.text.length <= 4096);
});

test('deliver: send error → prints error without secret, exit 1', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };
  const io = quiet();
  const code = await deliver([msg('A')], cfg('gchat'), { env: { GCHAT_WEBHOOK_URL: WEBHOOK }, sleep: async () => {}, ...io });
  assert.equal(code, 1);
  assert.match(io.out.join('\n'), /gchat: network error \(ECONNREFUSED\)/);
  assert.ok(!io.out.join('\n').includes('SECRET'));
});

test('deliver: none / dry-run / missing env → plain output, no fetch', async () => {
  const calls = fakeFetch();
  for (const [c, opts] of [[cfg('none'), {}], [cfg('telegram'), { dryRun: true, env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' } }], [cfg('telegram'), { env: {} }]]) {
    const io = quiet();
    const code = await deliver([{ icon: '', title: 'T <x>', lines: ['l'], mentions: [] }], c, { sleep: async () => {}, ...opts, ...io });
    assert.equal(code, 0);
    assert.ok(io.out.join('\n').includes('T <x>\nl'));
  }
  assert.equal(calls.length, 0);
});
