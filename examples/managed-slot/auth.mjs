/** 管理令牌仅从服务端环境变量读取；任何请求正文都不能声明身份。 */
export function tokensFromEnv(env = process.env) {
  const owner = env.AI_SLOT_OWNER_TOKEN;
  const agent = env.AI_SLOT_AGENT_TOKEN;
  if (typeof owner !== 'string' || owner.length < 32 ||
      typeof agent !== 'string' || agent.length < 32 || owner === agent) {
    throw new Error('需设置两个不同且长度不少于32字符的管理令牌');
  }
  return new Map([
    [owner, { id: 'owner', grants: { hero: ['read', 'draft', 'approve', 'publish', 'rollback'] } }],
    [agent, { id: 'agent', grants: { hero: ['read', 'draft', 'publish', 'rollback'] } }],
  ]);
}
