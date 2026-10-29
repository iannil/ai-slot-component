// WordPress 通用插件的静态契约测试：不依赖 PHP 运行时，
// 校验插件文件结构、安全转义纪律与三种集成形态的存在性。
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

const root = new URL('../wordpress/plugin/ai-slot/', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

describe('WordPress 插件静态契约', () => {
  it('主文件具备插件头与三种集成形态', async () => {
    const php = await read('ai-slot.php');
    expect(php).toMatch(/Plugin Name:\s+ai-slot/);
    expect(php).toMatch(/add_shortcode\('ai_slot'/);          // 简码
    expect(php).toMatch(/register_block_type\(__DIR__ \. '\/block'/); // Gutenberg 区块
    expect(php).toMatch(/elementor\/widgets\/register/);      // Elementor 小组件
    expect(php).toMatch(/add_options_page/);                  // 设置页
  });

  it('所有输出经过转义，无直接回显未过滤输入', async () => {
    const php = await read('ai-slot.php');
    // 渲染出口必须使用转义函数
    expect(php).toMatch(/esc_attr\(/);
    expect(php).toMatch(/esc_url\(/);
    expect(php).toMatch(/wp_kses_post\(/);
    // 端点校验：仅 HTTPS + 本机联调例外
    expect(php).toMatch(/PHP_URL_SCHEME\);\s*\n\s*if \(\$scheme === 'https'\)/);
    // 禁止危险的直接输出
    expect(php).not.toMatch(/echo \$_(GET|POST|REQUEST)/);
    expect(php).not.toMatch(/eval\(/);
  });

  it('脚本以 type=module 方式加载构建产物', async () => {
    const php = await read('ai-slot.php');
    expect(php).toMatch(/assets\/ai-slot-embed\.js/);
    expect(php).toMatch(/script_loader_tag/);
    expect(php).toMatch(/type="module"/);
  });

  it('block.json 合法且声明 editorScript 与属性', async () => {
    const block = JSON.parse(await read('block/block.json'));
    expect(block.name).toBe('ai-slot/slot');
    expect(block.editorScript).toBe('file:./editor.js');
    for (const attr of ['name', 'src', 'fallback', 'refreshInterval', 'freshOnly']) {
      expect(block.attributes).toHaveProperty(attr);
    }
  });

  it('Elementor 小组件通过统一渲染出口输出', async () => {
    const widget = await read('includes/class-ai-slot-elementor-widget.php');
    expect(widget).toMatch(/extends \\Elementor\\Widget_Base/);
    expect(widget).toMatch(/ai_slot_render\(/);
    expect(widget).toMatch(/if \(!defined\('ABSPATH'\)\)/);
  });

  it('构建产物已同步到插件资产目录', async () => {
    const asset = await read('assets/ai-slot-embed.js');
    expect(asset.length).toBeGreaterThan(1000);
    expect(asset).toMatch(/customElements\.define\("ai-slot"/);
  });

  it('readme.txt 符合 wordpress.org 目录格式', async () => {
    const readme = await read('readme.txt');
    expect(readme).toMatch(/^=== ai-slot ===/);
    expect(readme).toMatch(/^Stable tag: 0\.1\.0/m);
    expect(readme).toMatch(/== Installation ==/);
  });
});
