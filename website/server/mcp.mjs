import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { searchSchema, readSchema, search, readContent } from './content.mjs';

export async function handleMcp(request, observe = () => {}) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const allowed = new Set(['https://aislot.dev']);
  if (['localhost','127.0.0.1','[::1]'].includes(url.hostname)) allowed.add(url.origin);
  if (origin && !allowed.has(origin)) return new Response('Forbidden', { status:403 });
  const cors = origin ? { 'Access-Control-Allow-Origin':origin, Vary:'Origin' } : {};
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ ...cors, 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type, Accept, MCP-Protocol-Version, X-Iannil-Entry-Source', 'Access-Control-Expose-Headers':'MCP-Protocol-Version' } });
  if (request.method !== 'POST') return new Response('Use POST; no SSE subscription.', { status:405, headers:{ ...cors, Allow:'POST, OPTIONS' } });
  const server = new McpServer({ name:'ai-slot-public-docs', version:'1.0.0' }, { instructions:'查询并读完 AI Slot 公开文档，引用 canonicalUrl。不提供部署、写入或 LLM 调用。' });
  const annotations = { readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false };
  const result = value => ({ content:[{ type:'text', text:JSON.stringify(value) }] });
  let toolObserved = false;
  const run = (operation, fn) => async input => {
    toolObserved = true;
    const start = performance.now();
    try {
      const value = fn(input);
      observe({ eventType:'operation', operation, outcome:'success', errorCode:'none', resultCount:value.results?.length ?? null, durationMs:performance.now()-start });
      return result(value);
    } catch (error) {
      observe({ eventType:'operation', operation, outcome:'error', errorCode:error.code === 'not_found' ? 'not_found' : 'invalid_request', durationMs:performance.now()-start });
      return { isError:true, ...result({ error:error.code ?? 'invalid_request' }) };
    }
  };
  server.registerTool('search_docs', { description:'按关键词搜索 AI Slot 公开指南，返回 ID 和来源；空结果请缩短关键词。', inputSchema:searchSchema, annotations }, run('search', search));
  server.registerTool('read_doc', { description:'读取搜索或目录返回的 ID。继续读取 nextCursor 直至为空；不接受 URL。', inputSchema:readSchema, annotations }, run('read', readContent));
  server.registerResource('guide', 'aislot://guide', { mimeType:'text/plain', description:'AI Slot Agent 接入说明' }, async uri => {
    observe({ eventType:'operation', operation:'read_resource', resourceId:'guide', outcome:'success' });
    return { contents:[{ uri:uri.href, text:'先 search_docs，再 read_doc 读完并引用 canonicalUrl。只读，无部署/修改/LLM 执行能力。HTTP 与 Skill 入口：https://aislot.dev/agents/' }] };
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator:undefined, enableJsonResponse:true, maxRequestBodySize:16384 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const body = await response.arrayBuffer();
    if (body.byteLength) {
      try {
        const rpc = JSON.parse(new TextDecoder().decode(body));
        if (rpc.error) observe({ eventType:'operation', operation:'protocol_error', outcome:'error', errorCode:'protocol_error' });
        else if (rpc.result?.isError && !toolObserved) {
          // SDK 参数校验在工具回调之前发生，仍需记录业务错误。
          observe({ eventType:'operation', operation:'protocol_error', outcome:'error', errorCode:'tool_error' });
        } else {
          const operation = rpc.result?.protocolVersion ? 'initialize' : Array.isArray(rpc.result?.tools) ? 'list_tools' : Array.isArray(rpc.result?.resources) ? 'list_resources' : null;
          if (operation) observe({ eventType:'operation', operation, outcome:'success' });
        }
      } catch { /* 非 JSON 错误由外层 HTTP 事件统计。 */ }
    } else if (response.status === 202) observe({ eventType:'operation', operation:'notification', outcome:'success' });
    return new Response(body.byteLength ? body : null, { status:response.status, headers:{ ...Object.fromEntries(response.headers), ...cors, 'Cache-Control':'no-store' } });
  } finally { await server.close(); }
}
