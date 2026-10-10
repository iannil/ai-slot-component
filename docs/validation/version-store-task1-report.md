# Task 1 实施报告：类型与不可变产物 hash

## 实现内容

- 新增私有 workspace 包 `@ai-slot/operations`，版本 `0.0.0`、Node `>=22`，配置 tsup/Vitest/TypeScript 脚本与 registry 的 Vitest 源码 alias。
- 按 brief 定义 V/G/M/I 统一领域类型及 `OperationError`；新增 canonical JSON 序列化和 SHA-256 hash。
- 新增 canonical 行为测试；离线安装依赖并更新 workspace lockfile。

## TDD 证据

- RED：`PATH=/Users/rong.zhu/.nvm/versions/node/v24.14.0/bin:$PATH pnpm --filter @ai-slot/operations test`。测试因 `./canonical.js` 模块缺失无法加载，符合先写行为测试再实现的预期。
- GREEN：同命令实现后通过，1 个测试文件、1/1 测试通过。

## 检查

- `PATH=... pnpm install --offline`：完成，lockfile 已更新。
- `PATH=... pnpm --filter @ai-slot/operations build`：成功，ESM 与 DTS 构建成功。
- `PATH=... pnpm --filter @ai-slot/operations typecheck`：成功。
- `git diff --check`：通过。

## 文件

新增 `packages/operations/{package.json,tsconfig.json,vitest.config.ts,src/{types.ts,canonical.ts,canonical.test.ts,index.ts}}`；修改 `pnpm-lock.yaml`。

## 自审与 concerns

实现遵循 brief 的字段名、校验规则和包配置，没有增加领域字段或存储行为。无遗留 concern。
