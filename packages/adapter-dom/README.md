# @ai-slot/adapter-dom

DOM renderer adapter for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): map validated component trees to plain HTML elements — no framework required.

文本必须通过 `textContent` 写入，不要将 AI 内容交给 `innerHTML`；未注册组件会跳过并给出警告。命名槽位需要显式声明挂载点，未声明或指向组件外部时渲染会失败，运行时保留原始兜底内容。

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

`childrenTarget` 继续控制默认 `children` 的挂载位置；`slotTargets` 只处理对应的命名槽位。映射函数应返回组件元素本身或其后代。

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)

## License

MIT
