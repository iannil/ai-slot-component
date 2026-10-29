# WordPress 插件目录提交指南

目标：让 `ai-slot` 在 wordpress.org 插件目录可被搜索并一键安装。

## 前置条件

- 一个 wordpress.org 账号（与 WordPress 站点账号不通用，需在 wordpress.org 单独注册）。
- 打包产物：`integrations/wordpress/dist/ai-slot.zip`（见下）。
- 公开可访问的插件主页与隐私政策：
  - Plugin URI：`https://github.com/iannil/ai-slot-component`
  - 隐私政策：`https://aislot.dev/privacy`

## 打包

```sh
pnpm --filter example-ai-slot-embed-starter build   # 确保 assets/ai-slot-embed.js 最新
node integrations/wordpress/build-zip.mjs           # 生成 dist/ai-slot.zip
```

## 提交步骤（需本人账号操作）

0. 上传前先用官方 Plugin Check 工具自检：任一测试站安装「Plugin Check (PCP)」插件 → 工具 → Plugin Check → 选 ai-slot 运行扫描，确认无 ERROR 再上传。
1. 登录 <https://wordpress.org/plugins/developers/add/>。
2. 上传 `dist/ai-slot.zip`，填写：
   - **Plugin Name**：ai-slot
   - **Plugin URL**：https://github.com/iannil/ai-slot-component
   - **Description**：复用 `readme.txt` 的 Description 段落。
3. 提交后进入人工审核队列（通常 3–14 天），审核沟通通过注册邮箱进行。

## 审核常见检查点与本插件的对应

| 审核点 | 本插件情况 |
|---|---|
| 无混淆/压缩后的不可读代码 | `assets/ai-slot-embed.js` 为打包产物但非混淆；提交说明中附源码链接（`integrations/embed/embed.mjs`，仓库公开） |
| 所有输出转义 | 渲染出口统一走 `esc_attr` / `esc_url` / `wp_kses_post` |
| 不引入远程代码执行 | 脚本资产随插件打包，不从 CDN 加载 |
| 数据收集披露 | 不收集任何数据；readme.txt 已含隐私说明，隐私政策页 https://aislot.dev/privacy |
| 商标冲突 | 名称不含「WordPress」「WooCommerce」等受保护商标 |

## 审核通过后

1. 会收到含 SVN 仓库地址的邮件（形如 `https://plugins.svn.wordpress.org/ai-slot/`）。
2. 推送代码到 SVN trunk 并打 tag `0.1.0`：

   ```sh
   svn checkout https://plugins.svn.wordpress.org/ai-slot/ svn-ai-slot
   cp -R integrations/wordpress/plugin/ai-slot/* svn-ai-slot/trunk/
   cd svn-ai-slot && svn add trunk/* && svn ci -m "Initial commit: ai-slot 0.1.0"
   svn cp trunk tags/0.1.0 && svn ci -m "Tag 0.1.0"
   ```

3. 上架后在 wordpress.org 搜索「ai-slot」即可找到；后续版本更新重复步骤 2 并递增 readme.txt 的 `Stable tag`。

## 注意事项

- 目录 slug（`ai-slot`）以下载提交时的插件名为准，提交后不可更改。
- 若 slug 已被占用，审核方会要求改名；备选 slug：`ai-slot-content`。
- 审核期间不要重复提交同一插件。
