// Shopify Theme App Extension 静态契约测试：不依赖 Shopify CLI，
// 校验扩展结构、schema JSON 合法性与 Liquid 侧安全纪律。
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

const root = new URL('../shopify/extension/', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

/** 提取 {% schema %} 块并解析为 JSON。 */
function parseSchema(liquid) {
  const match = liquid.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
  expect(match, '缺少 schema 块').toBeTruthy();
  return JSON.parse(match[1]);
}

describe('Shopify 扩展静态契约', () => {
  it('扩展定义为 theme_app_extension', async () => {
    const toml = await read('extensions/ai-slot/shopify.extension.toml');
    expect(toml).toMatch(/type\s*=\s*"theme_app_extension"/);
    expect(toml).toMatch(/handle\s*=\s*"ai-slot"/);
  });

  it('应用配置已关联真实应用且声明零权限、非内嵌', async () => {
    const toml = await read('shopify.app.ai-slot.toml');
    expect(toml).toMatch(/client_id = "[0-9a-f]{32}"/);
    expect(toml).toMatch(/embedded = false/);
    expect(toml).toMatch(/scopes = ""/);
    expect(toml).not.toMatch(/client_secret/i);
  });

  it('App Embed Block 向 head 注入运行时模块', async () => {
    const liquid = await read('extensions/ai-slot/blocks/ai-slot-embed.liquid');
    const schema = parseSchema(liquid);
    expect(schema.target).toBe('head');
    expect(liquid).toMatch(/<script type="module" src="\{\{ 'ai-slot-embed\.js' \| asset_url \}\}"><\/script>/);
  });

  it('App Block 输出 ai-slot 元素且 schema 合法', async () => {
    const liquid = await read('extensions/ai-slot/blocks/ai-slot.liquid');
    const schema = parseSchema(liquid);
    expect(schema.target).toBe('section');
    const ids = schema.settings.map(s => s.id);
    for (const id of ['name', 'src', 'fallback', 'fresh_only', 'refresh_interval']) {
      expect(ids).toContain(id);
    }
    expect(liquid).toMatch(/<ai-slot/);
  });

  it('Liquid 侧安全纪律：端点强制 https 前缀，设置值 escape 输出', async () => {
    const liquid = await read('extensions/ai-slot/blocks/ai-slot.liquid');
    expect(liquid).toMatch(/slot_src contains 'https:\/\/'/);
    expect(liquid).toMatch(/slot_name \| escape/);
    expect(liquid).toMatch(/slot_src \| escape/);
    // 禁止把设置值交给 javascript 协议或 innerHTML 类出口
    expect(liquid).not.toMatch(/javascript:/i);
  });

  it('range 设置不超过 Shopify 的 101 档上限', async () => {
    const liquid = await read('extensions/ai-slot/blocks/ai-slot.liquid');
    const schema = parseSchema(liquid);
    for (const s of schema.settings.filter(s => s.type === 'range')) {
      const steps = (s.max - s.min) / s.step + 1;
      expect(steps, `${s.id} 档位 ${steps} 超上限`).toBeLessThanOrEqual(101);
    }
  });

  it('locales 默认语言文件存在且为合法 JSON', async () => {
    const locale = JSON.parse(await read('extensions/ai-slot/locales/en.default.json'));
    expect(typeof locale).toBe('object');
  });

  it('运行时资产已同步且与 embed 构建产物一致', async () => {
    const extAsset = await read('extensions/ai-slot/assets/ai-slot-embed.js');
    const embedAsset = await readFile(new URL('./assets/ai-slot-embed.js', import.meta.url), 'utf8');
    expect(extAsset).toBe(embedAsset);
    expect(extAsset).toMatch(/customElements\.define\("ai-slot"/);
  });
});
