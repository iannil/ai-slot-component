# AI-SLOT CMS接入与客户试点准备 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个只读CMS任务包、可卸载宿主嵌入与可核对的劳动测量流程。

**Architecture:** 使用固定CMS事实端点，服务端将快照接到G；先做自有WordPress参考环境，平台品牌可随真实客户替换但协议不变。客户未落实时完成准备，不联系客户或伪造实测。

**Tech Stack:** Node fetch、Vitest、WordPress小型PHP插件、现有runtime/DOM、Playwright、Node计时分析。

**Spec:** [后续交付设计](../specs/2026-10-10-ai-slot-next-delivery-design.md)

## Global Constraints

- 文档与新增注释使用中文；既有英文用户文案按双语约定维护。
- 核心 SDK 保持 Node >= 18，不增加运行时依赖；新管理参考服务使用 Node >= 22，仅单进程、本地磁盘。
- AI 只提交结构化组件树 JSON；所有新交付路径校验注册表；不执行 AI 生成的 HTML/CSS/JS。
- CMS 是事实源，宿主拥有页面，AI-SLOT 仅管理授权槽位；首期只读数据源，不做双向同步。
- 保留原始兜底与 createAiRenderHandler 兼容；新管理服务为可选包，不替换现有公开 GET 数据入口。
- 正式站点沿用 aislot.dev；Git 主分支是 master，Cloudflare Pages 项目 aislot 的生产标识是 main。
- 不引入多租户、计费、通用调度、多实例存储或全平台插件矩阵；新包先 private，不随首轮 npm 发布。
- 官网公开文档 MCP 不增加写权限；管理 MCP 首期仅本地 stdio，远程 MCP 认证另立设计。
- 客户尚未落实；模拟数据、协议测试和自有测试站不能记作真实客户、付费或节省劳动证据。

---


## 文件职责

- Create `examples/cms-campaign-slot/package.json`（private，test=vitest run）、`source.mjs`、`source.test.mjs`：固定端点读取与快照版本。
- Create `examples/cms-campaign-slot/wordpress/ai-slot-campaign.php`：公开批准事实路由与短代码壳。
- Create `examples/cms-campaign-slot/embed.mjs`、`build-embed.mjs`：Web Component低成本接入包；构建产物wordpress/assets忽略。
- Modify `examples/managed-slot/config.mjs`：用env选择本地fixture或固定CMS源；不改变operations规则。
- Create `docs/integrations/cms-campaign.md`、`docs/validation/pilot-readiness.md`、`pilot-consent-template.md`、`slot-task-log.csv`、`analyze-pilot.mjs`、`analyze-pilot.test.mjs`。

### Task 1: 固定事实接口与CMS读取

**Interfaces:** `createCampaignSource({url,fetchImpl=fetch,now=Date.now}):()=>Promise<Source>`；URL只来自服务端配置，CMS字段为 `{id, title, price, link, expiresAt}`；source.version=规范JSON的sha256，包含全部字段。不能只用modified_gmt秒级时间。

- [ ] 新测试与失败运行：

```js
import {it,expect,vi} from 'vitest';
import {createCampaignSource} from './source.mjs';
it('同快照同版本，事实变化产生新版本且超时传signal',async()=>{
 let title='介绍A';
 const fetchImpl=vi.fn(async()=>Response.json({id:'campaign-1',title,price:'¥99',link:'https://example.com/',expiresAt:20000}));
 const read=createCampaignSource({url:'https://cms.example.com/wp-json/ai-slot/v1/campaign/1',fetchImpl,now:()=>1000});
 const a=await read();expect((await read()).version).toBe(a.version);
 title='介绍B';expect((await read()).version).not.toBe(a.version);
 expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
 expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
```

- [ ] 实现固定HTTPS读取（本地开发http仅明确127.0.0.1/localhost，不接受任意HTTP网段）；新URL在工厂构造时验证，拒绝userinfo/hash。响应redirect:error，8000ms超时，读取流上限65536，非2xx/非JSON/缺字段/过期拒绝，异常没有敏感完整body。下面是核心返回映射：

```js
import {hash} from '@ai-slot/operations';
const data={title:payload.title,price:payload.price,link:payload.link};
return {id:payload.id,version:hash({id:payload.id,data,expiresAt:payload.expiresAt}),
 expiresAt:payload.expiresAt,data};
```

