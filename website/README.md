# ai-slot 官网

ai-slot 的项目网站（Cloudflare Pages 静态托管）：https://aislot.pages.dev

## 开发

```bash
npm install
npm run dev        # 本地开发（vite）
npm run build      # 类型检查 + 产物构建（tsc -b && vite build）
npm run preview    # 预览生产构建
```

注意：`vite.config.ts` 把 `@ai-slot/*` 别名指向 `../packages/*/dist`，请先在本仓库根目录执行 `pnpm build`。

## 演示区（src/demo/）

Demo 区不是录屏：页面内嵌真实的 `@ai-slot/runtime` 与 `@ai-slot/adapter-dom`，
网络层由 `virtual-backend.ts` 在页内虚拟化（拦截 `/ai-render/*` 与 `/ai-invalidate`，
按与 `@ai-slot/proxy` 相同的线协议应答 JSON / SSE 双帧 / 失效推送），静态托管即可运行。

交互设计：先选行业（电商/酒店/新闻/理财），再按高亮引导手动完成四步——
打开页面（stream）、运营发布内容（live）、运营控制台改卖点方向（提示词推送）、故障重载（静默兜底）。
页面上没有输入框：调整者是运营/开发者，访客只看到结果。
行业文案与页面模板见 `industries.ts` 与 `pages.ts`。
