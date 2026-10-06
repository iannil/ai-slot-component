// 录制官网演示 GIF：4 个场景 × 中英双语（自包含：自动起/停两个示例服务器，互不干扰）：
//   node capture-demo.mjs
// 场景：stream（骨架→终树）/ live（失效推送原地更新）/ editable（访客提示词）/ fallback（AI 失败静默兜底）
// 产物：../../website/public/assets/demo-{场景}-{lang}.gif，外加完整流程 demo-{lang}.gif
//       ../../assets/demo.gif（英文完整版，供根 README 使用）
// 依赖：已 pnpm build（vendor 指向 packages/*/dist）、ffmpeg、playwright chromium
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const websiteAssets = fileURLToPath(new URL("../../website/public/assets/", import.meta.url));
const repoAssets = fileURLToPath(new URL("../../assets/", import.meta.url));
const videoRoot = "/tmp/ai-slot-demo-capture";
mkdirSync(websiteAssets, { recursive: true });
mkdirSync(videoRoot, { recursive: true });

const VIEWPORT = { width: 800, height: 400 };

const LANGS = {
  zh: {
    port: 4181,
    page: "/index.html",
    finalTitle: "地铁再吵，只剩音乐",
    rewrittenTitle: "学生党闭眼入的降噪耳机",
    prompt: "给学生党推荐",
    captions: {
      stream: "打开商品页：静态内容先行，AI 卖点文案随后替换",
      live: "运营后台改促销 → 所有打开的页面原地更新，免发版",
      editable: "访客输入「给学生党推荐」→ 只改写这一个区域",
      fallback: "推荐服务故障 → 静态推荐位照常显示，不影响下单",
    },
  },
  en: {
    port: 4182,
    page: "/index-en.html",
    finalTitle: "the subway disappears",
    rewrittenTitle: "The student pick for deep focus",
    prompt: "pitch it to students",
    captions: {
      stream: "Page load: static content first, AI selling points follow",
      live: "Deal changed in admin → live on every open tab. No redeploy.",
      editable: "Visitor: “pitch it to students” → rewrites just this block",
      fallback: "Recommendation AI down → the static section stays",
    },
  },
};

function startServer({ port, lang }) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: exampleDir,
    env: {
      ...process.env,
      PORT: String(port),
      AI_DEMO_LANG: lang,
      AI_DEMO_SLOW: "2000", // 放慢 mock 响应，让骨架帧在视频里可读
      AI_CACHE_FILE: "/tmp/ai-slot-capture-no-cache.json", // 不存在 → 跳过水合，强制走 mock
      AI_DEMO_TRACE: "1", // 录制排查：mock 调用打点到 stderr
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  child.exitedEarly = false;
  child.once("exit", () => { child.exitedEarly = true; }); // spawn 时即挂监听，错过事件就会漏判
  return child;
}

