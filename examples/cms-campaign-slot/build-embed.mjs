import { build } from 'esbuild';

await build({
  entryPoints: [new URL('./embed.mjs', import.meta.url).pathname],
  outfile: new URL('./wordpress/assets/ai-slot.js', import.meta.url).pathname,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
