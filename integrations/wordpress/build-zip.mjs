// 生成 WordPress 插件目录提交用的 ai-slot.zip。
// 打包前确保嵌入资产为最新：pnpm --filter example-ai-slot-embed-starter build
import { cp, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = new URL('.', import.meta.url).pathname;
const stage = here + 'dist/stage';
const out = here + 'dist/ai-slot.zip';

await rm(here + 'dist', { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(here + 'plugin/ai-slot', stage + '/ai-slot', { recursive: true });

await run('zip', ['-r', out, 'ai-slot'], { cwd: stage });
await rm(stage, { recursive: true, force: true });
console.log('[ai-slot] WordPress 提交包已生成：integrations/wordpress/dist/ai-slot.zip');
