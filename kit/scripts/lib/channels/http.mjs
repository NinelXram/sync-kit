// Shared transport helpers. Error messages must never contain the webhook URL or token.

export function assertEnv(channel, requiredEnv, env) {
  const missing = requiredEnv.filter((k) => !env[k]);
  if (missing.length) throw new Error(`${channel}: missing env ${missing.join(', ')}`);
}

/**
 * POST JSON; throws `<channel>: HTTP <status>` or a network error naming the channel (never the URL).
 * `opts.describe(bodyText)` may return a short, safe explanation to append to the HTTP error; the raw
 * response body is never printed otherwise.
 */
export async function postJson(channel, url, body, { headers = { 'Content-Type': 'application/json' }, describe } = {}) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (err) {
    // err.message may embed the URL (with key/token) — report only the code or error class.
    const code = err?.cause?.code ?? err?.name ?? 'unknown';
    throw new Error(`${channel}: network error (${code}) — can the runner reach the internet? If it needs a proxy, see the sync-kit docs (docs/config.md)`);
  }
  if (!res.ok) {
    let extra = '';
    if (describe) {
      try { extra = describe(await res.text()) || ''; } catch { extra = ''; }
    }
    throw new Error(`${channel}: HTTP ${res.status}${extra ? ` — ${extra}` : ''}`);
  }
}
