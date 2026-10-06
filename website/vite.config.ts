import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 演示区跑真实运行时：直接引用 monorepo 包源码，无需先 pnpm build（静态托管构建也能跑）
      "@ai-slot/runtime": path.resolve(__dirname, "../packages/runtime/src/index.ts"),
      "@ai-slot/adapter-dom": path.resolve(__dirname, "../packages/adapter-dom/src/index.ts"),
      "@ai-slot/registry": path.resolve(__dirname, "../packages/registry/src/index.ts"),
    },
  },
});