验证title<=200、price<=100、link<=2048，expiresAt有限且>now；禁止额外字段自动流入props。title/price按纯文本，不解析HTML；link还要经G的allowedOrigins。测试500、重定向、巨大body、超时、HTML字符串作为文本不执行、同title但价格变化产生新hash。
- [ ] WordPress插件文件包含插件头与固定只读路由：

```php
<?php
/**
 * Plugin Name: AI-SLOT Campaign Reference
 * Description: 已批准公开活动事实与槽位短代码参考接入。
 * Version: 0.1.0
 */
add_action('rest_api_init', function () {
 register_rest_route('ai-slot/v1', '/campaign/(?P<id>\d+)', [
  'methods'=>'GET','permission_callback'=>'__return_true',
  'callback'=>function ($request) {
   $post=get_post((int)$request['id']);
   if (!$post || $post->post_status!=='publish' || !empty($post->post_password))
    return new WP_Error('not_found','Not found',['status'=>404]);
   $facts=get_post_meta($post->ID,'_ai_slot_campaign',true);
   if (!is_array($facts) || empty($facts['approved']))
    return new WP_Error('not_found','Not found',['status'=>404]);
   $value=['id'=>'campaign-'.$post->ID,'title'=>(string)($facts['title']??''),
    'price'=>(string)($facts['price']??''),'link'=>(string)($facts['link']??''),
    'expiresAt'=>(float)($facts['expiresAt']??0)];
   $response=new WP_REST_Response($value,200);
   $response->header('Cache-Control','no-store');
   return $response;
  }
 ]);
});
```

该meta只由站点管理员通过WP CLI或原有受权后台设置，不增加公开写接口；approved表示允许公开该事实源，不等于AI产物已批准发布。站点隐藏字段不出现在返回值。被密码保护/非公开页面一律404。
- [ ] 在自有WordPress根目录创建测试页面并写入1h有效事实；该脚本仅用于本地参考站，不对客户站点运行。

```bash
campaign_post_id=$(wp post create --post_type=page --post_status=publish --post_title='AI-SLOT接入测试' --porcelain)
campaign_facts=$(php -r 'echo json_encode(["approved"=>true,"title"=>"产品介绍","price"=>"¥99","link"=>"https://example.com/","expiresAt"=>(time()+3600)*1000],JSON_UNESCAPED_UNICODE);')
wp post meta update "$campaign_post_id" _ai_slot_campaign "$campaign_facts" --format=json
campaign_site_url=$(wp option get siteurl)
curl --fail "$campaign_site_url/wp-json/ai-slot/v1/campaign/$campaign_post_id"
```

随后以同命令改变title并读取，断言source hash改变；`wp post update "$campaign_post_id" --post_status=draft`后路由404；恢复publish并设post_password后也404。初始page与meta均可通过wp post delete撤回，删前只确认它确为本脚本创建的测试ID。
- [ ] config.mjs以 `AI_SLOT_CMS_URL`选择这个reader，sourceId必须与实际id一致，首次读取错误阻断启动或对应slot交付；确认G的发布/交付均调用同一reader。通过测试后提交 `feat: 增加只读CMS活动事实连接示例`。

### Task 2: 宿主嵌入与撤回

**Interfaces:** `data-ai-slot-endpoint`为**公开**HTTPS交付URL，`data-ai-slot-registry`为同源公开注册表URL；不传管理令牌。参考服务新增 `GET /registry.json`仅返回registry/registryVersion/rendererVersion，配置与G一致。

- [ ] build-embed.mjs使用esbuild bundle embed.mjs，platform browser、format esm、target es2022，输出wordpress/assets/ai-slot.js。示例devDependency添加与仓库锁已用版本一致的esbuild，运行依赖runtime/adapter-dom/registry workspace:*；不是核心SDK新依赖。
- [ ] PHP短代码输出固定壳和安全escaped属性，管理员用页面短代码接入：

```php
add_shortcode('ai_slot_campaign', function ($attrs) {
 $a=shortcode_atts(['endpoint'=>'','registry'=>''],$attrs);
 foreach (['endpoint','registry'] as $key) {
  if (wp_parse_url($a[$key],PHP_URL_SCHEME)!=='https') return '<p>产品介绍暂不可用。</p>';
 }
 wp_enqueue_script('ai-slot-reference',plugins_url('assets/ai-slot.js',__FILE__),[],null,true);
 return '<div data-ai-slot-endpoint="'.esc_url($a['endpoint']).'" data-ai-slot-registry="'.esc_url($a['registry']).'"><h2>产品介绍暂不可用，请查看原站信息。</h2></div>';
});
add_filter('script_loader_tag', function($tag,$handle){
 return $handle==='ai-slot-reference' ? str_replace('<script ', '<script type="module" ', $tag) : $tag;
},10,2);
```

