# Task 1：首屏定位与任务入口报告

## 实现内容

- 更新 `website/src/pages/Home.tsx` 的中英文首屏定位、补充句、代码示例注释、Quick Start 标题和底部 CTA 标题，保留其他词典字段。
- Hero 主按钮改为跳转 `#demo`，次按钮跳转已有 `#quickstart`；Demo section 新增 `id="demo"` 与 `scroll-mt-20`。
- 更新中英文 `document.title`；移除不再使用的 `ArrowRight` import。

## 文件

- 修改：`website/src/pages/Home.tsx`
- 报告：`.superpowers/sdd/2026-10-10-ai-slot-website-w0-execution/task-1-report.md`

## 基线

控制器已确认改动前官网 `npm run build` 与 `npm run test:agent` 通过，整站 lint 有 8 个既有通用 UI 错误。本地源代码基线中 Hero 主入口为 GitHub 链接、上方另有安装命令按钮，Demo section 没有 `#demo`。子代理的 Codex in-app browser 不支持可见标签（返回 `IAB visibility is not supported in a subagent thread`），因此无法进行可见 UI 的基线浏览；改动后的本地页面用仓库已有 Playwright/Chromium 完成行为与布局检查。

## 验收与命令结果

- `PATH=/Users/rong.zhu/.nvm/versions/node/v24.14.0/bin:$PATH npm run build`（`website/`）：通过，TypeScript 与 Vite 构建成功。
- `PATH=/Users/rong.zhu/.nvm/versions/node/v24.14.0/bin:$PATH npx eslint src/pages/Home.tsx`（`website/`）：通过，无 lint 输出。
- Playwright Chromium 本地验收（`http://127.0.0.1:3000/`）：英文主/次链接分别为 `#demo` 与 `#quickstart`；点击主按钮后 hash 为 `#demo`；切换中文后刷新仍保持中文，标题为 `AI-SLOT — 为已有网站接入 AI 局部更新`，中文主按钮存在且跳转 `#demo`；桌面 Tab 序列可到达两个 Hero CTA；390×844 下 `document.documentElement.scrollWidth === clientWidth === 390`。
- `git diff --check`：通过。

## 自审与限制

- 只修改任务指定的官网页面，报告是任务要求的交付文件。
- CTA 使用原有 `getStarted` 和 `t.nav.quickstart`，保留 Quick Start 现有锚点与语言持久化行为。
- 浏览器检查由无头 Playwright 执行，未完成可见浏览器的人工目视验收；代码和链接行为、语言刷新、键盘访问、移动宽度均已核对。
