# @ai-slot/runtime

Zero-dependency `<ai-slot>` Web Component runtime for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): wrap existing markup, fetch a validated component tree from the proxy, and render it through a registered adapter — with a guaranteed fallback to your original content.

## Install

```bash
npm install @ai-slot/runtime
```

## Usage

```html
<ai-slot name="hero" src="/ai-render/hero" editable stream live>
  <h1>Original content — stays in the page as the fallback</h1>
</ai-slot>

<script type="module">
  import { configureAiSlot, registerRenderer } from "@ai-slot/runtime";
  import { createDomRenderer } from "@ai-slot/adapter-dom";

  registerRenderer("dom", createDomRenderer(components));
  configureAiSlot({ registry });
</script>
```

Element attributes: `src`, `name`, `renderer` (default `dom`), `editable`, `stream` (SSE skeleton → tree), `live` + `live-src` (invalidation push), `refresh-interval`.

> Registration must happen synchronously in the same module graph that imports the runtime — custom element upgrade is synchronous.

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme) — full attribute table and framework examples

## License

MIT
