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
      // 演示区跑真实运行时：直接引用 monorepo 里已构建的 dist（需先 pnpm build）
      "@ai-slot/runtime": path.resolve(__dirname, "../packages/runtime/dist/index.js"),
      "@ai-slot/adapter-dom": path.resolve(__dirname, "../packages/adapter-dom/dist/index.js"),
      "@ai-slot/registry": path.resolve(__dirname, "../packages/registry/dist/index.js"),
    },
  },
});
