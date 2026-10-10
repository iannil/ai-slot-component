# AI Slot 的 MCP / API / RSS / Skill 接入

本次实现位于 `website/`，部署目标为现有 Cloudflare Pages 项目 `aislot`、正式域名 `aislot.dev`，产品 ID 为 `ai-slot`，站点为 `main`。遵循 IANNIL 的 `docs/agent-product-onboarding.md` 接入标准。四通道提供公开文档查询与读取，不承诺替用户调用 LLM、修改页面或发布项目。

## 内容与入口

构建时从本仓库中文/英文 README 和七个包的 README 生成受控内容索引。API 与 MCP 共用 `website/server/content.mjs`；正文分页为每页最多 6000 UTF-16 代码单元，带稳定 ID、canonicalUrl、来源提交时间、内容哈希。RSS 使用来源文档的最后提交时间，重新构建不制造更新时间。发布前需提交源文档以使时间对应本次内容。

| 方式 | 上线后的正式地址 | 能力 |
| --- | --- | --- |
| MCP | `https://aislot.dev/mcp` | 官方 SDK 1.32.1，Streamable HTTP、无状态 JSON 响应；search_docs、read_doc、aislot://guide |
| API | `https://aislot.dev/api/agent/search?q=React&limit=5` | 关键词查询，q 1–200 字符，limit 1–20 |
| API | `https://aislot.dev/api/agent/content?id=adapter-react` | 正文读取，nextCursor 非空则以相同 id 和 cursor 继续 |
| RSS | `https://aislot.dev/agent/feed.xml` | 公开文档更新、稳定 GUID、ETag、HEAD、304 |
| Skill | `https://aislot.dev/agent/skills/ai-slot-guide/SKILL.md` | 接入工作流、错误恢复、来源引用 |
| Skill ZIP | `https://aislot.dev/agent/ai-slot-guide.zip` | 同名 ai-slot-guide 目录；checksums.json 提供 SHA-256 |
| 发现入口 | `/agents/`、`/llms.txt`、`/agent/catalog.json`、`/agent/openapi.json` | 能力、边界、目录、准确 API 契约 |

以上入口已于 2026-10-10 发布并完成正式域名烟测，见文末发布记录。目录只包含本产品资料。未知 ID 返回 404，非法/重复/未知参数返回 400；合法无结果返回 200 与空数组。API 公开只读、无应用层固定速率额度；边缘平台可施加防护。MCP 请求体上限 16 KiB，校验 Origin；仅允许正式站同源及本地测试同源，不根据来访 Host 信任任意 Origin。GET /mcp 返回 405 是预期。

## 开发和验证

官网是独立 npm 项目，不在根 pnpm workspace 中：

```sh
cd website
npm ci
npm run test:agent
npm run build
npx wrangler pages functions build --outdir /tmp/ai-slot-agent-functions
npm run dev:agent
```

`vite` 和 `vite preview` 只服务前端；四通道必须使用 Pages 模拟器。`npm run build` 先生成服务端文档索引与静态 Skill ZIP，再构建前端。官方 SDK 仅被 Functions 引用，不打入浏览器包。`public/_routes.json` 确保 RSS/Skill 缓存请求也先经过采集层，静态资产通过 `context.next()` 获取，避免重复采集。未知 Agent 路由返回 404，不落入 SPA 首页。

测试覆盖官方 SDK 客户端初始化/工具发现/搜索/读取/资源/业务错误，API 分页与非法参数，RSS 条件请求，ZIP 一致性，匿名健康拒绝与签名成功，统计故障隔离与查询隐私。

## IANNIL 统计接线

从中央仓库生成物复制的服务端适配器位于 `website/server/vendor/`，SHA-256 已核对：

`f7fa11249bd42755aad93a263ba74425fc30bef78d384efb3a433ca8535a9fe3`

API 记录服务端生成的语义状态与结果数。MCP 每请求复用 requestId，合并 HTTP 和工具事件；工具 isError 即使 HTTP 200 仍记录错误，SDK 参数校验错误记 tool_error。协议发现与业务读取分开。RSS/Skill/发现入口记录请求；来自 Skill 的 API 调用仍属 api，来源仅为 declared。不会投递查询、正文、用户输入或凭据。文档 ID 尚未登记中央资源白名单，具体文档资源保持 null。

默认没有密钥时不发送事件。下面是测试环境配置模板，secret 通过平台 Secret 或被 Git 忽略的 `.dev.vars` 提供：

```text
TELEMETRY_ENABLED=true
TELEMETRY_PRODUCT_ID=ai-slot
TELEMETRY_SITE_ID=main
TELEMETRY_ENVIRONMENT=test
TELEMETRY_KEY_ID=ai-slot-test-v1
TELEMETRY_ENDPOINT=https://iannil.com/api/agent-telemetry/v1/events
```

