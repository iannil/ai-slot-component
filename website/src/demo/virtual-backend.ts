/**
 * 页内虚拟后端：拦截 window.fetch 中以 /ai-render/ 与 /ai-invalidate 开头的请求，
 * 按与 @ai-slot/proxy 完全相同的线协议（JSON / SSE 双帧 / 失效推送）应答。
 * 演示跑的是真实 @ai-slot/runtime 与真实校验，只有网络被虚拟化——静态托管也能用。
 */

export interface VirtualSlot {
  /** 生成组件树；version 随 publish 递增，prompt 为运营控制台下发的卖点方向（null = 默认） */
  tree: (version: number, prompt: string | null) => unknown
  /** true 时该槽位永远 500（演示静默兜底） */
  fail?: boolean
}

export interface VirtualBackendConfig {
  slots: Record<string, VirtualSlot>
  /** 模拟 LLM 延迟，让「静态内容先行」可被看见 */
  delayMs: number
}

let config: VirtualBackendConfig | null = null
let versions: Record<string, number> = {}
let prompts: Record<string, string> = {}
const subscribers = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>()
const encoder = new TextEncoder()
let patched = false
let originalFetch: typeof window.fetch | null = null

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/** 与 proxy deriveSkeleton 同语义：字符串 props 置空作为骨架帧。 */
function skeletonOf(tree: unknown): unknown {
  if (!tree || typeof tree !== 'object') return tree
  const node = tree as { props?: Record<string, unknown> }
  const props: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node.props ?? {})) props[k] = typeof v === 'string' ? '' : v
  return { ...node, props }
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function handleRender(slotId: string, init?: RequestInit): Promise<Response> {
  const slot = config?.slots[slotId]
  if (!slot || slot.fail) return errorResponse(500, 'mock service down')
  await new Promise((r) => setTimeout(r, config?.delayMs ?? 1000))
  const version = versions[slotId] ?? 0
  const tree = slot.tree(version, prompts[slotId] ?? null)
  const body = { version: 1, slot: slotId, tree }
  const headers = init?.headers
  const accept =
    headers && !Array.isArray(headers) && !(headers instanceof Headers)
      ? ((headers as Record<string, string>).accept ?? '')
      : ''
  if (accept.includes('text/event-stream')) {
    const text = sseFrame('skeleton', { ...body, tree: skeletonOf(tree) }) + sseFrame('tree', body)
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
    })
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function handleInvalidate(slotId: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let set = subscribers.get(slotId)
      if (!set) {
        set = new Set()
        subscribers.set(slotId, set)
      }
      set.add(controller)
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
  })
}

function patchFetch(): void {
  if (patched) return
  patched = true
  originalFetch = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.href
    const u = new URL(url, window.location.origin)
    if (u.pathname.startsWith('/ai-render/')) {
      return handleRender(decodeURIComponent(u.pathname.slice('/ai-render/'.length)), init)
    }
    if (u.pathname === '/ai-invalidate') {
      return handleInvalidate(u.searchParams.get('slot') ?? '')
    }
    return originalFetch!(input, init)
  }) as typeof fetch
}

/** 激活某次演示的后端配置；重复调用会重置内容版本与提示词并断开旧订阅。 */
export function activateDemoBackend(next: VirtualBackendConfig | null): void {
  patchFetch()
  config = next
  versions = {}
  prompts = {}
  for (const set of subscribers.values()) {
    for (const controller of set) {
      try {
        controller.close()
      } catch {
        // 已关闭：忽略
      }
    }
  }
  subscribers.clear()
}

/** 模拟数据源发布：版本 +1 并向该槽位所有订阅者推送失效帧。 */
export function publishDemoUpdate(slotId: string): void {
  versions[slotId] = (versions[slotId] ?? 0) + 1
  pushInvalidate(slotId)
}

/** 模拟运营调整卖点方向：记录新提示词，版本 +1 并推送失效——与示例站 /admin/prompt 等效。 */
export function applyDemoPrompt(slotId: string, prompt: string): void {
  prompts[slotId] = prompt
  versions[slotId] = (versions[slotId] ?? 0) + 1
  pushInvalidate(slotId)
}

function pushInvalidate(slotId: string): void {
  const frame = encoder.encode(sseFrame('invalidate', { slot: slotId }))
  const set = subscribers.get(slotId)
  if (!set) return
  for (const controller of set) {
    try {
      controller.enqueue(frame)
    } catch {
      set.delete(controller)
    }
  }
}
