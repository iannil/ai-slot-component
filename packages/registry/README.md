# @ai-slot/registry

AI output protocol for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): declare the components a model may use, validate its component trees, and derive skeleton frames.

The model never writes HTML — it returns component-tree JSON whose component names must exist in your registry, validated against prop schemas, slot rules, depth and node-count limits before anything renders.

## Install

```bash
npm install @ai-slot/registry
```

## Usage

```ts
import { defineRegistry, validateComponentTree, deriveSkeleton } from "@ai-slot/registry";

// 1. Declare what the model is allowed to output
const registry = defineRegistry({
  components: {
    Banner: {
      description: "A hero banner",
      props: { title: "string", emphasis: "boolean" },
      required: ["title"],
      slots: ["default"],
    },
  },
});

// 2. Validate an untrusted model response (in the proxy AND again in the client)
const result = validateComponentTree(registry, modelOutput, { maxDepth: 8, maxNodes: 64 });
if (!result.ok) {
  // fall back to the original content — never render unvalidated output
}

// 3. Derive a skeleton frame from a final tree (for SSE streaming)
const skeleton = deriveSkeleton(tree);
```

Consumed by the proxy, the client runtime and build tooling — one shared contract, validated on both ends.

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)
- [Design spec](https://github.com/iannil/ai-slot-component/blob/master/docs/superpowers/specs/2026-09-24-ai-native-rendering-sdk-design.md)

## License

MIT
