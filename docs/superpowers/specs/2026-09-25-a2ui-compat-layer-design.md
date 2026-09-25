# A2UI 兼容层（wire format 适配）— 设计文档

日期：2026-09-25
状态：设计已经用户确认（方案 A：外挂兼容层 + 通用扩展点）
前置文档：`2026-09-24-ai-native-rendering-sdk-design.md`（总体设计，本设计不改变其任何不变量）

## 1. 背景与目标

Google A2UI（2025-12 开源，v0.9.1 为官方 Current、v1.0 为 Candidate）与本项目共享同一安全思想——agent 只输出声明式组件树、渲染到可信组件目录。但两者定位不同：A2UI 面向「agent ↔ 应用内 UI」的协议标准化；本项目的定位是「存量网页内容槽位的交付层」（渐进增强、SEO 保证、内容生命周期）。

本设计的差异化战略：**不与 A2UI 争协议，让 ai-slot 成为「A2UI 到存量 Web 的交付层」**。落地为三件事：

1. **双向兼容层**：runtime 可消费任意 A2UI 端点的输出；`@ai-slot/proxy` 的产出可被重写为 A2UI 格式（proxy 本身零改动）。
2. **定位内容**：README「Protocol-neutral by design」小节 + 对比表；英文定位博客草稿。
3. **文档一致性**：CLAUDE.md 架构图纳入新包。

### 已确认的约束

- **安全边界与渲染管线零改动**：A2UI 解析只是给现有 `validateComponentTree → renderTree → 静默兜底` 管线多喂一种输入；所有失败路径沿用「静默回退兜底内容」不变量。
- **协议中立是叙事的一部分**：`registry`（无依赖协议核心）、`runtime`（零依赖）、`proxy` 均不知道 A2UI 存在；A2UI 知识全部住在新包 `@ai-slot/a2ui`，通过两个**通用扩展点**接入（wire format 注册 ≍ 现有 renderer 注册模式）。
- 依赖方向：`a2ui → registry / adapter-dom`（类型与校验），永不反向。

## 2. 事实基础（2026-09-25 实测 a2ui-project/a2ui 仓库）

| 事实 | 依据 | 对设计的影响 |
|------|------|--------------|
| 信封为 `messages[]` 数组，元素 `{ version, createSurface \| updateComponents \| updateDataModel \| ... }` | v1.0 规范 + basic catalog 示例 | detect 判据：顶层 `messages` 数组或含 `createSurface`/`updateComponents` 键 |
| 组件为**扁平邻接表**：`{ id, component, children: [id...], ...props }` | 同上 | 需要 adjacency → 嵌套树转换，含孤儿/环/重复 id 检测 |
| v0.9 与 v1.0 信封结构一致，组件名随目录变化（`MaterialCard` vs `Card`） | v0.9 示例 confirmation.json vs v1.0 示例 | version 字段宽松校验；组件名映射必须可配置 |
| Basic Catalog 18 组件：Text、Image、Icon、Video、AudioPlayer、Row、Column、List、Card、Tabs、Divider、Modal、Button、CheckBox、TextField、DateTimeInput、ChoicePicker、Slider | v1.0 规范 Basic Component Catalog 节 | 内置 DOM 降级映射的清单上限 |
| 数据模型绑定（`{"path": "/title"}`）、动作系统、双向流为协议一等公民 | v1.0 规范 data model / actions 节 | 内容槽位场景用不上 → 明确降级语义（见 §5） |
| A2UI 无服务端组件、无 SEO/fallback 概念、遗留内容仅 iframe 隔离 | README + v1.0 规范 | 定位内容的对比表依据（只在文档使用，不影响代码） |
| HTTP 请求-响应为官方传输之一 | v1.0 规范 Transport Interaction Patterns | 「任意 A2UI 端点 → `<ai-slot src>`」成立 |

## 3. 总体架构

