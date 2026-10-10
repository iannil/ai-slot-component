import { records, metadata } from './content.mjs';
export const base = 'https://aislot.dev';
export const catalog = { productId:'ai-slot', name:'AI Slot', capabilities:['search_docs','read_doc'], limitations:['只读公开文档，不提供远程部署、页面修改或 LLM 调用'], endpoints:{ mcp:`${base}/mcp`, search:`${base}/api/agent/search`, content:`${base}/api/agent/content`, openapi:`${base}/agent/openapi.json`, rss:`${base}/agent/feed.xml`, skill:`${base}/agent/skills/ai-slot-guide/SKILL.md`, skillZip:`${base}/agent/ai-slot-guide.zip` }, entries:records.map(metadata) };
const error = { type:'object', required:['error'], properties:{ error:{ type:'string', enum:['invalid_request','not_found','internal_error'] } } };
const meta = { id:{type:'string'}, title:{type:'string'}, locale:{type:'string'}, canonicalUrl:{type:'string',format:'uri'}, updatedAt:{type:'string',format:'date-time'}, version:{type:'string'} };
const response = schema => ({ description:'成功', content:{'application/json':{schema}} });
const parameter = (name, schema, required = false) => ({ name, in:'query', required, schema });
const operation = (operationId, parameters, schema) => ({ operationId, parameters, responses:{ 200:response(schema), 400:{...response(error),description:'参数非法或重复'}, 404:{...response(error),description:'ID 不存在'}, 405:{description:'仅支持 GET / HEAD / OPTIONS'}, 500:{...response(error),description:'服务不可用'} } });
export const openapi = {
  openapi:'3.1.0', info:{ title:'AI Slot public documentation API', version:'1.0.0', description:'公开只读，无鉴权，无 LLM 调用。无应用层固定速率额度；平台可能施加防护。q 最长 200 字符；每页正文最多 6000 UTF-16 代码单元。未知或重复参数返回 400。' }, servers:[{url:base}], security:[],
  paths:{
    '/api/agent/search':{ get:operation('searchDocs',[parameter('q',{type:'string',minLength:1,maxLength:200},true),parameter('limit',{type:'integer',minimum:1,maximum:20,default:10})],{type:'object',required:['results','total','suggestion'],properties:{results:{type:'array',items:{type:'object',properties:{...meta,excerpt:{type:'string'}}}},total:{type:'integer'},suggestion:{type:['string','null']}}}) },
    '/api/agent/content':{ get:operation('readDoc',[parameter('id',{type:'string',minLength:1,maxLength:100},true),parameter('cursor',{type:'string',pattern:'^(0|[1-9][0-9]{0,6})$'})],{type:'object',required:[...Object.keys(meta),'body','nextCursor'],properties:{...meta,body:{type:'string'},nextCursor:{type:['string','null']}}}) }
  }
};
const xml = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function feed() {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AI Slot 公开文档</title><link>${base}/agents/</link><description>真实仓库文档及其最近提交时间；文档变更更新同一条目。</description>${records.map(r => `<item><guid isPermaLink="false">aislot:docs:${r.id}</guid><title>${xml(r.title)}</title><link>${xml(r.canonicalUrl)}</link><description>${xml(r.body.slice(0,300))}</description><pubDate>${new Date(r.updatedAt).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
}
export const llms = `# AI Slot\n\n存量页面的 AI 内容交付层。AI 输出结构化 JSON，经校验后映射为真实组件，失败回退原始内容。\n\n- [Agent 接入](${base}/agents/)\n- [目录](${base}/agent/catalog.json)\n- [API 契约](${base}/agent/openapi.json)\n- [MCP](${base}/mcp)（Streamable HTTP）\n- [RSS](${base}/agent/feed.xml)\n- [Skill](${base}/agent/skills/ai-slot-guide/SKILL.md)\n\n入口仅提供公开文档查询与读取，不执行部署、页面修改或 LLM 调用。\n`;
export { page } from './agent-page.mjs';
