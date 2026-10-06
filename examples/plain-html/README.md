# plain-html 示例

模拟四个行业的「老站」零侵入接入 ai-slot：原有 HTML 原样包进 `<ai-slot>`，加一行 `<script>` 即获得 AI 增强。

## 运行

```bash
pnpm install && pnpm build   # 仓库根目录先构建各包
node server.mjs              # http://localhost:4173
```

打开后是演示中心（行业选择页），四个行业页面：

| 页面 | 行业 | hero 槽位 | 推荐槽位（永远故障，演示兜底） |
|---|---|---|---|
| `/shop.html` | 电商零售 · 老友商城 | `shop-hero` | `shop-rec` |
| `/hotel.html` | 酒店旅游 · 栖澜西湖酒店 | `hotel-hero` | `hotel-rec` |
| `/news.html` | 新闻资讯 · 前沿观察 | `news-hero`（markdown 导读） | `news-rec` |
| `/fin.html` | 金融理财 · 恒信银行 | `fin-hero` | `fin-rec` |

`/shop-en.html` 是电商页的英文版（供英文录制）。

## 真实 LLM

默认使用确定性 mock LLM（无需密钥）。设置环境变量后切换为真实 OpenAI 兼容端点：

```bash
OPENAI_API_KEY=sk-... node server.mjs
# 可选：AI_BASE_URL（兼容端点，如 https://api.deepseek.com/v1）
# 可选：AI_MODEL_DEVELOPER（默认 gpt-4o）/ AI_MODEL_USER（默认 gpt-4o-mini）
```

## CI 预生成（AI 静态化）

```bash
node prewarm.mjs   # 为全部 8 个槽位生成 ai-cache.json（真实 CI 中配合 OPENAI_API_KEY）
node server.mjs    # 启动时自动水合 ai-cache.json
```

## 页面功能

- hero 槽位：`stream`（SSE 骨架流式）+ `live`（失效推送自动重载）；页面上没有输入框，调整者是运营/开发者
- 推荐槽位：mock 永远失败，演示 AI 故障时的静默兜底
- `admin.html`：运营控制台——改卖点方向（提示词）或发布内容更新，失效推送到所有打开的页面
- `POST /admin/prompt?slot=<槽位名>&prompt=<新提示词>`：替换该槽位的开发者提示词，bump 内容版本并推送失效
- `POST /admin/publish?slot=<槽位名>`：模拟该槽位的数据源变更，bump 内容版本并推送失效信号（缺省 `shop-hero`）
