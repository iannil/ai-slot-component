import { defineRegistry } from "@ai-slot/registry";

export const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "页面顶部主视觉区",
      props: {
        title: { type: "string", maxLength: 60 },
        subtitle: { type: "string", maxLength: 120 },
      },
      required: ["title"],
    },
    "markdown-block": {
      description: "纯内容组件",
      props: { content: "string" },
      required: ["content"],
    },
  },
});
