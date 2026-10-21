# @ai-slot/adapter-react

[English](https://github.com/iannil/ai-slot-component/blob/master/packages/adapter-react/README.md) | **简体中文**

[ai-slot-component](https://github.com/iannil/ai-slot-component#readme) 的 React 渲染适配器：将已校验的组件树渲染为真实 React 组件，并提供 Web Component 的 `<AiSlot>` 包装组件。

## 安装

```bash
npm install @ai-slot/adapter-react
# 同级依赖：react >= 18、react-dom >= 18
```

## 用法

```tsx
import { AiSlot, treeToReact } from "@ai-slot/adapter-react";

// 1. 将组件树节点映射为你的 React 组件
const tree = treeToReact({ Banner }, modelOutput);

// 2. 或使用包装组件，内部普通标记作为兜底内容
<AiSlot name="hero" src="/ai-render/hero" stream>
  <h1>原始内容</h1>
</AiSlot>
```

## 文档

- [项目介绍](https://github.com/iannil/ai-slot-component#readme)

## 许可证

MIT
