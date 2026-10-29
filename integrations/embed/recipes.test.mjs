// 全平台 recipe 通用契约：每份 AGENT-INTEGRATION.md 必须符合六段式规范，
// 且 patch 段给出可粘贴的嵌入片段。
import { readdir, readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

const integrationsRoot = new URL('../', import.meta.url);
const SECTIONS = ['## detect', '## files', '## patch', '## verify', '## rollback', '## constraints'];

describe('全平台 recipe 六段式契约', async () => {
  const entries = await readdir(integrationsRoot, { withFileTypes: true });
  const platforms = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name === 'embed' || e.name === 'wizard') {
      continue;
    }
    try {
      const content = await readFile(new URL(`${e.name}/AGENT-INTEGRATION.md`, integrationsRoot), 'utf8');
      platforms.push([e.name, content]);
    } catch {
      // 目录无 recipe 则跳过
    }
  }

  it('recipe 数量覆盖既定平台集合', () => {
    const names = platforms.map(([n]) => n).sort();
    for (const expected of [
      'dedecms', 'discuz', 'empirecms', 'halo', 'metinfo', 'pageadmin', 'pbootcms',
      'shopify', 'squarespace', 'typecho', 'webflow', 'wix', 'wordpress', 'xunruicms', 'zblogphp',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it.each(platforms.map(([n, c]) => [n, c]))('%s：六段齐全且含嵌入片段', (name, content) => {
    for (const s of SECTIONS) {
      expect(content, `${name} 缺少 ${s}`).toContain(s);
    }
    expect(content).toContain('type="module"');
    // verify 段必须包含静默回退与伪造组件对抗检查
    const verify = content.slice(content.indexOf('## verify'), content.indexOf('## rollback'));
    expect(verify).toContain('兜底');
    expect(verify).toMatch(/伪造组件/);
  });
});