```
                     ┌────────────────────────────────────────┐
A2UI agent 端点 ──→  │ detect → parse                          │──→ validateComponentTree ──→ renderTree
                     │ （信封 → 邻接表 → 嵌套树 + mappings 改名）│    （现有校验，零改动）        （现有渲染器，零改动）
                     └────────────────────────────────────────┘
                              任一步失败 → 静默兜底（现有语义，零改动）

<ai-slot> 内嵌套树 ──→ toA2uiMessages（@ai-slot/a2ui）──→ createSurface + updateComponents
createAiRenderHandler 的 Response ──→ withA2uiOutput 高阶函数重写（JSON 与 SSE 双帧）──→ A2UI messages
```

数据流不变量：**消费侧**，A2UI 输入经过与原生输入完全相同的校验（registry 白名单、props Schema、slots 合法性、深度/节点数上限）与渲染路径；**生产侧**，重写是纯函数式的响应体变换，不触碰缓存/限流/校验逻辑。

## 4. 组件设计

### 4.1 runtime wire 扩展点（`packages/runtime/src/wire.ts`，新文件，约 40 行）

```ts
import type { ComponentNode } from "@ai-slot/registry";

export interface WireFormat {
  /** 结构检测：该已解析 JSON 是否为此格式。纯函数，不得抛异常。 */
  detect(data: unknown): boolean;
  /** 解析为内部组件树；任何失败返回 null，调用方据此静默兜底。 */
  parse(data: unknown): ComponentNode | null;
}

export function registerWireFormat(id: string, format: WireFormat): void;
```

- 注册表为模块级 `Map<string, WireFormat>`，与 `registerRenderer` 同构；检测按注册顺序，首个 `detect` 命中者生效。
- `fetch-tree.ts` 的唯一改动：`res.json()` 之后、以及 SSE 每个 `data:` 帧解析之后，**先**逐一探测已注册 wire formats，命中则 `parse`；全部不命中走原生 `AiRenderResponse` 路径（现状不变）。`parse` 结果照旧过 `validateComponentTree`（客户端双保险不变）。
- 未导入任何 wire 包时，行为与今天完全一致（不注册即不存在）。

### 4.2 新包 `@ai-slot/a2ui`

```
packages/a2ui/
  package.json      — dependencies: @ai-slot/registry；@ai-slot/adapter-dom 以
                      peerDependency + type-only import 引用（仅 DomComponentDef 类型）
  src/
    types.ts        — A2UI 信封类型（version: string，宽松；createSurface/updateComponents）
    adjacency.ts    — 邻接表 → 嵌套树转换
    wire.ts         — a2uiWireFormat: { detect, parse }；导入时用户自行调用
                      registerWireFormat("a2ui", a2uiWireFormat)
    catalog.ts      — basicCatalogDomDefs: Record<string, DomComponentDef>
    output.ts       — toA2uiMessages(tree, opts) / withA2uiOutput(handler, opts)
    index.ts        — 公共导出
  vitest.config.ts  — @ai-slot/registry、@ai-slot/adapter-dom 源码别名（CLAUDE.md 跨包测试约定）
```

各文件职责与关键规则：

**types.ts**：只声明本包消费的信封结构。`version` 接受 `"v0.9"` / `"v0.9.1"` / `"v1.0"`（宽松校验，未知版本同样接受——信封结构一致时语义不变，交给测试 fixture 锁定）。

**adjacency.ts**：输入 `components: {id, component, children?, ...}[]`，输出嵌套 `ComponentNode`。规则：
- 根 = 恰好一个入度为 0 的组件；0 个或多个 → 判 null（整体兜底）。
- `children` 引用不存在的 id（孤儿）、重复 id、环 → 判 null。
- 节点数/深度上限不在本层重复实现——转换结果交由 `validateComponentTree` 统一把关。
- `slots`（ai-slot 命名槽位概念）在 A2UI 无对应物：邻接表顺序即 children 顺序（限制记入 README，非缺陷修复项）。

