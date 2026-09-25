# @ai-slot/adapter-vue

Vue 3 renderer adapter for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): render validated component trees as real Vue components, plus an `<AiSlot>` wrapper around the Web Component.

## Install

```bash
npm install @ai-slot/adapter-vue
# peer dep: vue >= 3.4
```

## Usage

```ts
import { AiSlot, treeToVue } from "@ai-slot/adapter-vue";

// 1. Map component-tree nodes to your Vue components
const vnode = treeToVue({ Banner }, modelOutput);

// 2. Or use the wrapper — the default slot is the fallback
// <AiSlot name="hero" src="/ai-render/hero" stream>
//   <h1>Original content</h1>
// </AiSlot>
```

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)

## License

MIT
