// 在运行 Pages 模拟器后执行；只面向本机，不向生产发送验收流量。
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const base='http://127.0.0.1:8791';
for(const path of ['/','/agents/','/agent/catalog.json','/agent/openapi.json','/api/agent/search?q=React','/api/agent/content?id=adapter-react','/agent/feed.xml','/agent/skills/ai-slot-guide/SKILL.md','/agent/ai-slot-guide.zip','/agent/checksums.json','/llms.txt']) {
  const res=await fetch(base+path);assert.equal(res.status,200,path);console.log(res.status,path,res.headers.get('content-type'));
}
assert.equal((await fetch(base+'/agent/missing')).status,404);
const rss=await fetch(base+'/agent/feed.xml');
assert.equal((await fetch(base+'/agent/feed.xml',{headers:{'If-None-Match':rss.headers.get('etag')}})).status,304);
const client=new Client({name:'local-http-acceptance',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['search_docs','read_doc']);
  assert.ok((await client.callTool({name:'search_docs',arguments:{q:'React'}})).content.length);
  console.log('MCP HTTP: initialized, discovered tools, called search_docs');
} finally { await client.close(); }