**wire.ts**（消费侧核心）：对外导出工厂 `createA2uiWireFormat(opts?: { mappings?: Record<string, string> })`（返回满足 runtime `WireFormat` 接口的闭包，配置进闭包）与免配置默认值 `a2uiWireFormat`。
- `detect(data)`：`data` 为对象且（含 `messages` 数组）或（含 `createSurface` 或 `updateComponents` 键）→ true。该判据与原生 `AiRenderResponse {version:1, slot, tree}` 结构不重叠；专项测试钉死原生格式不被误判。
- `parse(data)`：
  - 抽取 `messages`（或单信封对象）中的 `createSurface` 与全部 `updateComponents`，按序增量合并：同 id 组件后帧覆盖；取首个 surface（多 surface 时其余忽略）；出现 `deleteSurface` 指向所选 surface → 视为内容被撤，判 null（兜底）。
  - `opts.mappings?: Record<string, string>`（A2UI 组件名 → 注册表组件名，优先级最高）。
  - 邻接表 → 嵌套树（adjacency.ts）。
  - 名字改写：`mappings` 命中 → 注册表组件名；未命中 → 保留原名（交给渲染器的 defs 表，见 catalog.ts）。**不静默丢弃未映射组件**——渲染器对未注册组件已有「跳过并警告」行为（adapter-dom 语义），本层不重复。
  - 绑定降级：prop 值为 `{ path: ... }` 形态 → 视为该 prop **缺失**；required prop 缺失由现有 validator 拒绝 → 兜底。不造假值。
  - 交互降级：`action` 字段直接丢弃（内容槽位无 agent 回程）；Button 等仍可渲染为静态形态。
- parse 输出**不**内嵌校验；校验由 runtime 管线统一执行（单一职责）。

**catalog.ts**：两个静态表，解决同一问题的两侧：
- `basicCatalogDomDefs: Record<string, DomComponentDef>` —— 渲染侧。Basic Catalog 18 组件的 DOM 定义；映射规则：语义化 HTML 元素优先（Text→`p`、Image→`img`、Row→`div` + flex 类、Card→`div.a2ui-card`…），类名一律 `a2ui-` 前缀，**零样式假设**（不带内置 CSS）。逐组件映射表在实现计划中列出。
- `basicCatalogComponentDefs: Record<string, ComponentDefInput>` —— 校验侧。同名组件的宽松 registry 定义（props Schema 覆盖 Text/Image/Button 等常用字段，全部可选、无 required）。**没有它，客户端双保险校验会用用户自己的 registry 拒掉未映射的基础组件名**，纯 A2UI 端点开箱即坏；这是组合可用的前提。

两者都是**显式组合**，无自动注册：

```ts
const registry = defineRegistry({ components: { ...basicCatalogComponentDefs, ...myComponents } });
createDomRenderer({ ...basicCatalogDomDefs, ...myBrandDefs });
```

**output.ts**（生产侧）：
- `toA2uiMessages(tree: ComponentNode, opts: { surfaceId: string; version?: string; includeSurface?: boolean })`：嵌套树 → messages；id 自动生成（`n0`、`n1`…）；`slots` 命名槽位内容按序并入 children。`includeSurface` 默认 true（产出 `[createSurface, updateComponents]`）。
- `withA2uiOutput(handler, opts)`：包住 `(Request) => Promise<Response>`；对 JSON 响应体 `AiRenderResponse` 重写为 `[createSurface, updateComponents(终树)]`；对 SSE 响应逐帧重写 `data:` 体（`event:` 名与帧结构不变）：`skeleton` 帧 → `[createSurface, updateComponents(骨架树)]`，`tree` 帧 → `[updateComponents(终树)]`（surface 首帧已建，不重复 create）。非 `application/json` 且非 SSE 的响应原样透传。

### 4.3 依赖与构建

- tsup ESM 输出，与其余包一致；`pnpm build`/`test`/`typecheck` 全链路纳入。
- 发布清单（`pnpm publish`）沿用现有流程；**是否发布新版本由用户在实现完成后单独决定，不在本设计范围内**。

## 5. 错误处理（全部路径 = 现有「静默兜底」不变量）

