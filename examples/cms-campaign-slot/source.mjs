import { hash } from '@ai-slot/operations';

const MAX_BYTES = 65_536;
const DEFAULT_ORIGINS = ['https://example.com'];

/** 来源地址只由服务端配置，禁止重定向到另一站。 */
export function validateCampaignUrl(value) {
  if (typeof value !== 'string') throw new Error('cms_url_invalid');
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error('cms_url_invalid'); }
  const localHttp = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password || value.includes('#') || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('cms_url_invalid');
  }
  return parsed;
}

async function readLimited(response) {
  if (!response.ok || response.redirected) throw new Error('cms_response_invalid');
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('cms_response_invalid');
  if (!response.body) throw new Error('cms_response_invalid');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error('cms_body_too_large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new Error('cms_response_invalid'); }
}

function validatePayload(value, now, allowedOrigins) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cms_facts_invalid');
  const { id, title, price, link, expiresAt } = value;
  if (typeof id !== 'string' || !/^campaign-[1-9]\d*$/.test(id) ||
      typeof title !== 'string' || !title.trim() || title.length > 200 ||
      typeof price !== 'string' || !price.trim() || price.length > 100 ||
      typeof link !== 'string' || !link || link.length > 2048 ||
      typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error('cms_facts_invalid');
  }
  let target;
  try { target = new URL(link); }
  catch { throw new Error('cms_facts_invalid'); }
  if (target.protocol !== 'https:' || target.username || target.password || !allowedOrigins.includes(target.origin)) {
    throw new Error('cms_facts_invalid');
  }
  const data = { title, price, link };
  return { id, version: hash({ id, data, expiresAt }), expiresAt, data };
}

/** 一次读取即一次事实快照；计时器覆盖网络请求及完整响应流。 */
export function createCampaignSource({ url, fetchImpl = fetch, now = Date.now, allowedOrigins = DEFAULT_ORIGINS, timeoutMs = 8000 }) {
  validateCampaignUrl(url);
  if (!Array.isArray(allowedOrigins) || allowedOrigins.some(origin => typeof origin !== 'string') ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw new Error('cms_config_invalid');
  return async () => {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('cms_timeout')); }, timeoutMs);
    });
    try {
      return await Promise.race([(async () => {
        const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal, headers: { accept: 'application/json' } });
        return validatePayload(await readLimited(response), now(), allowedOrigins);
      })(), deadline]);
    } finally { clearTimeout(timer); }
  };
}
