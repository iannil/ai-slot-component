# ai-slot 官网

ai-slot 的项目网站（Cloudflare Pages：静态前端 + Agent Functions）：https://aislot.dev

## 开发

```bash
npm install
npm run dev        # 本地开发（vite）
npm run build      # 生成 Agent 内容 + 类型检查 + 产物构建
npm run preview    # 预览生产构建
```

注意：`vite.config.ts` 把 `@ai-slot/*` 别名直接指向 `../packages/*/src`，构建官网无需先构建 monorepo 包。

## 部署

Cloudflare Pages 项目 `aislot`，**生产分支是 `main`**（不是 master，写错会部署成预览环境）：

```bash
npm run build
npx wrangler pages deploy dist --project-name=aislot --branch=main
```

部署后用 `curl -s https://aislot.pages.dev/ | grep -o 'index-[^"]*\.js'` 对比 `dist/assets/` 里的产物哈希，确认线上已切换。

## 演示区（src/demo/）

Demo 区不是录屏：页面内嵌真实的 `@ai-slot/runtime` 与 `@ai-slot/adapter-dom`，
网络层由 `virtual-backend.ts` 在页内虚拟化（拦截 `/ai-render/*` 与 `/ai-invalidate`，
按与 `@ai-slot/proxy` 相同的线协议应答 JSON / SSE 双帧 / 失效推送），静态托管即可运行。

交互设计：先选行业（电商/酒店/新闻/理财），再按高亮引导手动完成四步——
打开页面（stream）、运营发布内容（live）、运营控制台改卖点方向（提示词推送）、故障重载（静默兜底）。
页面上没有输入框：调整者是运营/开发者，访客只看到结果。
行业文案与页面模板见 `industries.ts` 与 `pages.ts`。

## Agent 接入

官网新增 MCP / API / RSS / Skill 四通道。实现与 IANNIL 采集配置见 [Agent 接入说明](../docs/agent-access.md)。

- `npm run test:agent`：官方 MCP 客户端、API/分页、RSS、Skill、签名健康与采集故障验证。
- `npm run dev:agent`：构建后启动 Pages 模拟器，支持服务端 Agent 路由；单独 Vite 不提供这些路由。
- `npm run build`：自动生成公开文档索引、Skill ZIP、校验文件，再构建官网。
- 四通道接入页为 `/agents/`，首页页脚提供入口。服务端 `functions/` 必须与 `dist/` 一起通过现有 Pages 部署流程发布。

尚未配置统计密钥时四通道可用，但不投递中央事件。生产发布与中央心跳、日汇总验收需另行执行，不能将本地测试当成上线证据。
