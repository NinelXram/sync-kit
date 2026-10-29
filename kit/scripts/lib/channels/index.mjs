import { annotate } from '../io.mjs';
import { t } from '../i18n.mjs';
import { render, renderParts } from '../message.mjs';
import * as telegram from './telegram.mjs';
import * as gchat from './gchat.mjs';

export const CHANNELS = { telegram, gchat };

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send messages over config.notify.channel, or print them as plain text when the channel is 'none',
 * `dryRun` is set, or required env is missing (plus a warning naming the env). Returns an exit code.
 * Parts of one message share its threadKey; consecutive sends are spaced by the channel's minIntervalMs.
 */
export async function deliver(messages, config, { dryRun = false, env = process.env, sleep = realSleep, log = console.log, error = console.error } = {}) {
  const name = config.notify.channel;
  const ch = Object.hasOwn(CHANNELS, name) ? CHANNELS[name] : null;
  const missing = ch ? ch.requiredEnv.filter((k) => !env[k]) : [];
  if (!ch || dryRun || missing.length) {
    if (ch && !dryRun) log(annotate('warning', null, t(config.lang, 'notify.missingEnv', { channel: name, env: missing.join(', ') }), env));
    log(messages.map((m) => render(m, 'plain')).join('\n\n'));
    return 0;
  }
  let sent = 0;
  try {
    for (const m of messages) {
      for (const part of renderParts(m, ch.flavor, ch.limit)) {
        if (sent) await sleep(ch.minIntervalMs);
        await ch.send(part, env, { threadKey: m.threadKey });
        sent++;
      }
    }
  } catch (e) {
    error(`error: ${e.message}`);
    return 1;
  }
  log(t(config.lang, 'notify.sent', { n: sent, channel: name }));
  return 0;
}
