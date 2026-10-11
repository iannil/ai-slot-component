#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createManagementClient } from './client.js';
import { createManagementServer } from './tools.js';

/** 标准输出专供 MCP 协议；任何启动诊断写到标准错误。 */
export async function main(): Promise<void> {
  const token = process.env.AI_SLOT_AGENT_TOKEN;
  if (!token) throw new Error('AI_SLOT_AGENT_TOKEN 缺失');
  const client = createManagementClient({ baseUrl: 'http://127.0.0.1:4194', token });
  await createManagementServer(client).connect(new StdioServerTransport());
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'MCP 启动失败'}\n`); process.exitCode = 1; });
}
