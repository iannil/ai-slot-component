# 全包发布：2026-10-11

用户在首轮 proxy 0.2.0 发布后明确要求“全部发布”。本轮覆盖九个 packages 包，首次公开 Operations/MCP；后两者仍是 Node >=22、本地单进程的实验性 0.x 接口，不代表远程服务部署、外部 AI 客户端或客户试点已完成。示例站与 WordPress 插件保留仓库参考交付，不伪装成 npm 包。

## 发布范围

| 包 | 版本 | 变更 |
| --- | --- | --- |
| registry | 0.1.1 | 明确 Node >=18 兼容范围、全包依赖基线 |
| runtime | 0.2.0 | 自动重连、连接补偿、生命周期隔离、fresh-only |
| proxy | 0.3.0 | 首轮数据交付加有界失效通道 |
| adapter-dom | 0.2.0 | 命名槽位与新版 runtime 依赖 |
| adapter-react | 0.1.1 | 更新 runtime/registry 依赖 |
| adapter-vue | 0.1.1 | 更新 runtime/registry 依赖 |
| a2ui | 0.1.1 | 更新 runtime/DOM peer 与 registry 依赖 |
| operations | 0.1.0 | 首次公开版本治理与本地单写者存储 |
| mcp | 0.1.0 | 首次公开本地 stdio 管理客户端，仍需独立运行参考服务 |

精确 SHA512、公开依赖与旧 latest 恢复点见[制品清单](2026-10-11-all-packages-manifest.json)。首次发布包没有旧 latest，不以 unpublish 作为恢复手段；发现缺陷时发修复版并按需 deprecate。版本更新采用 pnpm pack 转换 workspace 依赖，制品仅含 dist、package.json、README、LICENSE，不包含测试、环境文件或凭据。

## 发布前验证

- 本轮版本配置下 root build/test/typecheck 通过；首次完整测试 371 项。
- 实际安装发现 MCP 的 npm 符号链接入口会静默退出；入口改为解析真实文件路径，并补 CLI 回归。修复后 MCP 4/4、build/typecheck 通过，协议返回版本与包版本 0.1.0 一致。
- 独立 npm 项目同时安装九个精确 tgz，通过数据交付、DOM/React/Vue/A2UI 渲染转换、真实 FileStore 建稿/批准/发布及重启交付、npm bin 实际 stdio 发现七工具（无 approve）。脚本为 `scripts/release-smoke.mjs`，复制到消费目录运行，不能用仓库源码代替发布包。
- 消费项目 TypeScript NodeNext 声明检查通过。参考消费依赖使用 React 18.3.1、Vue 3.5.42、jsdom 25.0.1；npm audit 为 0。初次消费夹具曾选 Vue 3.5.0，审计提示其 server-renderer 问题后换用修复版本；该旧测试依赖未进入发布包。
- Node 18 的核心包最低运行环境本轮未另行启动验证；沿用已有兼容设计与 ES2022 构建，首次管理包明确要求 Node 22。

## 公网验收

准备已完成；各包发布和公网安装结果待实际操作后补记。本段不是发布成功声明。
