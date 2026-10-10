---
name: ai-slot-guide
description: 当用户需要在存量 HTML、React 或 Vue 页面接入 AI Slot、安全渲染结构化组件树、配置预生成或排查降级时，查询并读取 AI Slot 官方文档。
---

# AI Slot 接入指南

1. 确认用户的框架与任务，读取 https://aislot.dev/agents/ 获取当前能力。本站入口只读，不代为部署、修改页面或调用 LLM。
2. 如果已连接 https://aislot.dev/mcp，调用已发现的 `search_docs`（例如 `{"q":"React","limit":5}`），然后用 `read_doc` 读取返回 ID。
3. 没有 MCP 时先读 https://aislot.dev/agent/openapi.json，再 GET https://aislot.dev/api/agent/search?q=React&limit=5 和 https://aislot.dev/api/agent/content?id=adapter-react 。输入需 URL 编码。
4. 读取返回的 nextCursor 不为空时，用相同 id 和 cursor 继续请求，读完再作答；保留 canonicalUrl。空搜索可缩短关键词或查阅 https://aislot.dev/agent/catalog.json；404 时重新从目录选择 ID；400 时按契约修正参数；服务不可用时查阅 canonical 仓库文档。
5. 根据用户项目提供接入步骤：声明组件注册表、保留 ai-slot 内原始兜底、配置服务端代理、注册真实组件渲染器。AI 只能返回结构化 JSON，必须校验后渲染；API 密钥只留服务端。变更项目和部署需遵循用户授权。优先保留用户现有 CMS 与宿主工作流。先确认脚本接入权限、注册组件与数据端点。不要把当前公开 MCP 当成槽位发布工具，也不要把新组件代码生成当成免部署内容更新。
6. 用 https://aislot.dev/agent/feed.xml 跟踪公开文档更新。RSS 不执行操作。
7. 支持自定义请求头时可发送 `X-Iannil-Entry-Source: skill`；不支持则省略。不要发送用户完整指令、私有代码或凭据作为搜索词。

SDK 的 token 级增量流式、live 自动重连、多实例缓存/限流抽象仍未提供。下载本文件不等于已安装；按所用客户端的 Skill 安装方式放置同名目录。