| 场景 | 行为 |
|------|------|
| A2UI 包未导入，响应恰为 A2UI 格式 | detect 阶段无注册格式 → 原生路径解析 → `data.tree` 不存在 → null → 兜底 |
| 信封畸形 / 邻接表孤儿 / 环 / 重复 id / 多根 | parse 返回 null → 兜底 |
| mappings 后组件名不在 registry | validator 拒绝 → 兜底 |
| 绑定型 prop 落在 required 上 | validator 拒绝 → 兜底 |
| detect 误判（理论上不可能） | 兜底语义仍在，最坏情况退化为「该响应被当作损坏」——不白屏、不报错 |
| `withA2uiOutput` 遇到未知响应形态 | 原样透传，不修改 |

## 6. 测试策略（按项目既定优先级：对抗样例优先）

1. **官方 fixture 回放**：`fixtures/` 收录 A2UI 仓库真实示例——`00_simple-text.json`、`00_row-layout.json`（v1.0）、`confirmation.json`（v0.9）。
2. **对抗样例**：孤儿引用、环、重复 id、0/多根、空 messages、未知 version、绑定-only props、超深度/超节点数（借 validator 上限）、原生格式误判尝试、畸形信封。
3. **往返等价**：`tree → toA2uiMessages → parse → tree` 结构等价（同时锁死生产侧与消费侧语义）。
4. **runtime jsdom 集成**：未注册 wire → A2UI 响应落兜底；注册后 → 正常渲染、registry 校验拦截非法组件名、mappings 生效。
5. **withA2uiOutput**：JSON 响应与 SSE 双帧（`skeleton`/`tree`）两种形态的重写正确性 + 未知形态透传。
6. **runtime wire 扩展点单测**：注册顺序、detect 抛异常时的容错（按「未命中」处理）、重复注册覆盖语义（后注册覆盖同 id）。

## 7. 文档变更

1. **README.md / README.zh-CN.md**：
   - 新增「Protocol-neutral by design」小节：三层叙事（slot protocol / delivery runtime / lifecycle infrastructure），说明 A2UI 是 slot protocol 的第一个外部实现；
   - 对比表（协议定位 / 存量页面 / SEO / 生命周期，只陈述 §2 中已核验事实）；
   - Quick Start 增加 A2UI 消费示例（≤10 行：`registerWireFormat` + `basicCatalogDomDefs`）；
   - 安装清单加入 `@ai-slot/a2ui`。
2. **`docs/blog/2026-09-25-a2ui-on-the-existing-web.md`**：英文定位博客草稿（约 1500 词）：A2UI 是什么（引规范原文）→ 结构上不覆盖的四件事 → 「存量 Web 交付层」定位 → 可运行示例 → 对比表。文末标注「草稿，未发布」。发布行为不在本轮范围。
3. **CLAUDE.md**：架构图加 `a2ui` 包一行（可选兼容层，依赖 registry/adapter-dom，不反向）；「六个包」表述同步更新。

## 8. 明确不做（YAGNI）

- 不实现 A2UI 数据模型绑定、动作回程、双向流、增量渲染（内容槽位场景无此需求）。
- 不做 wire format 自动发现/远程目录拉取。
- 不改 `proxy`、`registry`、`adapter-*` 任何现有代码（runtime 仅加扩展点文件与 fetch-tree 接入）。
- 不发布博客、不向 A2UI 官方仓库提 PR、不发 npm 新版本（完成后单独决定）。
- 不写独立架构白皮书（README 小节 + 博客草稿已承载三层叙事）。

## 9. 验收标准

1. `pnpm build && pnpm test && pnpm typecheck` 全绿（新增包纳入全链路）。
2. 用 A2UI 官方示例 fixture 作为 `<ai-slot src>` 响应，e2e 语义（jsdom 层）验证：正常渲染、非法输入兜底、原生响应不受影响。
3. `tree → A2UI messages → parse → tree` 往返等价测试通过。
4. README 双语、博客草稿、CLAUDE.md 三处文档落盘且相互一致。
