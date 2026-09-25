import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-slot/registry": fileURLToPath(new URL("../registry/src/index.ts", import.meta.url)),
      "@ai-slot/runtime": fileURLToPath(new URL("../runtime/src/index.ts", import.meta.url)),
      "@ai-slot/adapter-dom": fileURLToPath(new URL("../adapter-dom/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "jsdom", passWithNoTests: true },
});
