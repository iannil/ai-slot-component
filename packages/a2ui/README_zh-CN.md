# @ai-slot/a2ui

[English](https://github.com/iannil/ai-slot-component/blob/master/packages/a2ui/README.md) | **简体中文**

为 ai-slot 提供 [A2UI](https://github.com/a2ui-project/a2ui) 传输格式兼容层。

- **消费** — 通过 `a2uiWireFormat` / `createA2uiWireFormat({ mappings })` 解析 A2UI `messages` 信封（v0.9 / v0.9.1 / v1.0），接入 ai-slot 组件树校验与渲染流程。
- **生产** — 通过 `withA2uiOutput(handler, { surfaceId })` 将 ai-slot 代理响应（JSON 或 SSE）转换为 A2UI 消息。
- **基础组件目录** — 提供 18 个标准 A2UI 组件的预定义表：`basicCatalogDomDefs` 用于渲染，`basicCatalogComponentDefs` 用于校验。

解析失败均返回 `null`，宿主 `<ai-slot>` 静默保留兜底内容。完整介绍见根目录 README。

## 安装

```bash
npm install @ai-slot/a2ui @ai-slot/runtime @ai-slot/adapter-dom
```

## 文档

- [项目介绍](https://github.com/iannil/ai-slot-component#readme)

## 许可证

MIT
