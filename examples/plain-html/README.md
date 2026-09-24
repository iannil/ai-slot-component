# plain-html 示例

模拟一个「老站」零侵入接入 ai-slot：原有 HTML 原样包进 `<ai-slot>`，加一行 `<script>` 即获得 AI 增强。

## 运行

```bash
pnpm install && pnpm build   # 仓库根目录先构建各包
node server.mjs              # http://localhost:4173
```

## 真实 LLM

默认使用确定性 mock LLM（无需密钥）。设置环境变量后切换为真实 OpenAI 兼容端点：

```bash
OPENAI_API_KEY=sk-... node server.mjs
# 可选：AI_BASE_URL（兼容端点，如 https://api.deepseek.com/v1）
# 可选：AI_MODEL_DEVELOPER（默认 gpt-4o）/ AI_MODEL_USER（默认 gpt-4o-mini）
```

## CI 预生成（AI 静态化）

```bash
node prewarm.mjs   # 生成 ai-cache.json（真实 CI 中配合 OPENAI_API_KEY）
node server.mjs    # 启动时自动水合 ai-cache.json
```

## 页面功能

- `hero` 槽位：`editable`（用户实时修改）+ `stream`（SSE 骨架流式）+ `live`（失效推送自动重载）
- `broken` 槽位：演示 AI 失败时的静默兜底
- `POST /admin/publish`：模拟数据源变更，bump 内容版本并推送失效信号