async function waitReady(port, child) {
  // 子进程若因 EADDRINUSE 等闪退，立即报错而不是继续打到残留的旧服务器
  for (let i = 0; i < 60; i++) {
    if (child.exitedEarly) throw new Error(`server on ${port} exited before ready（端口被残留进程占用？）`);
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) {
        // 端口所有权核验：应答的必须是我们刚 spawn 的进程，否则就是有残留服务器在顶包
        const pids = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
          .toString().trim().split("\n");
        if (!pids.includes(String(child.pid))) {
          throw new Error(`port ${port} 被进程 ${pids} 占用，我们的服务器 pid=${child.pid}（可能已闪退）`);
        }
        return;
      }
    } catch (e) {
      if (e.message.includes("占用")) throw e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server on ${port} not ready`);
}

/** kill 不等待退出：旧进程若仍在监听，下一个场景的同端口新服务器会静默失败，
 *  浏览器实际打到旧实例（其缓存已热），造成「mock 还在 sleep 页面却已是终树」。
 *  因此必须等旧进程真正退出后再继续。 */
function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) return resolve();
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 3000); // 兜底：3s 内未退出也继续
  });
}

/** 底部字幕条：让每个场景 GIF 脱离旁白也能看懂 */
async function setCaption(page, text) {
  await page.evaluate((t) => {
    let bar = document.getElementById("capture-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "capture-caption";
      bar.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:9999;" +
        "background:#18181b;color:#a3e635;font:13px/1.4 ui-monospace,Menlo,monospace;" +
        "padding:10px 16px;letter-spacing:.01em;border-top:1px solid #3f3f46;";
      document.body.appendChild(bar);
    }
    bar.textContent = t;
  }, text);
}

// waitForFunction 的断言必须传真实函数（needle 走 arg 注入）：
// 传字符串 "() => ..." 会被当成表达式求值，结果是函数对象——恒真，第一轮轮询就放行
const heroHasFn = (needle) =>
  (document.querySelector('ai-slot[name="hero"] .hero-title')?.textContent ?? "").includes(needle);

async function withRecording(name, cfg, fn) {
  // 不用 recordVideo：Playwright 视频在 context.close 时会丢末尾缓冲帧，时序不可控。
  // 改为定时截图 + 记录每帧真实时间戳，ffmpeg concat 按真实间隔合成——
  // 时长 = 真实墙钟时间，与截图耗时解耦。
  const framesDir = join(videoRoot, name);
  rmSync(framesDir, { recursive: true, force: true }); // 清掉上一轮残帧，避免验收时看错
  mkdirSync(framesDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const stamps = []; // [帧序号, 截图开始的墙钟时间]
  let chain = Promise.resolve();
  let seq = 0;
  const timer = setInterval(() => {
    const n = seq++;
    chain = chain.then(async () => {
      const t = Date.now();
      await page.screenshot({ path: join(framesDir, `${String(n).padStart(5, "0")}.png`) }).catch(() => {});
      stamps.push([n, t]);
    });
  }, 100);
  const base = `http://localhost:${cfg.port}`;
  try {
    await fn(page, base);
  } finally {
    clearInterval(timer);
    await chain; // 等待在途截图落盘
    await context.close();
    await browser.close();
  }
  // concat demuxer 清单：每帧 duration = 与下一帧的真实间隔；末帧重复一次使其时长生效
  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < stamps.length; i++) {
    const [n, t] = stamps[i];
    const next = i + 1 < stamps.length ? stamps[i + 1][1] : t + 300;
    lines.push(`file '${String(n).padStart(5, "0")}.png'`);
    lines.push(`duration ${((next - t) / 1000).toFixed(3)}`);
  }
  if (stamps.length > 0) {
    lines.push(`file '${String(stamps[stamps.length - 1][0]).padStart(5, "0")}.png'`);
  }
  writeFileSync(join(framesDir, "list.txt"), lines.join("\n"));
  return framesDir;
}

/** 各场景录制动作：每个场景一次独立页面加载，视频互不混杂 */
const t0 = Date.now();
const trace = (m) => console.log(`  [+${((Date.now() - t0) / 1000).toFixed(2)}s] ${m}`);

