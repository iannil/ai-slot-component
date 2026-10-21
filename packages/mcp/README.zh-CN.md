# @ai-slot/mcp

[English](https://github.com/iannil/ai-slot-component/blob/master/packages/mcp/README.md) | **简体中文**

实验性 AI-SLOT 管理 MCP，要求 Node.js 22 或更新版本。它以本地 stdio 暴露工具，将请求转发给固定的 `http://127.0.0.1:4194` 管理服务；不会自行启动该服务、打开版本库或授予审批权限。0.x 接口尚不承诺跨版本兼容。

## 安装与使用

```bash
npm install @ai-slot/mcp
```

先按仓库 [管理参考服务说明](https://github.com/iannil/ai-slot-component/tree/master/examples/managed-slot) 启动服务，并将服务配置给 Agent 的令牌放入环境变量 `AI_SLOT_AGENT_TOKEN`。不要把 Owner 令牌给 Agent，也不要把真实令牌提交进配置仓库。

客户端配置的 command 可使用已安装项目的 `node_modules/.bin/ai-slot-management-mcp`。在该项目的终端可运行：

```bash
npx --no-install ai-slot-management-mcp
```

该进程通过标准输入输出传输 MCP；无需手动键入内容。程序 API 导出 `createManagementClient` 和 `createManagementServer`。

## 能力与限制

七项工具支持发现槽位、读取、建稿、预览、发布、回滚和状态核对；没有批准工具。Owner 在参考管理页面批准后，Agent 才能提交对应产物。实际工具清单可通过 MCP `tools/list` 获取。

首期只支持本机固定 HTTP 服务，不支持远程 MCP、任意目标 URL、多租户或由 AI 自动批准。发布包不包含参考管理页面、CMS 插件或服务配置；这些位于仓库。官方 SDK、真实 stdio、HTTP 与浏览器闭环已验收，但外部 AI 客户端和真实客户试点仍待验证。

MIT 许可证。问题反馈：https://github.com/iannil/ai-slot-component/issues
