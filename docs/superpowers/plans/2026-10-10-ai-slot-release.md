# AI-SLOT 首轮远端与生产发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 推送已完成代码、部署现有官网、发布并验证新增数据provider的proxy包。

**Architecture:** 源码SHA、构建tarball、Pages部署分别记录。先预览和本地安装tarball，再执行已授权的生产动作；不把后续private管理包混入本轮。

**Tech Stack:** Git、pnpm pack、npm CLI、现有Wrangler/Pages。

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


## 前提与文件职责

依赖Q完成。沿用本轮明确发布指令；不再问是否可以推送/部署/发布。若认证需要登录或2FA，保留可审阅产物后请求该项外部输入；不读取/输出token。执行前网络/沙箱权限走工具审批。

- Modify `packages/proxy/package.json`：新次版本；`pnpm-lock.yaml`如版本更新导致变化则提交。
- Create `docs/releases/2026-10-10-data-provider.md`：功能、版本、tarball SHA512、Git SHA、preview/production ID、校验结果和恢复步骤。
- Modify `website/README.md`：成功后补发布记录，失败不写上线。
- 临时目录由 `mktemp -d` 创建；不提交tgz、认证信息、node_modules。

### Task 1: 确定版本与验证独立安装包

**Interfaces:** Consumes `@ai-slot/proxy` 当前公开版本、local package.json；Produces 已构建的唯一tarball与确定版本。首轮只变更proxy；其余6包版本如需发布必须有未发布内容的证据。

- [ ] 从仓库根读取状态及远端，保留已有研究文件；不用 `git add .`。

```bash
git status --short
git fetch origin
git log --oneline origin/master..master
npm view @ai-slot/proxy version versions --json
npm view @ai-slot/proxy dist-tags.latest > /tmp/ai-slot-proxy-previous-latest.txt
npm view @ai-slot/registry version --json
npm whoami
cd website
npx wrangler whoami
npx wrangler pages deployment list --project-name=aislot
```

版本缺失/权限错误不是0.0.0；除明确E404不存在外，停止版本决策。保存上一成功production部署ID；账号是否正确由已有项目记录比对，不创建新Pages项目。

- [ ] 根据npm所有已占用稳定版本与本地版本的最大minor，选同major下下一minor的`.0`；若本地major与npm major不同，作为兼容性冲突记录，不能擅自跨major。该变更增加公开API，不能覆盖0.1.0。示例基线0.1.0得到0.2.0；执行以查询结果为准。

```bash
npm view @ai-slot/proxy versions --json > /tmp/ai-slot-proxy-versions.json
node --input-type=module <<'JS'
import fs from 'node:fs';
const path='packages/proxy/package.json';
const pkg=JSON.parse(fs.readFileSync(path,'utf8'));
const versions=JSON.parse(fs.readFileSync('/tmp/ai-slot-proxy-versions.json','utf8'));
const stable=[...(Array.isArray(versions)?versions:[versions]),pkg.version]
 .filter(v=>/^\d+\.\d+\.\d+$/.test(v)).map(v=>v.split('.').map(Number));
if(new Set(stable.map(v=>v[0])).size!==1) throw Error('请核对major迁移，未修改版本');
pkg.version=`${stable[0][0]}.${Math.max(...stable.map(v=>v[1]))+1}.0`;
fs.writeFileSync(path,JSON.stringify(pkg,null,2)+'\n');
JS
pnpm install --lockfile-only
pnpm build
pnpm test
pnpm typecheck
```

- [ ] 写release note：新增 `createRenderHandler`/`ContentProvider`，GET公开数据、8s预算、源失败503、同版本显式stale、旧AI入口兼容。精确暂存package/lock/release note提交 `chore: 准备数据交付入口版本发布`。
- [ ] 使用下面的 `pnpm --filter @ai-slot/proxy pack`；目录由mktemp创建且只保存本次产物。记录实际文件名，检查包内容和workspace替换。

```bash
release_pack_dir=$(mktemp -d /tmp/ai-slot-release-pack.XXXXXX)
printf '%s' "$release_pack_dir" > /tmp/ai-slot-release-pack-dir.txt
pnpm --filter @ai-slot/proxy pack --pack-destination "$release_pack_dir"
```

