import { test, expect } from 'vitest';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// npm 的 bin 是符号链接，必须走真正入口，而不是静默退出。
test('安装后的符号链接CLI入口仍执行启动校验', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-slot-mcp-cli-'));
  try {
    const command = join(directory, 'ai-slot-management-mcp');
    await symlink(fileURLToPath(new URL('../dist/server.js', import.meta.url)), command);
    const result = spawnSync(process.execPath, [command], {
      env: { ...process.env, AI_SLOT_AGENT_TOKEN: '' }, encoding: 'utf8', timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('AI_SLOT_AGENT_TOKEN 缺失');
    expect(result.stdout).toBe('');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
