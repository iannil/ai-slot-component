# @ai-slot/adapter-dom

**English** | [简体中文](https://github.com/iannil/ai-slot-component/blob/master/packages/adapter-dom/README_zh-CN.md)

DOM renderer adapter for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): map validated component trees to plain HTML elements — no framework required.

Write text through `textContent`; never pass AI content to `innerHTML`. Unregistered components are skipped with a warning. Named slots require explicit mount targets. If a target is missing or points outside the component, rendering fails and the runtime keeps the original fallback content.

## Install

```bash
npm install @ai-slot/adapter-dom
```

## Usage

```ts
import { registerRenderer } from "@ai-slot/runtime";
import { createDomRenderer } from "@ai-slot/adapter-dom";

registerRenderer(
  "dom",
  createDomRenderer({
    Banner: {
      tag: "section",
      class: "hero",
      applyProps: (el, props) => {
        const header = document.createElement("header");
        const main = document.createElement("main");
        const title = document.createElement("h2");
        title.textContent = String(props.title ?? "");
        header.appendChild(title);
        el.append(header, main);
      },
      childrenTarget: (el) => el.querySelector("main") as HTMLElement,
      slotTargets: {
        header: (el) => el.querySelector("header") as HTMLElement,
        body: (el) => el.querySelector("main") as HTMLElement,
      },
    },
  }),
);
```

`childrenTarget` controls where default `children` mount; `slotTargets` handles the corresponding named slots only. Each target function must return the component element itself or one of its descendants.

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)

## License

MIT
