# @ai-slot/a2ui

**English** | [简体中文](https://github.com/iannil/ai-slot-component/blob/master/packages/a2ui/README_zh-CN.md)

[A2UI](https://github.com/a2ui-project/a2ui) wire-format compatibility for ai-slot.

- **Consume** — parse A2UI `messages` envelopes (v0.9 / v0.9.1 / v1.0) into validated ai-slot component trees: `a2uiWireFormat` / `createA2uiWireFormat({ mappings })`.
- **Produce** — rewrite ai-slot proxy responses (JSON or SSE) as A2UI messages: `withA2uiOutput(handler, { surfaceId })`.
- **Basic Catalog** — ready-made tables for the 18 standard A2UI components: `basicCatalogDomDefs` (rendering) and `basicCatalogComponentDefs` (validation).

All parsing failures degrade to `null` — the host `<ai-slot>` silently keeps its fallback content. See the root README for the full picture.

## Install

```bash
npm install @ai-slot/a2ui @ai-slot/runtime @ai-slot/adapter-dom
```

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)

## License

MIT
