export const domComponents = {
  "hero-banner": {
    tag: "section",
    class: "hero",
    applyProps: (el, props) => {
      const h1 = document.createElement("h1");
      h1.className = "hero-title";
      h1.textContent = String(props.title ?? "");
      const p = document.createElement("p");
      p.className = "hero-subtitle";
      p.textContent = String(props.subtitle ?? "");
      el.append(h1, p);
    },
  },
  "markdown-block": {
    tag: "div",
    class: "markdown",
    applyProps: (el, props) => {
      el.textContent = String(props.content ?? "");
    },
  },
};
