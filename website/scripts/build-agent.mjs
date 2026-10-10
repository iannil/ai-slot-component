import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
const root = new URL('../../', import.meta.url);
const sources = [['overview', 'AI Slot 使用指南', 'README.zh-CN.md', 'zh'], ['overview-en', 'AI Slot guide', 'README.md', 'en'], ...['registry','proxy','runtime','adapter-dom','adapter-react','adapter-vue','a2ui'].map(p => [p, `@ai-slot/${p}`, `packages/${p}/README.md`, 'en'])];
const records = await Promise.all(sources.map(async ([id,title,path,locale]) => {
  const body = await readFile(new URL(path, root), 'utf8');
  const updatedAt = execFileSync('git', ['log','-1','--format=%cI','--',path], { cwd: root, encoding:'utf8' }).trim();
  if (!updatedAt) throw Error(`缺少内容更新时间: ${path}`);
  return { id, title, locale, canonicalUrl:`https://github.com/iannil/ai-slot-component/blob/master/${path}`, updatedAt, version:createHash('sha256').update(body).digest('hex').slice(0,16), body };
}));
await writeFile(new URL('../server/generated-content.mjs', import.meta.url), `// 从仓库公开文档生成，请勿手动修改。\nexport const records = ${JSON.stringify(records)};\n`);
const skill = await readFile(new URL('../public/agent/skills/ai-slot-guide/SKILL.md', import.meta.url));
const archive = zipSync({ 'ai-slot-guide/SKILL.md': [strToU8(skill.toString()), { mtime: new Date('2026-10-10T00:00:00Z') }] });
await mkdir(new URL('../public/agent/', import.meta.url), { recursive:true });
await writeFile(new URL('../public/agent/ai-slot-guide.zip', import.meta.url), archive);
await writeFile(new URL('../public/agent/checksums.json', import.meta.url), JSON.stringify({ 'ai-slot-guide.zip':createHash('sha256').update(archive).digest('hex'), 'skills/ai-slot-guide/SKILL.md':createHash('sha256').update(skill).digest('hex') }, null, 2));

// 与官网共用样式源及设计变量；内联产物让无 JS 的 Agent 页面也完整呈现。
const sharedStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const styles = await postcss([tailwindcss('./tailwind.config.js'), autoprefixer()]).process(sharedStyles, { from:'src/index.css' });
await writeFile(new URL('../server/generated-agent-style.mjs', import.meta.url), `// 从官网共享样式生成，请勿手动修改。\nexport const styles = ${JSON.stringify(styles.css)};\n`);
