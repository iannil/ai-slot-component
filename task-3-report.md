# Task 3 实施报告：文案与演示边界

## 完成内容

- 更新 `website/src/pages/Home.tsx` 中中英文 demo、modes、safety 的指定说明字段，按 brief 精确替换文案。
- 更新 `website/src/demo/DemoSection.tsx` 中四步演示的中英文 hint 与完成标题/说明；步骤标题、控制按钮及演示状态机保持不变。
- 未改动 `backendFor`、订阅、DOM 更新或步骤推进行为。

## 验证

- `npx eslint src/pages/Home.tsx src/demo/DemoSection.tsx`：通过。
- `npm run build`：通过，Vite 生产构建完成。
- `npm run lint`：未通过。报告了 brief 指明的 8 个既有 UI 基线错误，均位于 `website/src/components/ui/`；改动文件 lint 已单独通过。
- 交互回归未完成：当前 worktree 无可导入的 Playwright 模块；尝试启动本地 Vite 后，浏览器访问显示空白页，且环境内 `curl http://127.0.0.1:3000/` 无法连接。因此无法可靠验证各行业及语言切换过程。源码检查确认只改了文案，未更改演示状态机。
- `git diff --check`：通过。

## 自审

改动范围仅限 brief 指定的两个源码文件和本报告；词典数组长度、字段结构未变。未发现文案替换以外的逻辑变化。

## 文件

- `website/src/pages/Home.tsx`
- `website/src/demo/DemoSection.tsx`
- `task-3-report.md`

## 限制

交互人工回归受本机浏览器/开发服务器连接问题阻挡，需在可访问本地开发服务器的环境补做。
