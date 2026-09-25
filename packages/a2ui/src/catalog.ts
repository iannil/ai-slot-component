import type { ComponentDefInput } from "@ai-slot/registry";
import type { DomComponentDef } from "@ai-slot/adapter-dom";

/**
 * Basic Catalog 18 组件的 DOM 定义（渲染侧）。零样式假设：类名仅作为用户 CSS 挂钩。
 * 用法：createDomRenderer({ ...basicCatalogDomDefs, ...myBrandDefs })
 */
export const basicCatalogDomDefs: Record<string, DomComponentDef> = {
  Text: {
    tag: "p",
    applyProps: (el, props) => {
      if (typeof props.text === "string") el.textContent = props.text;
    },
  },
  Image: {
    tag: "img",
    applyProps: (el, props) => {
      if (typeof props.url === "string") el.setAttribute("src", props.url);
      if (typeof props.alt === "string") el.setAttribute("alt", props.alt);
    },
  },
  Icon: {
    tag: "span",
    class: "a2ui-icon",
    applyProps: (el, props) => {
      if (typeof props.name === "string") el.dataset.icon = props.name;
    },
  },
  Video: {
    tag: "video",
    class: "a2ui-video",
    applyProps: (el, props) => {
      if (typeof props.url === "string") el.setAttribute("src", props.url);
      el.setAttribute("controls", "");
    },
  },
  AudioPlayer: {
    tag: "audio",
    class: "a2ui-audio",
    applyProps: (el, props) => {
      if (typeof props.url === "string") el.setAttribute("src", props.url);
      el.setAttribute("controls", "");
    },
  },
  Row: { tag: "div", class: "a2ui-row" },
  Column: { tag: "div", class: "a2ui-column" },
  List: { tag: "ul", class: "a2ui-list" },
  Card: { tag: "div", class: "a2ui-card" },
  Tabs: { tag: "div", class: "a2ui-tabs" },
  Divider: { tag: "hr" },
  Modal: { tag: "div", class: "a2ui-modal" },
  Button: {
    tag: "button",
    class: "a2ui-button",
    // action 已在解析层丢弃：内容槽位中是静态形态
    applyProps: (el) => el.setAttribute("type", "button"),
  },
  CheckBox: { tag: "label", class: "a2ui-checkbox" },
  TextField: {
    tag: "input",
    class: "a2ui-input",
    applyProps: (el) => el.setAttribute("type", "text"),
  },
  DateTimeInput: {
    tag: "input",
    class: "a2ui-input",
    applyProps: (el) => el.setAttribute("type", "datetime-local"),
  },
  ChoicePicker: { tag: "select", class: "a2ui-choice" },
  Slider: {
    tag: "input",
    class: "a2ui-slider",
    applyProps: (el) => el.setAttribute("type", "range"),
  },
};

/**
 * 同名组件的宽松注册表定义（校验侧）。全部 props 可选、无 required。
 * 没有它，客户端双保险校验会用用户自己的 registry 拒掉未映射的基础组件名。
 * 布局容器必须声明 slots: ["default"]，children 才能过校验。
 * 用法：defineRegistry({ components: { ...basicCatalogComponentDefs, ...myComponents } })
 */
export const basicCatalogComponentDefs: Record<string, ComponentDefInput> = {
  Text: { description: "A2UI basic catalog: text", props: { text: "string", variant: "string", usageHint: "string" } },
  Image: { description: "A2UI basic catalog: image", props: { url: "string", alt: "string", fit: "string" } },
  Icon: { description: "A2UI basic catalog: icon", props: { name: "string" } },
  Video: { description: "A2UI basic catalog: video", props: { url: "string" } },
  AudioPlayer: { description: "A2UI basic catalog: audio", props: { url: "string" } },
  Row: { description: "A2UI basic catalog: horizontal layout", props: { justify: "string", align: "string" }, slots: ["default"] },
  Column: { description: "A2UI basic catalog: vertical layout", props: { align: "string" }, slots: ["default"] },
  List: { description: "A2UI basic catalog: list", slots: ["default"] },
  Card: { description: "A2UI basic catalog: card container", slots: ["default"] },
  Tabs: { description: "A2UI basic catalog: tabs", slots: ["default"] },
  Divider: { description: "A2UI basic catalog: divider", props: { axis: "string" } },
  Modal: { description: "A2UI basic catalog: modal", slots: ["default"] },
  Button: { description: "A2UI basic catalog: button (static in content slots)", props: { label: "string", variant: "string" }, slots: ["default"] },
  CheckBox: { description: "A2UI basic catalog: checkbox", props: { label: "string" } },
  TextField: { description: "A2UI basic catalog: text field", props: { label: "string", value: "string", placeholder: "string" } },
  DateTimeInput: { description: "A2UI basic catalog: date/time input", props: { label: "string" } },
  ChoicePicker: { description: "A2UI basic catalog: choice picker", props: { label: "string" }, slots: ["default"] },
  Slider: { description: "A2UI basic catalog: slider", props: { min: "number", max: "number", value: "number" } },
};
