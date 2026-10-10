# AI-SLOT 官网质量修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除8项源码lint错误与.wrangler误扫，保持页面行为。

**Architecture:** 按实际消费关系拆出button/toggle样式工厂，其余仅移除未使用的非组件导出；骨架宽度改为稳定常量。保留React规则，不用全局关闭lint来通过。

**Tech Stack:** 现有ESLint9、React19、TypeScript、Vite。

**Spec:** [后续交付设计](../specs/2026-10-10-ai-slot-next-delivery-design.md)

## Global Constraints

- 文档与新增注释使用中文；既有英文用户文案按双语约定维护。
- 核心 SDK 保持 Node >= 18，不增加运行时依赖；新管理参考服务使用 Node >= 22，仅单进程、本地磁盘。
- AI 只提交结构化组件树 JSON；所有新交付路径校验注册表；不执行 AI 生成的 HTML/CSS/JS。
- CMS 是事实源，宿主拥有页面，AI-SLOT 仅管理授权槽位；首期只读数据源，不做双向同步。
- 保留原始兜底与 createAiRenderHandler 兼容；新管理服务为可选包，不替换现有公开 GET 数据入口。
- 正式站点沿用 aislot.dev；Git 主分支是 master，Cloudflare Pages 项目 aislot 的生产标识是 main。
- 不引入多租户、计费、通用调度、多实例存储或全平台插件矩阵；新包先 private，不随首轮 npm 发布。
- 官网公开文档 MCP 不增加写权限；管理 MCP 首期仅本地 stdio，远程 MCP 认证另立设计。
- 客户尚未落实；模拟数据、协议测试和自有测试站不能记作真实客户、付费或节省劳动证据。

---


## 文件职责

- `website/eslint.config.js`：仅排除构建产物。
- 新建 `website/src/components/ui/button-variants.ts`、`toggle-variants.ts`：原样保存对应cva函数。
- 修改 `button.tsx`、`toggle.tsx` 及 `calendar.tsx`、`pagination.tsx`、`alert-dialog.tsx`、`toggle-group.tsx`：引用新纯函数模块。
- 修改 `badge.tsx`、`button-group.tsx`、`form.tsx`、`navigation-menu.tsx`、`sidebar.tsx`：删除无外部使用的非组件导出，保留文件内调用。

### Task 1: 排除生成物与拆分混合导出

**Files:** 上述全部文件（sidebar随机宽度在Task2）。
**Interfaces:** Consumes `buttonVariants`、`toggleVariants` 的现有参数；Produces 相同函数，新的导入路径；内部UI模块不是npm公共API。

- [ ] 运行 `(cd website && npm run lint)` 保存失败结果；预期8源码错误，主目录还可能有.wrangler错误，数量不能写死为17。
- [ ] 将 `globalIgnores(['dist'])` 改为 `globalIgnores(['dist', '.wrangler'])`。
- [ ] 用下面一次性Python变换原样提取两个cva声明，不手写或更改类名；运行位置仓库根目录。

```python
from pathlib import Path
base=Path('website/src/components/ui')
for name, component in [('button','Button'),('toggle','Toggle')]:
    p=base/f'{name}.tsx'; text=p.read_text()
    start=text.index(f'const {name}Variants = cva(')
    end=text.index(f'\nfunction {component}(', start)
    declaration=text[start:end].strip().replace('const ', 'export const ', 1)
    (base/f'{name}-variants.ts').write_text('import { cva } from "class-variance-authority"\n\n'+declaration+'\n')
    text=text[:start]+text[end:]
    text=text.replace('import { cva, type VariantProps }', 'import { type VariantProps }')
    text=text.replace('import { cn }', f'import {{ {name}Variants }} from "./{name}-variants"\n\nimport {{ cn }}')
    text=text.replace(f'export {{ {component}, {name}Variants }}',f'export {{ {component} }}')
    p.write_text(text)
```

- [ ] 精确调整消费端：calendar保留 `import { Button } from "@/components/ui/button"`，另加 `import { buttonVariants } from "@/components/ui/button-variants"`；pagination保留 `import { type Button } from "@/components/ui/button"` 并另加同样variants导入；alert-dialog的buttonVariants改路径；toggle-group的toggleVariants改到 `@/components/ui/toggle-variants`。
- [ ] 在下列文件的**末尾export列表**删除指定标识（不删定义）：badge/badgeVariants、button-group/buttonGroupVariants、form/useFormField、navigation-menu/navigationMenuTriggerStyle、sidebar/useSidebar。先执行下方检索确认没有新增外部使用；发现新消费者时将函数及共享context移动独立模块并修改消费者，不允许删除被用导出。

```bash
rg -n 'badgeVariants|buttonGroupVariants|navigationMenuTriggerStyle|useFormField|useSidebar' website/src
cd website
npm run lint
```

预期此时只剩sidebar纯度1项。该步骤按已读基线只删除未使用的导出，若基线已改变应保持导出契约而非照抄删除。

- [ ] `(cd website && npm run build)` 通过，证明消费路径无丢失；`git diff --check`。
- [ ] 精确暂存上述UI文件及eslint配置，提交 `fix: 拆分官网样式导出并排除构建产物`。

### Task 2: 骨架渲染纯度与整体验收

**Files:** Modify `website/src/components/ui/sidebar.tsx`；Modify `website/README.md`。
**Interfaces:** Consumes `SidebarMenuSkeleton` 原props；Produces 同props、稳定70%宽度。

- [ ] `cd website && npm run lint`；预期仅 `Math.random` 渲染纯度失败。
- [ ] 将SidebarMenuSkeleton中对应注释与useMemo替换为：

```tsx
// 固定宽度避免渲染期间随机变化，并保持服务端与客户端一致。
const width = "70%"
```

- [ ] 运行 `npm run lint && npm run test:agent && npm run build`；预期0 lint error/warning、5项Agent测试通过、构建通过。保留故障用例预期日志，不能把它当生产错误。
- [ ] 在生产预览核对中英文首屏、CTA、390px溢出与现有演示；对本次低风险导出变更不增镜像实现的测试。
- [ ] README加入 `npm run lint` 开发验收命令；提交 `fix: 使官网骨架渲染保持纯函数`。

## 自审

8项源码错误分配：混合导出7项→Task1，随机宽度1项→Task2；生成物噪声→Task1。没有禁止react-refresh或react-hooks规则，没有增加新运行时依赖。