const scenarios = {
  async stream(page, base, cfg) {
    await page.goto(`${base}${cfg.page}`);
    trace("goto done");
    await setCaption(page, cfg.captions.stream);
    await page.waitForFunction(heroHasFn, cfg.finalTitle, { timeout: 15_000 });
    trace("finalTitle visible");
    await page.waitForTimeout(1_400);
  },
  async live(page, base, cfg) {
    await page.goto(`${base}${cfg.page}`);
    await setCaption(page, cfg.captions.live);
    await page.waitForFunction(heroHasFn, cfg.finalTitle, { timeout: 15_000 });
    trace("finalTitle visible");
    const initial = await page.locator('ai-slot[name="hero"] .hero-subtitle').textContent();
    await page.waitForTimeout(1_400); // 让观众看清初始促销
    await page.request.post(`${base}/admin/publish`);
    trace("published");
    await page.waitForFunction(
      (prev) =>
        (document.querySelector('ai-slot[name="hero"] .hero-subtitle')?.textContent ?? "") !== prev,
      initial,
      { timeout: 15_000 },
    );
    trace("subtitle updated");
    await page.waitForTimeout(1_600);
  },
  async editable(page, base, cfg) {
    await page.goto(`${base}${cfg.page}`);
    await setCaption(page, cfg.captions.editable);
    await page.waitForFunction(heroHasFn, cfg.finalTitle, { timeout: 15_000 });
    trace("finalTitle visible");
    await page.waitForTimeout(600);
    const input = page.locator('ai-slot[name="hero"] input[name=prompt]');
    await input.click();
    await input.pressSequentially(cfg.prompt, { delay: 110 });
    trace("typed");
    await page.waitForTimeout(400);
    await page.locator('ai-slot[name="hero"] button[type=submit]').click();
    trace("submitted");
    await page.waitForFunction(heroHasFn, cfg.rewrittenTitle, { timeout: 15_000 });
    trace("rewritten visible");
    await page.waitForTimeout(1_400);
  },
  async fallback(page, base, cfg) {
    // hero 正常渲染、broken 槽位（模拟 LLM 故障）保持兜底——同屏对比最有说服力
    await page.goto(`${base}${cfg.page}`);
    await setCaption(page, cfg.captions.fallback);
    await page.waitForFunction(heroHasFn, cfg.finalTitle, { timeout: 15_000 });
    await page.waitForTimeout(2_200);
  },
  /** 完整流程：三场景连播，用于官网 demo 区头图与根 README */
  async full(page, base, cfg) {
    await scenarios.stream(page, base, cfg);
    await setCaption(page, cfg.captions.live);
    const initial = await page.locator('ai-slot[name="hero"] .hero-subtitle').textContent();
    await page.waitForTimeout(1_200);
    await page.request.post(`${base}/admin/publish`);
    await page.waitForFunction(
      (prev) =>
        (document.querySelector('ai-slot[name="hero"] .hero-subtitle')?.textContent ?? "") !== prev,
      initial,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(1_400);
    await setCaption(page, cfg.captions.editable);
    const input = page.locator('ai-slot[name="hero"] input[name=prompt]');
    await input.click();
    await input.pressSequentially(cfg.prompt, { delay: 110 });
    await page.waitForTimeout(400);
    await page.locator('ai-slot[name="hero"] button[type=submit]').click();
    await page.waitForFunction(heroHasFn, cfg.rewrittenTitle, { timeout: 15_000 });
    await page.waitForTimeout(1_600);
  },
};

function toGif(framesDir, out) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", join(framesDir, "list.txt"),
    "-vf", "scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
    out,
  ]);
}

for (const [lang, cfg] of Object.entries(LANGS)) {
  // 每个场景起独立服务器实例：version 是模块状态，复用会导致后续场景的初始促销文案漂移。
  // 端口也按场景错开：旧进程退出需要时间，同端口复用会让浏览器打到缓存已热的旧实例。
  const names = Object.keys(scenarios);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const port = cfg.port + i * 10;
    const server = startServer({ port, lang });
    try {
      await waitReady(port, server);
      const framesDir = await withRecording(`${name}-${lang}`, { ...cfg, port }, (page, base) =>
        scenarios[name](page, base, { ...cfg, port }),
      );
      const out = join(websiteAssets, `demo-${name}-${lang}.gif`);
      toGif(framesDir, out);
      console.log(`✓ ${out}`);
    } finally {
      await stopServer(server);
    }
  }
}

// 根 README 用英文完整版
copyFileSync(join(websiteAssets, "demo-full-en.gif"), join(repoAssets, "demo.gif"));
console.log("✓ 根 assets/demo.gif 已更新为英文完整版");
