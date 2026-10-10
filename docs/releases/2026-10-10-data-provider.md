# 数据源组件树交付：`@ai-slot/proxy@0.2.0`

本次版本增加 `createRenderHandler` 和 `ContentProvider`，可将开发者提供的公开数据映射为结构化组件树，经注册表校验后，通过 `GET /ai-render/:slotId` 交付。数据交付不需要模型密钥；原有 `createAiRenderHandler` 入口继续兼容。

请求总预算为 8 秒。数据源读取或组件树生成失败时返回 503，由客户端保留原始兜底内容。只有显式设置 `staleMs`，并且缓存仍属于相同内容版本、组件注册表版本及 provider 版本时，才可在生成失败时返回旧树。新路径不输出 HTML，也不执行组件树中的代码。

## 发布证据

| 项目 | 记录 |
| --- | --- |
| 本地版本 | `0.2.0` |
| 发布前 npm `latest` | `0.1.0` |
| 本轮 tarball SHA512 | `sha512-t6Uzyq72XbV+eNPfWf7+xCpb+4dv+kUFWqS6qkq5O+4wAFTYrw9q1J+5C0DzPdbp9tBrpxecf2o3T2IsyDe56A==` |
| Git SHA | `95c5f1be17b14d26b0e35bebba332239962cb578`，已推送并核对 `origin/master` |
| Pages 预览部署 ID | `8f41b6c9-d395-46af-a05e-7aa2a48ca23d`（`release-data-provider-preview`，https://8f41b6c9.aislot.pages.dev） |
| Pages 生产部署 ID | `e4d622fe-2405-4a4e-9abe-48f0a54d0975`（`main`，https://e4d622fe.aislot.pages.dev） |
| 发布前成功 Production 部署 ID | `1f5fcca6-1709-4c40-8ae8-4f2da143b35d` |
| 本地 tarball 独立安装 | 通过；`@ai-slot/registry@0.1.0` 可从 npm 安装，无模型密钥返回已校验组件树 |
| 公网 npm 安装验证 | 待发布后记录 |

官网已从同一份 `dist` 依次部署预览和生产。`npm run lint`、`npm run test:agent`（5/5）及 `npm run build` 通过。预览 URL 的首页、`/agents/`、`/llms.txt`、目录、RSS、React 搜索均返回 200；未知文档 404，RSS 条件请求 304；官方 MCP 客户端完成发现、`search_docs` 与 `read_doc`。390px 英中双语首页无横向溢出，CTA 可进入演示区。生产的 `https://aislot.dev` 与 `https://aislot.pages.dev` 首页均为 200，资源名均与本地一致：`index-oXFeoVi1.js`、`index-I4DxBv6q.css`；两个域名的上述读通道及 OpenAPI、Skill、MCP 均通过，未知文档 404、RSS 304。生产健康端点匿名 GET 返回 403，Pages 生产配置仍有加密的 `TELEMETRY_SECRET`；本地没有生产签名凭据，因此本轮未重新执行签名成功探测，历史签名与心跳验收见[中央接线记录](../operations/ai-slot-telemetry-rollout.md)。

公网 npm 安装验证仍待包发布后进行；上述 Pages 上线不代表 `@ai-slot/proxy@0.2.0` 已发布。若生产页面验证失败，应在既有 `aislot` Pages 项目的 Deployments 中回滚到发布前记录的成功 Production 部署，并再次核对线上资源。若 npm 新版本有缺陷，应将 `latest` 指回先前版本，发布修复版；必要时标记有缺陷版本为 deprecated，不以 unpublish 作为常规恢复手段。
