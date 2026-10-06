/**
 * 生成 Workers 静态资产目录 public/：
 * - 全部页面与页内脚本（*.html、components.mjs、registry-client.mjs）
 * - 页内 import map 引用的 /vendor/<pkg>/index.js（来自 packages 的 dist，需先 pnpm build）
 */
import { cp, mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = join(root, "public");

const PAGES_AND_SCRIPTS = ["components.mjs", "registry.mjs", "registry-client.mjs"];
const VENDOR_PKGS = ["registry", "runtime", "adapter-dom"];

await mkdir(out, { recursive: true });

for (const f of await readdir(root)) {
  if (f.endsWith(".html") || PAGES_AND_SCRIPTS.includes(f)) {
    await copyFile(join(root, f), join(out, f));
    console.log(`复制 ${f}`);
  }
}

for (const pkg of VENDOR_PKGS) {
  const dir = join(out, "vendor", pkg);
  await mkdir(dir, { recursive: true });
  await cp(join(root, "..", "..", "packages", pkg, "dist", "index.js"), join(dir, "index.js"));
  console.log(`复制 vendor/${pkg}/index.js`);
}

console.log("public/ 生成完毕");