生产必须使用独立 `ai-slot-production-v1` 和 `production` 环境，`TELEMETRY_SECRET` 至少 32 字符。不要用 PUBLIC_/VITE_ 前缀或写入 Git/Skill。健康端点为 `/api/agent-telemetry/v1/health`，未签名 GET 返回 403。

中央维护者需合并（不能覆盖现有产品）：

- 产品 `ai-slot`、域名 `aislot.dev`、siteId `main` 已有占位；在准备实施时将 mcp/api/rss/skill/discovery 设 pending。
- 本次只使用已注册资源 guide、catalog、feed、skill_file、skill_zip、checksums、openapi、llms，不必新增内容 ID。
- 在 `TELEMETRY_KEYS` 合并独立测试和生产 keyId/secret，产品仅持有自己的密钥。
- 产品生产部署后，启用 `telemetrySites: ['main']`，合并健康目标 `{"productId":"ai-slot","siteId":"main","url":"https://aislot.dev/api/agent-telemetry/v1/health","keyId":"ai-slot-production-v1"}`。
- 实际中央签名心跳、真实四通道访问和按北京时间日汇总验收后，才逐项设 verified。预览域名不可冒充正式生产域名，若用于中央健康检查需先登记其确切域名。

## 发布与回滚

1. 中央维护者准备测试密钥及 pending 登记，在 Pages 测试环境配置 Secret 后验收真实投递。
2. 配好生产独立变量、Secret。`cd website && npm run build` 后，在获得发布授权时执行 `npx wrangler pages deploy dist --project-name=aislot --branch=main`（生产分支确为 main）。需从 website 目录执行，以便 Wrangler 同时打包 functions。
3. 检查首页入口、四通道、OpenAPI、Skill ZIP，并用官方客户端真实连接；启用中央生产健康目标，等待真实心跳与日汇总。
4. 保留旧部署 ID 与配置；回滚使用 Pages 已有部署版本，不删除中央历史数据。

当前已完成实现、生产发布和正式域名烟测。中央 Secret 配置、真实心跳和日汇总仍待执行；没有把中央验收状态改为 verified。搜索引擎自主发现与不同客户端的 Skill 安装也不能由接口测试代替。

协议参考：[MCP HTTP 传输规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[Agent Skills 规范](https://agentskills.io/specification)。

## 本次验收记录（2026-10-10，北京时间）

- `npm run test:agent`：5 组集成测试通过（包括主动模拟统计投递失败，预期输出固定失败日志）。
- `npm run build`：文档/Skill 生成、TypeScript 检查与 Vite 构建通过。
- `wrangler pages functions build`：Functions 打包通过。
- Pages 本机模拟器（兼容日期 2026-10-01，端口 8791）+ `node tests/agent-http.mjs`：11 个页面/接口/文件返回预期 200，未知 Agent 路由 404，RSS 条件请求 304，官方 MCP 客户端连接与工具调用通过。
- Python XML 解析器：RSS 9 条真实公开文档条目解析通过。
- `git diff --check`：通过。SDK 七包核心代码未改，本次未重复运行其完整测试。
- 初次本地验收未执行生产发布（已由下方发布记录补验）；中央真实事件投递/落库、心跳、日汇总、自主搜索发现和客户端 Skill 安装仍未验收。测试签名密钥仅为本地 fixture，不是有效生产凭据。

### 接入页视觉一致性

接入页模板独立为 `website/server/agent-page.mjs`，构建时复用官网 `src/index.css` 与 `tailwind.config.js` 生成内联样式，统一深色背景、荧光绿强调色、字体、网格、内容宽度和导航/页脚视觉。服务端仍返回完整 HTML，无 JavaScript 时入口和说明可读。桌面与 390px 窄屏预览已检查，无页面横向溢出；官网构建和原有 5 组接入测试通过。


## 生产发布记录（2026-10-10，北京时间）

- 实现提交：`fb30d23`，已推送至 `origin/master`。
- Pages 项目：`aislot`；生产分支参数：`main`。
- 部署地址：https://04c23970.aislot.pages.dev ，正式接入页：https://aislot.dev/agents/ 。
- 回滚恢复点：`c851d504-70f5-4cbe-9cf7-d185dfd3ed35`（源提交 `e0f94e6`）。
- 正式域名首页已匹配本次产物 `index-DKDUDsjv.js`；接入页已返回共享深色主题与四通道内容。
- API 搜索、正文、目录、OpenAPI 均返回有效 JSON；RSS 200 与条件请求 304 通过；Skill 文件与 ZIP 校验值匹配本次构建。
- 官方 MCP 客户端完成生产端点初始化、工具发现和搜索调用。
- 未配置或验收中央生产密钥、真实心跳、日汇总；四通道上线不等于中央统计 verified。