执行下列脚本生成本轮tarball路径记录并验证依赖；不存在则此关卡失败，不能“先发布再看”。

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const dir=fs.readFileSync('/tmp/ai-slot-release-pack-dir.txt','utf8').trim();const names=fs.readdirSync(dir).filter(x=>x.endsWith('.tgz'));
if(names.length!==1)throw Error('产物目录必须恰有一个本轮tarball');
const file=dir+'/'+names[0];
const packed=JSON.parse(execFileSync('tar',['-xOf',file,'package/package.json'],{encoding:'utf8'}));
if(JSON.stringify(packed).includes('workspace:'))throw Error('workspace未转换');
execFileSync('npm',['view','@ai-slot/registry@'+packed.dependencies['@ai-slot/registry'],'version'],{stdio:'inherit'});
fs.writeFileSync('/tmp/ai-slot-release-tarball.txt',file);
fs.writeFileSync('/tmp/ai-slot-release-version.txt',packed.version);
console.log(execFileSync('tar',['-tzf',file],{encoding:'utf8'}));
JS
```

列表应包含dist/index.js、index.d.ts和自动打包的许可证/README，不得包含密钥或测试缓存。

- [ ] 通过下面命令建立独立消费目录，再将后面的smoke.mjs保存于该目录执行 `node smoke.mjs`；shell中的变量仅来自刚验证的文件。

```bash
release_tarball=$(cat /tmp/ai-slot-release-tarball.txt)
release_consumer=$(mktemp -d /tmp/ai-slot-consumer.XXXXXX)
cd "$release_consumer"
npm init -y
npm install "$release_tarball"
```

```js
// smoke.mjs（只在临时消费目录）
import assert from 'node:assert/strict';
import {createRenderHandler} from '@ai-slot/proxy';
import {defineRegistry} from '@ai-slot/registry';
const handler=createRenderHandler({
 registry:defineRegistry({components:{card:{description:'公开卡片',props:{title:'string'}}}}),
 registryVersion:'1',namespace:'release-smoke',
 resolveSlot:async slotId=>({slotId,originalContent:'原内容',contentVersion:'1'}),
 provider:{id:'fixed-v1',produce:()=>({component:'card',props:{title:'无需模型'}})}
});
const response=await handler(new Request('https://example.com/ai-render/hero'));
assert.equal(response.status,200);
assert.equal((await response.json()).tree.props.title,'无需模型');
```

预期没有模型key仍成功；不能用工作区alias代替安装烟测。失败不进入Task2。

### Task 2: 推送与网站预览/生产发布

**Interfaces:** Consumes 测试通过的master提交、Pages项目aislot；Produces origin/master SHA、部署ID和线上资源hash。

- [ ] `git fetch origin`；若远端领先先正常合并解决冲突并复验受影响部分；禁止force push。执行 `git push origin master`，核对 `git rev-parse master` 与 `git ls-remote origin refs/heads/master` 相同。
- [ ] 官网 `npm run lint && npm run test:agent && npm run build`。在website目录执行预览部署（不会迁移域名）：

```bash
npx wrangler pages deploy dist --project-name=aislot --branch=release-data-provider-preview
```

- [ ] 用返回的实际预览URL核对首页双语/390px、CTA/演示、`/agents/`、`/llms.txt`、`/agent/catalog.json`、`/agent/feed.xml`、`/api/agent/search?q=React`、POST `/mcp`官方客户端发现search_docs/read_doc；未知文档404、RSS条件请求304。禁用预览遥测（已有配置）。
- [ ] 预览通过后从同一dist执行：

```bash
npx wrangler pages deploy dist --project-name=aislot --branch=main
```

- [ ] 在 `https://aislot.dev` 与 `https://aislot.pages.dev` 比对脚本资源文件名与本地dist一致；重跑上述读通道烟测，不把Vite成功等同Functions成功。检查现有生产遥测健康签名流程但不打印密钥。若失败恢复先前记录的成功生产部署：在Pages Deployments选择该ID的Rollback；按官方支持流程操作，不删除失败部署冒充回滚。恢复后再次核对hash。

### Task 3: 发布已验证tarball与外部回读

**Interfaces:** Consumes Task1精确tgz、版本；Produces npm dist-tag latest、integrity和消费证明。

- [ ] 紧邻发布再次查询目标版本；存在即不重复publish，比较其integrity与本地，只有相同产物才视为已完成，否则选择新的版本重走Task1。记下原latest用于恢复。
- [ ] 执行 `release_tarball=$(cat /tmp/ai-slot-release-tarball.txt)`，随后 `npm publish "$release_tarball" --access public --tag latest`。OTP按npm实际挑战由用户输入，不写文件/日志；不默认安装CI/OIDC架构，已有账号要求可信发布时才按账号配置执行。
- [ ] `release_version=$(cat /tmp/ai-slot-release-version.txt)` 与 `npm view "@ai-slot/proxy@$release_version" dist.integrity dist.tarball --json` 与本地计算的 `sha512-`+base64对比；新临时目录从**公网版本**安装再运行Task1烟测。
- [ ] 发布包无法覆盖；有缺陷则 `release_previous=$(cat /tmp/ai-slot-proxy-previous-latest.txt)` 后 `npm dist-tag add "@ai-slot/proxy@$release_previous" latest`，再发修复版；必要时 `npm deprecate "@ai-slot/proxy@$release_version" "该版本存在交付问题，请使用发布说明中的修复版本"`。不以unpublish作为常规回退。
- [ ] 将真实SHA、版本、Pages ID、安装验证补入release note；提交 `docs: 记录数据交付版本生产验证` 并 `git push origin master`。该记录不改变官网运行代码，无需仅为文档重复部署。

## 失败/停止边界

Git保护分支拒绝时创建普通PR并关联本聊天，不绕过保护。认证阻塞保存已完成产物并转做本地L/V；网络错误不得视为npm包不存在。没有真实线上回读不得标记R完成。

## 自审

包含push、Pages Functions+静态、npm版本不可覆盖/依赖可安装、独立烟测和恢复路径。没有把源码master错误用作Pages生产分支；没有发布新管理包。执行前参考：[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)、[Pages命令](https://developers.cloudflare.com/workers/wrangler/commands/pages/)。
