import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleRequest } from '../server/handler.mjs';
import { records } from '../server/content.mjs';
import { signBatch } from '../server/vendor/adapter.mjs';
const tasks=[];
const context={waitUntil:p=>tasks.push(p)};
const env={ASSETS:{async fetch(request){
  try {const body=await readFile(new URL(`../public${new URL(request.url).pathname}`,import.meta.url));return new Response(request.method==='HEAD'?null:body);}
  catch {return new Response('Not found',{status:404});}
}}};
const request=(path,init={},config=env)=>handleRequest(new Request(`https://aislot.dev${path}`,init),config,context);
const collected=[];
const telemetry={...env,TELEMETRY_ENABLED:'true',TELEMETRY_PRODUCT_ID:'ai-slot',TELEMETRY_SITE_ID:'main',TELEMETRY_ENVIRONMENT:'test',TELEMETRY_KEY_ID:'ai-slot-test',TELEMETRY_SECRET:'test-only-secret-000000000000000000000',TELEMETRY_COLLECTOR:{async fetch(req){collected.push(...(await req.json()).events);return new Response(null,{status:202});}}};

test('API 与真实文档一致，完整分页，区分非法输入/空结果/不存在',async()=>{
  assert.ok((await (await request('/api/agent/search?q=React')).json()).results.length);
  assert.equal((await (await request('/api/agent/search?q=not-a-real-term-xx')).json()).total,0);
  for(const path of ['/api/agent/search','/api/agent/search?q=x&limit=0','/api/agent/search?q=x&limit=1.5','/api/agent/search?q=x&q=y','/api/agent/search?q=x&unknown=1','/api/agent/content?id=overview&cursor=-1','/api/agent/content?id=overview&cursor=9999999'])assert.equal((await request(path)).status,400,path);
  assert.equal((await request('/api/agent/content?id=https://example.com')).status,404);
  let body='',cursor=null;
  do {const result=await (await request(`/api/agent/content?id=overview${cursor?`&cursor=${cursor}`:''}`)).json();body+=result.body;cursor=result.nextCursor;}while(cursor);
  assert.equal(body,records.find(r=>r.id==='overview').body);
  assert.equal((await request('/api/agent/search?q=React',{method:'POST'})).status,405);
});

test('官方 MCP 客户端完成初始化、工具发现、调用、资源读取与错误调用',async()=>{
  const client=new Client({name:'acceptance',version:'1.0.0'});
  const transport=new StreamableHTTPClientTransport(new URL('https://aislot.dev/mcp'),{fetch:(url,init)=>handleRequest(new Request(url,init),telemetry,context)});
  try{
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['search_docs','read_doc']);
    const found=await client.callTool({name:'search_docs',arguments:{q:'React'}});
    assert.ok(JSON.parse(found.content[0].text).results.length);
    const doc=await client.callTool({name:'read_doc',arguments:{id:'adapter-react'}});
    assert.equal(JSON.parse(doc.content[0].text).id,'adapter-react');
    assert.ok((await client.listResources()).resources.length);
    assert.match((await client.readResource({uri:'aislot://guide'})).contents[0].text,/只读/);
    assert.equal((await client.callTool({name:'read_doc',arguments:{id:'missing'}})).isError,true);
    assert.equal((await client.callTool({name:'search_docs',arguments:{q:''}})).isError,true);
  }finally{await client.close();}
  await Promise.all(tasks.splice(0));
  assert.ok(collected.some(e=>e.transport==='mcp'&&e.operation==='read'&&e.outcome==='error'&&e.httpStatus===200));
  assert.equal((await request('/mcp',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await request('/mcp')).status,405);
  assert.equal((await request('/mcp',{method:'OPTIONS',headers:{Origin:'https://aislot.dev'}})).status,204);
});

test('RSS 缓存、HEAD、发现入口与 Skill ZIP 一致',async()=>{
  const rss=await request('/agent/feed.xml');
  assert.match(rss.headers.get('Content-Type'),/rss\+xml/);
  assert.match(await rss.text(),/<rss version="2.0">/);
  assert.equal((await request('/agent/feed.xml',{headers:{'If-None-Match':rss.headers.get('ETag')}})).status,304);
  assert.equal(await (await request('/agent/feed.xml',{method:'HEAD'})).text(),'');
  for(const path of ['/agents/','/agent/catalog.json','/agent/openapi.json','/llms.txt','/agent/skills/ai-slot-guide/SKILL.md'])assert.equal((await request(path)).status,200);
  const zip=new Uint8Array(await (await request('/agent/ai-slot-guide.zip')).arrayBuffer());
  const entries=unzipSync(zip);
  assert.deepEqual(Object.keys(entries),['ai-slot-guide/SKILL.md']);
  assert.equal(strFromU8(entries['ai-slot-guide/SKILL.md']),await (await request('/agent/skills/ai-slot-guide/SKILL.md')).text());
  const checks=await (await request('/agent/checksums.json')).json();
  assert.equal(createHash('sha256').update(zip).digest('hex'),checks['ai-slot-guide.zip']);
});

test('统计记录真实业务结果和缓存访问，不泄漏查询；故障不阻断任务',async()=>{
  collected.length=0;
  await request('/api/agent/search?q=private-canary',{headers:{'X-Iannil-Entry-Source':'skill'}},telemetry);
  const rss=await request('/agent/feed.xml',{},telemetry);
  await request('/agent/feed.xml',{method:'HEAD'},telemetry);
  await request('/agent/feed.xml',{headers:{'If-None-Match':rss.headers.get('ETag')}},telemetry);
  await request('/agent/skills/ai-slot-guide/SKILL.md',{},telemetry);
  await Promise.all(tasks.splice(0));
  assert.ok(collected.some(e=>e.operation==='search'&&e.resultCount===0&&e.outcome==='success'&&e.entrySource==='skill'));
  assert.equal(collected.filter(e=>e.transport==='rss'&&e.eventType==='request').length,3);
  assert.ok(collected.some(e=>e.httpStatus===304));
  assert.ok(!JSON.stringify(collected).includes('private-canary'));
  const failed={...telemetry,TELEMETRY_COLLECTOR:{fetch:async()=>new Response(null,{status:503})}};
  assert.equal((await request('/api/agent/search?q=React',{},failed)).status,200);
  await Promise.all(tasks.splice(0));
});

test('健康端点要求产品签名，适配器校验值正确',async()=>{
  assert.equal((await request('/api/agent-telemetry/v1/health',{},telemetry)).status,403);
  const body=JSON.stringify({schemaVersion:1});
  const headers=await signBatch(body,{keyId:telemetry.TELEMETRY_KEY_ID,secret:telemetry.TELEMETRY_SECRET,productId:'ai-slot',environment:'test'},String(Date.now()),crypto.randomUUID(),'/api/agent-telemetry/v1/health');
  const health=await request('/api/agent-telemetry/v1/health',{method:'POST',headers,body},telemetry);
  assert.equal(health.status,200);
  assert.equal((await health.json()).ready,true);
  const checks=JSON.parse(await readFile(new URL('../server/vendor/checksums.json',import.meta.url)));
  assert.equal(createHash('sha256').update(await readFile(new URL('../server/vendor/adapter.mjs',import.meta.url))).digest('hex'),checks.sha256);
});
