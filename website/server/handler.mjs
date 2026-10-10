import { search, readContent, QueryError } from './content.mjs';
import { catalog, openapi, feed, page, llms } from './discovery.mjs';
import { handleMcp } from './mcp.mjs';
import { withAgentTelemetry, telemetryContext, makeEvent, sendEvents } from './vendor/adapter.mjs';

const routes = [
  {path:'/api/agent/search',transport:'api',operation:'search',methods:['GET']},
  {path:'/api/agent/content',transport:'api',operation:'read',methods:['GET']},
  ...[['/agent/feed.xml','rss','feed'],['/agent/skills/ai-slot-guide/SKILL.md','skill','skill_file'],['/agent/ai-slot-guide.zip','skill','skill_zip'],['/agent/checksums.json','discovery','checksums'],['/agent/openapi.json','discovery','openapi'],['/agent/catalog.json','discovery','catalog'],['/llms.txt','discovery','llms'],['/agents/','discovery','guide']].map(([path,transport,resourceId])=>({path,transport,resourceId})),
];
async function cached(request, body, contentType) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const etag = `"${Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('')}"`;
  const headers = { 'Content-Type':contentType, 'Cache-Control':'public, max-age=300', ETag:etag, 'X-Content-Type-Options':'nosniff' };
  const matches = request.headers.get('If-None-Match')?.split(',').some(v=>v.trim().replace(/^W\//,'')===etag || v.trim()==='*');
  return new Response(matches || request.method==='HEAD' ? null : body, {status:matches ? 304 : 200, headers});
}
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!['GET','HEAD','OPTIONS'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD, OPTIONS'}});
  const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'X-Iannil-Entry-Source','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'};
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (path==='/api/agent/search' || path==='/api/agent/content') {
    let status=200, value;
    try {
      if ([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)) throw new QueryError('invalid_request',400);
      value=(path.endsWith('/search') ? search : readContent)(Object.fromEntries(url.searchParams));
    } catch (e) { status=e instanceof QueryError ? e.status : 500; value={error:e instanceof QueryError ? e.code : 'internal_error'}; }
    return new Response(request.method==='HEAD' ? null : JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Agent-Outcome':status===200 ? 'success' : value.error,...(Array.isArray(value.results) ? {'X-Agent-Result-Count':String(value.results.length)} : {})}});
  }
  const generated = {
    '/agents/':[page,'text/html; charset=utf-8'],
    '/agent/catalog.json':[JSON.stringify(catalog),'application/json'],
    '/agent/openapi.json':[JSON.stringify(openapi),'application/json'],
    '/agent/feed.xml':[feed(),'application/rss+xml; charset=utf-8'],
    '/llms.txt':[llms,'text/plain; charset=utf-8'],
  }[path];
  if (generated) return cached(request,...generated);
  // 静态 Skill/ZIP 通过外层观测后再读 ASSETS，缓存命中也不会绕过统计。
  if (!['/agent/skills/ai-slot-guide/SKILL.md','/agent/ai-slot-guide.zip','/agent/checksums.json'].includes(path)) return new Response('Not found',{status:404});
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set('X-Content-Type-Options','nosniff');
  if (asset.status === 200 && path.endsWith('/SKILL.md')) headers.set('Content-Type','text/plain; charset=utf-8');
  return new Response(asset.body,{status:asset.status,headers});
}
const wrapped = withAgentTelemetry(route, {routes, async outcome(_req,response) {
  const outcome=response.headers.get('X-Agent-Outcome');
  return {outcome:outcome==='success' ? 'success' : 'error',errorCode:['not_found','invalid_request'].includes(outcome) ? outcome : outcome==='success' ? 'none' : 'other',resultCount:response.headers.has('X-Agent-Result-Count') ? Number(response.headers.get('X-Agent-Result-Count')) : null};
}});
export async function handleRequest(request, env, context) {
  const url=new URL(request.url);
  if (url.pathname==='/agents') return Response.redirect(`${url.origin}/agents/`,308);
  if (url.pathname!=='/mcp') return wrapped(request,env,context);
  const observations=[];
  const start=performance.now();
  let response;
  try { response=await handleMcp(request, value=>observations.push(value)); }
  catch { response=new Response('Service unavailable',{status:503}); }
  // MCP 使用单一 requestId 合并 HTTP 与语义事件，不经过通用路由重复采集。
  try {
    const eventContext=telemetryContext(env,'mcp');
    if (eventContext) {
      const source=request.headers.get('X-Iannil-Entry-Source')==='skill' ? {entrySource:'skill',sourceEvidence:'declared'} : {};
      const base={...source,httpStatus:response.status,httpMethod:['GET','POST','HEAD','OPTIONS'].includes(request.method) ? request.method : 'OTHER'};
      const events=[{eventType:'request',operation:'http',outcome:response.status<400?'success':'error',errorCode:response.status<400?'none':'other',durationMs:performance.now()-start},...observations].map(o=>makeEvent(eventContext,{...base,...o}));
      context.waitUntil(sendEvents(env,events));
    }
  } catch { /* 统计配置或投递异常不能中断公开文档访问。 */ }
  return response;
}
