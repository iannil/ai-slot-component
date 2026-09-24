export interface PrewarmResult {
  ok: string[];
  failed: string[];
}

/**
 * CI 构建时预生成（「AI 静态化」）：复用渲染代理 handler 逐槽位跑开发者路径，
 * 结果写入 handler 自带的缓存 store；之后 dump() 序列化随产物部署。
 * 单个槽位失败不中断整体。
 */
export async function prewarm(
  handler: (req: Request) => Promise<Response>,
  slotIds: string[],
): Promise<PrewarmResult> {
  const ok: string[] = [];
  const failed: string[] = [];
  for (const slotId of slotIds) {
    try {
      const res = await handler(new Request(`https://prewarm.local/ai-render/${slotId}`));
      if (res.ok) ok.push(slotId);
      else failed.push(slotId);
    } catch {
      failed.push(slotId);
    }
  }
  return { ok, failed };
}
