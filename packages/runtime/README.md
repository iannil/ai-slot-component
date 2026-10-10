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
  configureAiSlot({ registry, onFailure: (f) => console.debug(f) });
</script>
```

Element attributes: `src`, `name`, `renderer` (default `dom`), `editable`, `stream` (SSE skeleton → tree), `live` + `live-src` (invalidation push), `refresh-interval`, `fresh-only`.

卸载元素时，在途的加载结果会被忽略；同一实例重新挂载后会重新核对内容。`live` 通道每次成功连接也会核对一次，因此初次挂载的加载与连接后的核对可能并发读取，由最新一次加载结果决定显示内容。

`fresh-only` 是挂载前配置的可选管理内容边界：需先通过 `configureAiSlot({ registry })` 配置注册表，且服务端必须在通过校验的最终树响应 `meta.expiresAt` 中提供可信的 Unix 毫秒截止时间。缺失、非法、已过期或后续更新失败时，槽位恢复原始兜底；当前显示的树到期也会恢复。运行时使用访客本机时钟，并在页面重新可见时复核。后台标签页的定时器节流或错误的系统时钟可能延迟撤回，不能保证所有访客在截止毫秒立即消失。普通槽位保持原有行为，不要求期限元数据。属性和 `live` 一样应在挂载前配置。

Wire format APIs: `registerWireFormat(id, format)` / `unregisterWireFormat(id)` plug alternative wire formats into the fetch pipeline. Failures are observed via `onFailure` as `FetchFailure { stage: "http-non-ok" | "parse" | "validate" | "fetch-error", message }` — set it globally in `configureAiSlot` or per call on `fetchComponentTree`. The silent-fallback behavior never changes; the hook is observation only.

> Registration must happen synchronously in the same module graph that imports the runtime — custom element upgrade is synchronous.

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme) — full attribute table and framework examples

## License

MIT
