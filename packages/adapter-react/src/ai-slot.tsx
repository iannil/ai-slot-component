import type { ComponentNode, Registry } from "@ai-slot/registry";
import { fetchComponentTree } from "@ai-slot/runtime";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { treeToReact, type ReactComponentMap } from "./tree-to-react.js";

export interface AiSlotProps {
  src: string;
  components: ReactComponentMap;
  /** 提供时渲染前对 AI 输出再校验一次 */
  registry?: Registry;
  editable?: boolean;
  /** 首屏与降级内容（对应 WC 的 light DOM 兜底） */
  fallback: ReactNode;
  /** 轮询间隔（秒），>0 时生效 */
  refreshInterval?: number;
}

/**
 * React 版 <ai-slot>：任何失败静默保留 fallback，语义与 Web Component 一致。
 * `registry` 应为模块级常量或经 useMemo 稳定化——内联字面量会因引用变化触发重复加载。
 */
export function AiSlot(props: AiSlotProps): ReactElement {
  const [tree, setTree] = useState<ComponentNode | null>(null);
  const [prompt, setPrompt] = useState("");
  const seqRef = useRef(0);

  const load = useCallback(
    async (userPrompt?: string) => {
      const seq = ++seqRef.current;
      const next = await fetchComponentTree({ src: props.src, userPrompt, registry: props.registry });
      if (!next) return;
      if (seq !== seqRef.current) return; // 丢弃过期响应
      setTree(next);
    },
    [props.src, props.registry],
  );

  useEffect(() => {
    void load();
    if (props.refreshInterval && props.refreshInterval > 0) {
      const timer = setInterval(() => void load(), props.refreshInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [load, props.refreshInterval]);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const value = prompt.trim();
    if (value) void load(value);
  };

  const restore = (): void => {
    seqRef.current += 1; // 使在途响应失效
    setTree(null);
  };

  return (
    <>
      {tree ? treeToReact(props.components, tree) : props.fallback}
      {props.editable ? (
        <form className="ai-slot-editor" onSubmit={onSubmit}>
          <input
            name="prompt"
            maxLength={500}
            placeholder="用一句话调整这个区域…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button type="submit">应用</button>
          <button type="button" onClick={restore}>
            恢复默认
          </button>
        </form>
      ) : null}
    </>
  );
}
