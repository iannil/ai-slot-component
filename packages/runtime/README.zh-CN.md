# @ai-slot/runtime

[English](https://github.com/iannil/ai-slot-component/blob/master/packages/runtime/README.md) | **简体中文**

[ai-slot-component](https://github.com/iannil/ai-slot-component#readme) 的 `<ai-slot>` Web Component 运行时：包裹原有标记，从代理获取经过校验的组件树，再由已注册的适配器渲染；失败时回退到原始内容。

## 安装

```bash
npm install @ai-slot/runtime
```

## 用法

```html
<ai-slot name="hero" src="/ai-render/hero" editable stream live>
  <h1>原始内容，保留在页面中作为兜底</h1>
</ai-slot>

<script type="module">
  import { configureAiSlot, registerRenderer } from "@ai-slot/runtime";
  import { createDomRenderer } from "@ai-slot/adapter-dom";

  registerRenderer("dom", createDomRenderer(components));
  configureAiSlot({ registry, onFailure: (f) => console.debug(f) });
</script>
```

元素属性：`src`、`name`、`renderer`（默认 `dom`）、`editable`、`stream`（SSE 骨架 → 终树）、`live` + `live-src`（失效推送）、`refresh-interval`、`fresh-only`。

卸载元素时，在途的加载结果会被忽略；同一实例重新挂载后会重新核对内容。`live` 通道每次成功连接也会核对一次，因此初次挂载的加载与连接后的核对可能并发读取，由最新一次加载结果决定显示内容。

`fresh-only` 是挂载前配置的可选管理内容边界：需先通过 `configureAiSlot({ registry })` 配置注册表，且服务端必须在通过校验的最终树响应 `meta.expiresAt` 中提供可信的 Unix 毫秒截止时间。缺失、非法、已过期或后续更新失败时，槽位恢复原始兜底；当前显示的树到期也会恢复。运行时使用访客本机时钟，并在页面重新可见时复核。后台标签页的定时器节流或错误的系统时钟可能延迟撤回，不能保证所有访客在截止毫秒立即消失。普通槽位保持原有行为，不要求期限元数据。属性和 `live` 一样应在挂载前配置。

传输格式 API：`registerWireFormat(id, format)` / `unregisterWireFormat(id)` 可将其他传输格式接入请求流水线。通过 `onFailure` 观测失败，类型为 `FetchFailure { stage: "http-non-ok" | "parse" | "validate" | "fetch-error", message }`；可在 `configureAiSlot` 中全局配置，也可在每次 `fetchComponentTree` 调用中配置。该钩子仅用于观测，不改变静默回退行为。

> 注册必须在导入 runtime 的同一个模块图中同步完成，因为自定义元素升级是同步的。

## 文档

- [项目介绍](https://github.com/iannil/ai-slot-component#readme) — 完整属性表和框架示例

## 许可证

MIT