本地host测试也使用TLS自有测试域或本地TLS反代，不降低生产shortcode为任意http。实际客户端包从插件同源加载；公开交付服务需站点负责人提供可访问HTTPS端点，此访问条件未有时本地WordPress集成状态不能标生产兼容。
- [ ] embed.mjs静态导入configureAiSlot/registerRenderer/createDomRenderer；先fetch registry并验证返回，再配置renderer，最后把每个div壳转成ai-slot（壳fallback子节点原样迁移，非AI HTML）。不在await之前创建自定义元素，避免注册时序错误。组件为h2/p/a，写textContent；link由当前契约允许origin，异常保留div原fallback。为单页面多slot验证所有registryVersion一致，否则拒绝冲突slot并在开发控制台输出固定诊断，不输出source数据。

```js
const slot=document.createElement('ai-slot');
slot.setAttribute('name','hero');
slot.setAttribute('src',endpoint);
while(host.firstChild)slot.append(host.firstChild);
host.replaceWith(slot);
```

初期跨域模板不默认live（服务流配置尚需宿主验证），可通过既有refresh-interval=60秒重新读取已发布版本；数据更新仍需G审批，不直接CMS变化即绕过发布。若实测同源SSE通过才启用live+显式live-src；记录刷新/重连方式。
- [ ] 自有站验收记录：实际WordPress/主题/编辑器版本，前台/编辑器/预览是否运行，CSP script/connect限制、样式隔离、320/768/1280、键盘/链接、脚本被拦/CMS断开/交付503、中性兜底；对比安装前后宿主DOM外部节点。WordPress无障碍与插件冲突必须实际看页面，不凭HTTP200。
- [ ] 撤回：删除短代码/恢复原静态片段→禁用插件→撤销管理token→停止参考服务；确认无额外CMS数据副本、没有自动创建文章。README记录初次接入需要发布插件/页面，之后仅已部署契约内内容免宿主重打包。
- [ ] 提交 `feat: 提供可撤回的WordPress槽位接入参考`。不宣称Webflow/Framer/Wix通用兼容，不自动做第二插件。

### Task 3: 试点准备与总劳动分析

**Interfaces:** CSV记录每个配对task、流程baseline/slot及全部失败尝试；分析函数 `summarize(rows,setupMinutes,maintenanceMinutes)`。总人工包含创作、审阅、纠错、发布、支持；机器等待另列。

- [ ] 创建只有表头的slot-task-log.csv，真实数据另经负责人同意添加：

```csv
pilot_id,task_id,workflow,attempt,creation_min,review_min,correction_min,publish_min,support_min,wait_min,quality_pass,unauthorized_publish,fact_error,severe_page_error
```

Create pilot-readiness.md按实际状态记录客户授权未落实；筛选对象为维护已有站点且每月至少有重复介绍区任务的开发者/服务商；收集现有平台能否原生完成、月任务数、原流程步骤、最难审阅内容、愿意承担接入时长及价格反馈。邀请文案只保存草稿：“我们正在测试保留现有CMS的局部更新组件，希望对照三次真实更新的审阅和纠错时间。你可随时恢复原页面；是否愿意先用一个非关键介绍区评估？”不发送消息。
- [ ] consent模板字段：负责人、站点/slot、允许只读的源、允许动作、发布窗口、域名/CSP限制、数据记录范围、撤回责任人；默认禁采客户真实业务内容，仅时间与匿名错误码。没有这些信息不能启动客户侧安装。
- [ ] 分析测试（node:test），fixtures明确标为synthetic，不写进真实CSV：

```js
import test from 'node:test';import assert from 'node:assert/strict';
import {summarize} from './analyze-pilot.mjs';
const row=(task_id,workflow,minutes)=>({task_id,workflow,creation_min:minutes,review_min:0,correction_min:0,publish_min:0,support_min:0,quality_pass:true,unauthorized_publish:false,fact_error:false,severe_page_error:false});
test('接入成本与失败返工不可漏计',()=>{
 const rows=[row('a','baseline',20),row('a','slot',8),row('a','slot',2),row('b','baseline',20),row('b','slot',10),row('c','baseline',20),row('c','slot',10)];
 assert.equal(summarize(rows,40,0).netSavedMinutes,-10);
 assert.equal(summarize(rows,40,0).decision,'do_not_expand');
 assert.throws(()=>summarize([row('a','slot',10)],0,0),/unpaired/);
});
```

