import { describe, it, expect, vi } from 'vitest';
import { createCampaignSource } from './source.mjs';

const url = 'https://cms.example.com/wp-json/ai-slot/v1/campaign/1';
const facts = () => ({ id: 'campaign-1', title: '介绍A', price: '¥99', link: 'https://example.com/', expiresAt: 20_000 });
const reader = (payload, overrides = {}) => createCampaignSource({ url, fetchImpl: async () => Response.json(payload), now: () => 1000, ...overrides });

describe('CMS 固定事实读取', () => {
  it('同快照同版本，所有事实变化产生新版本，且传超时 signal', async () => {
    let payload = facts();
    const fetchImpl = vi.fn(async () => Response.json(payload));
    const read = createCampaignSource({ url, fetchImpl, now: () => 1000 });
    const first = await read();
    expect(await read()).toEqual(first);
    expect(first).toEqual({ id: 'campaign-1', version: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: 20_000,
      data: { title: '介绍A', price: '¥99', link: 'https://example.com/' } });
    for (const patch of [{ title: '介绍B' }, { price: '¥100' }, { link: 'https://example.com/new' }, { expiresAt: 21_000 }, { id: 'campaign-2' }]) {
      payload = { ...facts(), ...patch };
      expect((await read()).version).not.toBe(first.version);
    }
    expect(fetchImpl.mock.calls[0][0]).toBe(url);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('仅接受固定 HTTPS 或明确本机开发 HTTP URL', () => {
    for (const bad of ['http://cms.example.com/x', 'http://192.168.1.1/x', 'http://[::1]/x',
      'https://user:pass@cms.example.com/x', 'https://cms.example.com/x#fragment', 'https://cms.example.com/x#',
      'file:///tmp/facts.json', 'https://cms.example.com/']) {
      expect(() => createCampaignSource({ url: bad })).toThrow();
    }
    expect(() => createCampaignSource({ url: 'http://127.0.0.1:8080/wp-json/ai-slot/v1/campaign/1' })).not.toThrow();
    expect(() => createCampaignSource({ url: 'http://localhost:8080/wp-json/ai-slot/v1/campaign/1' })).not.toThrow();
  });

  it('拒绝错误状态、重定向和非 JSON', async () => {
    for (const response of [new Response('secret', { status: 500 }),
      new Response(null, { status: 302, headers: { location: 'https://other.example' } }),
      new Response('<html>secret</html>', { headers: { 'content-type': 'text/html' } })]) {
      await expect(createCampaignSource({ url, fetchImpl: async () => response })()).rejects.toThrow();
    }
  });

  it('流式计算 64KiB 限额，绝不读取巨大响应或泄露正文', async () => {
    const response = new Response('secret'.repeat(12_000), { headers: { 'content-type': 'application/json' } });
    await expect(createCampaignSource({ url, fetchImpl: async () => response })()).rejects.toThrow(/too_large|过大/);
  });

  it('超时覆盖响应正文读取', async () => {
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    await expect(createCampaignSource({ url, fetchImpl, timeoutMs: 10 })()).rejects.toThrow();
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } });
    const readBody = createCampaignSource({ url, timeoutMs: 10,
      fetchImpl: async () => new Response(body, { headers: { 'content-type': 'application/json' } }) });
    await expect(readBody()).rejects.toThrow('cms_timeout');
  });

  it('链接可达 2048 字符，超过 CMS 合同上限拒绝', async () => {
    const prefix = 'https://example.com/';
    const accepted = prefix + 'a'.repeat(2048 - prefix.length);
    expect((await reader({ ...facts(), link: accepted })()).data.link).toBe(accepted);
    await expect(reader({ ...facts(), link: accepted + 'a' })()).rejects.toThrow('cms_facts_invalid');
  });

  it('拒绝坏字段和过期；HTML 字符串只作为文本', async () => {
    for (const patch of [{ id: '' }, { title: 'x'.repeat(201) }, { price: 'x'.repeat(101) },
      { link: 'x'.repeat(2049) }, { link: 'javascript:alert(1)' }, { link: 'https://evil.example/' },
      { expiresAt: 1000 }, { expiresAt: null }, { title: 1 }]) {
      await expect(reader({ ...facts(), ...patch })()).rejects.toThrow();
    }
    const read = reader({ ...facts(), title: '<script>alert(1)</script>', hidden: 'secret' });
    expect((await read()).data).toEqual({ title: '<script>alert(1)</script>', price: '¥99', link: 'https://example.com/' });
  });
});
