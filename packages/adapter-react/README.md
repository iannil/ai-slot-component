# @ai-slot/adapter-react

React renderer adapter for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): render validated component trees as real React components, plus an `<AiSlot>` wrapper around the Web Component.

## Install

```bash
npm install @ai-slot/adapter-react
# peer deps: react >= 18, react-dom >= 18
```

## Usage

```tsx
import { AiSlot, treeToReact } from "@ai-slot/adapter-react";

// 1. Map component-tree nodes to your React components
const tree = treeToReact({ Banner }, modelOutput);

// 2. Or use the wrapper — plain markup inside is the fallback
<AiSlot name="hero" src="/ai-render/hero" stream>
  <h1>Original content</h1>
</AiSlot>
```

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)

## License

MIT