- [ ] 实现分析函数如下；CSV读入在CLI中固定列、拒绝逗号/引号字段（当前字段均ID/数字/布尔），不要用split假装支持任意CSV描述文字：

```js
export function summarize(rows,setupMinutes,maintenanceMinutes){
 const groups=new Map();
 const fields=['creation_min','review_min','correction_min','publish_min','support_min'];
 let safetyFailure=false;
 for(const r of rows){
  if(!['baseline','slot'].includes(r.workflow))throw Error('invalid_workflow');
  const minutes=fields.reduce((sum,key)=>{const n=Number(r[key]);if(!Number.isFinite(n)||n<0)throw Error('invalid_minutes');return sum+n;},0);
  if(r.unauthorized_publish||r.fact_error||r.severe_page_error)safetyFailure=true;
  const g=groups.get(r.task_id)??{baseline:0,slot:0,seen:new Set(),pass:{baseline:false,slot:false}};
  g[r.workflow]+=minutes;g.seen.add(r.workflow);g.pass[r.workflow] ||= r.quality_pass===true;groups.set(r.task_id,g);
 }
 const pairs=[...groups.values()];
 if(pairs.some(g=>g.seen.size!==2))throw Error('unpaired');
 for(const n of [setupMinutes,maintenanceMinutes])if(!Number.isFinite(n)||n<0)throw Error('invalid_cost');
 const ratios=pairs.map(g=>g.baseline>0?1-g.slot/g.baseline:0).sort((a,b)=>a-b);
 const mid=Math.floor(ratios.length/2);
 const reduction=ratios.length?(ratios.length%2?ratios[mid]:(ratios[mid-1]+ratios[mid])/2):0;
 const netSavedMinutes=pairs.reduce((n,g)=>n+g.baseline-g.slot,0)-setupMinutes-maintenanceMinutes;
 const pass=pairs.length>=3&&pairs.every(g=>g.pass.baseline&&g.pass.slot)&&reduction>=0.3&&netSavedMinutes>0&&!safetyFailure;
 return {pairedTasks:pairs.length,medianReduction:reduction,netSavedMinutes,decision:pass?'eligible_for_next_pilot':'do_not_expand'};
}
```

每次失败也一行，quality_pass仅最后成功尝试true；同task所有attempt计入时间。校验一个CSV只分析一个pilot_id且attempt不重复；空ID、布尔非true/false、缺值拒绝，不将字符串'false'当true。wait_min报告但不算人工节省。
- [ ] `node --test docs/validation/analyze-pilot.test.mjs`通过；补偶数中位数、缺配对、失败行成本、质量未通过、安全事件、空数据。提交 `docs: 建立试点授权与总人工劳动验收`。

### Task 4: 条件式真实试点（当前blocked_external）

**Files:** pilot-readiness.md、slot-task-log.csv、Create docs/validation/pilot-outcome.md。
**Interfaces:** Consumes 站点负责人授权+3–5个真实重复任务；Produces `validated_for_this_host`或`do_not_expand`，不可由模拟填充。

- [ ] 用户提供候选后核对consent字段与宿主限制；先读原流程、记录baseline，不先安装再补授权。未落实时记录ready_for_pilot并完成其它计划，不伪造工时。
- [ ] 对同一质量要求的3–5个任务交叉记录baseline/slot流程，随机或交替顺序减轻学习偏差；计时包含生成尝试、审阅、纠错、上线、维护/支持，初次接入单列。
- [ ] 使用Task3脚本得出中位数与累计净节省，再逐项人工核对事实正确、授权、页面故障；结果不足则缩窄任务/改善接入，不自动开发第二平台。
- [ ] 访谈愿否再次使用、支付条件与原平台原生方案是否更省事；只记录实际答复，不把试用意愿视为付款。收费行为另需明确任务授权。
- [ ] 写outcome只含匿名任务与指标、支持成本、是否继续；提交 `docs: 记录首宿主真实任务试点结果`。没有客户数据时此步骤保持未勾选。

## 自审

I Task1是CMS侧事实读取，Task2是宿主侧嵌入，两者可替换而不改变核心治理；一个WordPress示例不等于兼容所有建站产品。Task3现在可完成，Task4只有外部条件满足才执行。净节省扣除接入成本且计入失败重试，不把AI生成速度当总劳动下降。
