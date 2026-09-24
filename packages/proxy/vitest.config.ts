import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-slot/registry": fileURLToPath(new URL("../registry/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "node", passWithNoTests: true },
});
