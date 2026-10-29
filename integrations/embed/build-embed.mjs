// 构建通用嵌入包，并同步到各平台插件/扩展资产目录。
import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const out = new URL('./assets/ai-slot-embed.js', import.meta.url).pathname;
const syncTargets = [
  new URL('../wordpress/plugin/ai-slot/assets/', import.meta.url).pathname,
  new URL('../shopify/extension/extensions/ai-slot/assets/', import.meta.url).pathname,
  new URL('../typecho/plugin/AiSlot/assets/', import.meta.url).pathname,
  new URL('../zblogphp/plugin/AiSlot/assets/', import.meta.url).pathname,
];

await build({
  entryPoints: [new URL('./embed.mjs', import.meta.url).pathname],
  outfile: out,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});

for (const dir of syncTargets) {
  await mkdir(dir, { recursive: true });
  await copyFile(out, dir + 'ai-slot-embed.js');
}
console.log('[ai-slot] 嵌入包已构建并同步：integrations/embed/assets 与 wordpress / shopify / typecho / zblogphp 资产目录');
