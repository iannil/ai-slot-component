# @ai-slot/adapter-dom

DOM renderer adapter for [ai-slot-component](https://github.com/iannil/ai-slot-component#readme): map validated component trees to plain HTML elements — no framework required.

Text is always written via `textContent`, never `innerHTML`; unregistered components are skipped with a warning.

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
        /* write props onto the element */
      },
    },
  }),
);
```

## Docs

- [Root README](https://github.com/iannil/ai-slot-component#readme)

## License

MIT
