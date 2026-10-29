# ai-slot Shopify 扩展（Theme App Extension）

让 Shopify 商家在主题编辑器中拖拽使用 ai-slot 槽位，不触碰主题代码。

## 结构

```
extension/
├── shopify.app.ai-slot.toml            # 应用配置（shopify app config link 生成并关联）
└── extensions/ai-slot/
    ├── shopify.extension.toml          # 扩展定义（theme_app_extension）
    ├── blocks/
    │   ├── ai-slot.liquid              # App Block：槽位本体（拖入 section）
    │   └── ai-slot-embed.liquid        # App Embed Block：向 <head> 注入运行时
    └── assets/ai-slot-embed.js         # 由 integrations/embed 构建并自动同步
```

## 部署（需要 Shopify Partner 账号）

```sh
# 1. 构建嵌入运行时（产物自动同步到扩展 assets）
pnpm --filter example-ai-slot-embed-starter build

# 2. 关联 Partner Dashboard 中的应用（首次）
cd integrations/shopify/extension
shopify app config link

# 3. 发布扩展版本
shopify app deploy
```

商家侧：主题编辑器 → 左侧「应用嵌入」开启「ai-slot 运行时」→ 在任意 section 添加「ai-slot 槽位」块 → 填交付端点与兜底内容。

## 分发路径

- **自有/客户单店**：发布为 Custom App 或使用 Dev Dashboard 分发，无需应用商店审核。
- **上架 Shopify App Store**：需提交审核（通常 1–2 周），审核材料（应用列表文案、截图、隐私政策）在提交前补齐。

## 安全说明

- 交付端点在 Liquid 层强制 `https://` 前缀校验，非法端点时原样输出兜底内容。
- 商家设置值一律经 `escape` 过滤输出；运行时 AI 文本以 `textContent` 写入。
- 扩展无 Admin API 权限（`scopes = ""`），不读取店铺数据。
