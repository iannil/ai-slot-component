# @ai-slot/registry

[English](https://github.com/iannil/ai-slot-component/blob/master/packages/registry/README.md) | **简体中文**

[ai-slot-component](https://github.com/iannil/ai-slot-component#readme) 的 AI 输出协议：声明模型可用的组件、校验组件树，并推导骨架帧。

模型只返回组件树 JSON，绝不输出 HTML。组件名必须存在于注册表中，并在渲染前通过 props Schema、槽位规则、深度及节点数量限制的校验。

## 安装

```bash
npm install @ai-slot/registry
```

## 用法

```ts
import { defineRegistry, validateComponentTree, deriveSkeleton } from "@ai-slot/registry";

// 1. 声明模型允许输出的内容
const registry = defineRegistry({
  components: {
    Banner: {
      description: "首屏横幅",
      props: { title: "string", emphasis: "boolean" },
      required: ["title"],
      slots: ["default"],
    },
  },
});

// 2. 校验不可信的模型响应（代理和客户端均需校验）
const result = validateComponentTree(registry, modelOutput, { maxDepth: 8, maxNodes: 64 });
if (!result.ok) {
  // 回退到原始内容，绝不渲染未经校验的输出
}

// 3. 从最终树推导骨架帧（用于 SSE 流式响应）
const skeleton = deriveSkeleton(tree);
```

代理、客户端运行时和构建工具共用同一份契约，在服务端与客户端两端校验。

## 文档

- [项目介绍](https://github.com/iannil/ai-slot-component#readme)
- [设计文档](https://github.com/iannil/ai-slot-component/blob/master/docs/superpowers/specs/2026-09-24-ai-native-rendering-sdk-design.md)

## 许可证

MIT
