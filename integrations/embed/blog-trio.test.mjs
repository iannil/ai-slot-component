// Typecho / Z-BlogPHP 插件与 Halo recipe 的静态契约测试：不依赖 PHP/Java 运行时，
// 校验插件文件结构、安全转义纪律与嵌入脚本的同步状态。
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

const typechoRoot = new URL('../typecho/plugin/AiSlot/', import.meta.url);
const zblogRoot = new URL('../zblogphp/plugin/AiSlot/', import.meta.url);
const haloRoot = new URL('../halo/', import.meta.url);
const read = (root, p) => readFile(new URL(p, root), 'utf8');

const EMBED_MARKER = 'customElements.define("ai-slot"';

describe('Typecho 插件静态契约', () => {
  it('Plugin.php 具备插件头、接口实现与头部钩子', async () => {
    const php = await read(typechoRoot, 'Plugin.php');
    expect(php).toMatch(/@package AiSlot/);
    expect(php).toMatch(/class AiSlot_Plugin implements Typecho_Plugin_Interface/);
    expect(php).toMatch(/Typecho_Plugin::factory\('Widget_Archive'\)->header/);
    expect(php).toMatch(/public static function config\(Typecho_Widget_Helper_Form \$form\)/);
  });

  it('统一渲染出口：HTTPS 校验、name/src 转义、无端点回退兜底', async () => {
    const php = await read(typechoRoot, 'Plugin.php');
    expect(php).toMatch(/public static function slot\(/);
    expect(php).toMatch(/parse_url\(\$url, PHP_URL_SCHEME\)/);
    expect(php).toMatch(/\$scheme === 'https'/);
    expect(php).toMatch(/127\\\.0\\\.0\\\.1\|localhost/);
    expect(php).toMatch(/htmlspecialchars\(\$name, ENT_QUOTES, 'UTF-8'\)/);
    expect(php).toMatch(/htmlspecialchars\(\$src, ENT_QUOTES, 'UTF-8'\)/);
  });

  it('无危险输出与动态执行', async () => {
    const php = await read(typechoRoot, 'Plugin.php');
    expect(php).not.toMatch(/echo \$_(GET|POST|REQUEST)/);
    expect(php).not.toMatch(/eval\(/);
    expect(php).toMatch(/__TYPECHO_ROOT_DIR__/); // 防直接访问
  });

  it('嵌入脚本构建产物已同步', async () => {
    const asset = await read(typechoRoot, 'assets/ai-slot-embed.js');
    expect(asset.length).toBeGreaterThan(1000);
    expect(asset).toMatch(EMBED_MARKER);
  });

  it('recipe 符合六段式规范', async () => {
    const md = await read(new URL('../typecho/', import.meta.url), 'AGENT-INTEGRATION.md');
    for (const section of ['## detect', '## files', '## patch', '## verify', '## rollback', '## constraints']) {
      expect(md).toContain(section);
    }
  });
});

describe('Z-BlogPHP 插件静态契约', () => {
  it('plugin.xml 合法且必需字段齐全', async () => {
    const xml = await read(zblogRoot, 'plugin.xml');
    expect(xml).toMatch(/<id>AiSlot<\/id>/);
    expect(xml).toMatch(/<path>main\.php<\/path>/);
    expect(xml).toMatch(/<include>include\.php<\/include>/);
    expect(xml).toMatch(/<version>0\.1\.0<\/version>/);
    expect(xml).toMatch(/<adapted>\d+<\/adapted>/);
  });

  it('include.php 注册插件并挂载头部注入钩子', async () => {
    const php = await read(zblogRoot, 'include.php');
    expect(php).toMatch(/RegisterPlugin\('AiSlot', 'ActivePlugin_AiSlot'\)/);
    expect(php).toMatch(/Add_Filter_Plugin\('Filter_Plugin_Index_Begin', 'AiSlot_Index_Begin'\)/);
    expect(php).toMatch(/\$zbp->header \.=/);
    expect(php).toMatch(/type="module"/);
  });

  it('统一渲染出口：HTTPS 校验、name/src 转义、无端点回退兜底', async () => {
    const php = await read(zblogRoot, 'include.php');
    expect(php).toMatch(/function AiSlot_Slot\(/);
    expect(php).toMatch(/function AiSlot_ValidateSrc\(/);
    expect(php).toMatch(/\$scheme === 'https'/);
    expect(php).toMatch(/127\\\.0\\\.0\\\.1\|localhost/);
    expect(php).toMatch(/htmlspecialchars\(\$name, ENT_QUOTES, 'UTF-8'\)/);
    expect(php).toMatch(/htmlspecialchars\(\$src, ENT_QUOTES, 'UTF-8'\)/);
    expect(php).not.toMatch(/echo \$_(GET|POST|REQUEST)/);
    expect(php).not.toMatch(/eval\(/);
  });

  it('配置页经权限检查且入库前校验端点', async () => {
    const php = await read(zblogRoot, 'main.php');
    expect(php).toMatch(/CheckRights/);
    expect(php).toMatch(/CheckPlugin\('AiSlot'\)/);
    expect(php).toMatch(/AiSlot_ValidateSrc\(trim\(GetVars\('default_src', 'POST'\)\)\)/);
    expect(php).toMatch(/SaveConfig\('AiSlot'\)/);
    expect(php).not.toMatch(/echo \$_(GET|POST|REQUEST)/);
  });

  it('logo.png 存在且为 128x128 PNG', async () => {
    const buf = await readFile(new URL('logo.png', zblogRoot));
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    // IHDR 宽高：字节 16-23
    expect(buf.readUInt32BE(16)).toBe(128);
    expect(buf.readUInt32BE(20)).toBe(128);
  });

  it('嵌入脚本构建产物已同步', async () => {
    const asset = await read(zblogRoot, 'assets/ai-slot-embed.js');
    expect(asset.length).toBeGreaterThan(1000);
    expect(asset).toMatch(EMBED_MARKER);
  });

  it('recipe 符合六段式规范', async () => {
    const md = await read(new URL('../zblogphp/', import.meta.url), 'AGENT-INTEGRATION.md');
    for (const section of ['## detect', '## files', '## patch', '## verify', '## rollback', '## constraints']) {
      expect(md).toContain(section);
    }
  });
});

describe('Halo recipe 静态契约', () => {
  it('仅提供模板注入 recipe，不含 Java 插件', async () => {
    const md = await read(haloRoot, 'AGENT-INTEGRATION.md');
    for (const section of ['## detect', '## files', '## patch', '## verify', '## rollback', '## constraints']) {
      expect(md).toContain(section);
    }
    expect(md).toContain('<ai-slot name=');
    expect(md).toContain('type="module"');
    // 明确声明暂不提供 Java 插件
    expect(md).toMatch(/暂不提供 Halo Java 插件/);
  });
});
