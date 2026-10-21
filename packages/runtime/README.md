# @ai-slot/runtime

**English** | [简体中文](https://github.com/iannil/ai-slot-component/blob/master/packages/runtime/README.zh-CN.md)

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
  configureAiSlot({ registry, onFailure: (f) => console.debug(f) });
</script>
```

Element attributes: `src`, `name`, `renderer` (default `dom`), `editable`, `stream` (SSE skeleton → tree), `live` + `live-src` (invalidation push), `refresh-interval`, `fresh-only`.

When the element is disconnected, in-flight load results are ignored. Reconnecting the same instance triggers a content check. Every successful `live` connection also triggers a check, so the initial load and the connection check may read concurrently; the latest load determines what is displayed.

`fresh-only` is an optional boundary for managed content, configured before mounting. First configure the registry with `configureAiSlot({ registry })`; the server must provide a trusted Unix millisecond deadline in `meta.expiresAt` of the validated final-tree response. Missing, invalid, or expired deadlines, and failed subsequent updates, restore the original fallback. The currently displayed tree also falls back when it expires. The runtime uses the visitor’s local clock and rechecks when the page becomes visible again. Background-tab timer throttling or an incorrect system clock may delay removal; immediate removal at the deadline millisecond cannot be guaranteed for every visitor. Ordinary slots retain their existing behavior and do not require expiry metadata. Like `live`, configure this attribute before mounting.

Wire format APIs: `registerWireFormat(id, format)` / `unregisterWireFormat(id)` plug alternative wire formats into the fetch pipeline. Failures are observed via `onFailure` as `FetchFailure { stage: "http-non-ok" | "parse" | "validate" | "fetch-error", message }` — set it globally in `configureAiSlot` or per call on `fetchComponentTree`. The silent-fallback behavior never changes; the hook is observation only.

> Registration must happen synchronously in the same module graph that imports the runtime — custom element upgrade is synchronous.

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme) — full attribute table and framework examples

## License

MIT
