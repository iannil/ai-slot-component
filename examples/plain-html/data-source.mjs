import { readFile } from "node:fs/promises";
import { createRenderHandler } from "@ai-slot/proxy";
import { registry } from "./registry.mjs";

/** 数据源必须返回一致的版本与内容快照；这里只读展示字段。 */
export function createDataHandler(readSource) {
  return createRenderHandler({
    registry, registryVersion: "1", namespace: "plain-html-data",
    resolveSlot: async id => {
      if (id !== "data-hero") return null;
      const data = await readSource();
      if (typeof data.version !== "string" || typeof data.title !== "string") throw new Error("数据源格式错误");
      return { slotId: id, originalContent: "原始产品介绍", contentVersion: data.version, data: { title: data.title } };
    },
    provider: { id: "hero-map-v1", produce: ({ slot }) => ({ component: "hero-banner", props: { title: slot.data.title } }) },
  });
}

export const dataHandler = createDataHandler(async () =>
  JSON.parse(await readFile(new URL("./cms-data.json", import.meta.url), "utf8")));
