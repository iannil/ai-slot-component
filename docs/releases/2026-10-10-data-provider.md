# 数据源组件树交付：`@ai-slot/proxy@0.2.0`

本次版本增加 `createRenderHandler` 和 `ContentProvider`，可将开发者提供的公开数据映射为结构化组件树，经注册表校验后，通过 `GET /ai-render/:slotId` 交付。数据交付不需要模型密钥；原有 `createAiRenderHandler` 入口继续兼容。

请求总预算为 8 秒。数据源读取或组件树生成失败时返回 503，由客户端保留原始兜底内容。只有显式设置 `staleMs`，并且缓存仍属于相同内容版本、组件注册表版本及 provider 版本时，才可在生成失败时返回旧树。新路径不输出 HTML，也不执行组件树中的代码。

## 发布证据

| 项目 | 记录 |
| --- | --- |
| 本地版本 | `0.2.0` |
| 发布前 npm `latest` | `0.1.0` |
| 本轮 tarball SHA512 | `sha512-t6Uzyq72XbV+eNPfWf7+xCpb+4dv+kUFWqS6qkq5O+4wAFTYrw9q1J+5C0DzPdbp9tBrpxecf2o3T2IsyDe56A==` |
| Git SHA | 待整合至 `master` 后记录 |
| Pages 预览部署 ID | 待预览发布后记录 |
| Pages 生产部署 ID | 待生产发布后记录 |
| 发布前成功 Production 部署 ID | `1f5fcca6-1709-4c40-8ae8-4f2da143b35d` |
| 本地 tarball 独立安装 | 通过；`@ai-slot/registry@0.1.0` 可从 npm 安装，无模型密钥返回已校验组件树 |
| 公网 npm 安装验证 | 待发布后记录 |

本轮准备阶段只验证本地 tarball 的独立安装；上述待记录项不代表已经上线。若生产页面验证失败，应在既有 `aislot` Pages 项目的 Deployments 中回滚到发布前记录的成功 Production 部署，并再次核对线上资源。若 npm 新版本有缺陷，应将 `latest` 指回先前版本，发布修复版；必要时标记有缺陷版本为 deprecated，不以 unpublish 作为常规恢复手段。
