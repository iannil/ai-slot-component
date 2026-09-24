import { fetchComponentTree } from "@ai-slot/runtime";
import type { ComponentNode, Registry } from "@ai-slot/registry";
import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from "vue";
import { treeToVue, type VueComponentMap } from "./tree-to-vue.js";

/** Vue 版 <ai-slot>：任何失败静默保留默认 slot（fallback），语义与 Web Component 一致。 */
export const AiSlot = defineComponent({
  name: "AiSlot",
  props: {
    src: { type: String, required: true },
    components: { type: Object as PropType<VueComponentMap>, required: true },
    registry: { type: Object as PropType<Registry | undefined>, default: undefined },
    editable: { type: Boolean, default: false },
    refreshInterval: { type: Number, default: 0 },
  },
  setup(props, { slots }) {
    const tree = ref<ComponentNode | null>(null);
    const prompt = ref("");
    let seq = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load(userPrompt?: string): Promise<void> {
      const mySeq = ++seq;
      const next = await fetchComponentTree({ src: props.src, userPrompt, registry: props.registry });
      if (!next) return;
      if (mySeq !== seq) return; // 丢弃过期响应
      tree.value = next;
    }

    function restore(): void {
      seq += 1; // 使在途响应失效
      tree.value = null;
    }

    onMounted(() => {
      void load();
      if (props.refreshInterval > 0) {
        timer = setInterval(() => void load(), props.refreshInterval * 1000);
      }
    });
    onUnmounted(() => clearInterval(timer));

    function onSubmit(event: Event): void {
      event.preventDefault();
      const value = prompt.value.trim();
      if (value) void load(value);
    }

    // 根节点用 display:contents 的 span：h("template") 会创建真实 <template> 元素，
    // 浏览器 UA 样式 template{display:none} 会把 AI 内容整棵隐藏（jsdom 不应用 UA 样式，单测测不出来）
    return () =>
      h("span", { style: "display: contents" }, [
        tree.value ? treeToVue(props.components, tree.value) : (slots.default?.() ?? null),
        props.editable
          ? h("form", { class: "ai-slot-editor", onSubmit }, [
              h("input", {
                name: "prompt",
                maxlength: 500,
                placeholder: "用一句话调整这个区域…",
                value: prompt.value,
                onInput: (e: Event) => {
                  prompt.value = (e.target as HTMLInputElement).value;
                },
              }),
              h("button", { type: "submit" }, "应用"),
              h("button", { type: "button", onClick: restore }, "恢复默认"),
            ])
          : null,
      ]);
  },
});
