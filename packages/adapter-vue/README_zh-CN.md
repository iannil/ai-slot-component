# @ai-slot/adapter-vue

[English](https://github.com/iannil/ai-slot-component/blob/master/packages/adapter-vue/README.md) | **简体中文**

[ai-slot-component](https://github.com/iannil/ai-slot-component#readme) 的 Vue 3 渲染适配器：将已校验的组件树渲染为真实 Vue 组件，并提供 Web Component 的 `<AiSlot>` 包装组件。

## 安装

```bash
npm install @ai-slot/adapter-vue
# 同级依赖：vue >= 3.4
```

## 用法

```ts
import { AiSlot, treeToVue } from "@ai-slot/adapter-vue";

// 1. 将组件树节点映射为你的 Vue 组件
const vnode = treeToVue({ Banner }, modelOutput);

// 2. 或使用包装组件，默认槽位作为兜底内容
// <AiSlot name="hero" src="/ai-render/hero" stream>
//   <h1>原始内容</h1>
// </AiSlot>
```

## 文档

- [项目介绍](https://github.com/iannil/ai-slot-component#readme)

## 许可证

MIT
