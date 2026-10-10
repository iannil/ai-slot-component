export interface ManagementClient {
  call(path: string, input: unknown): Promise<unknown>;
}

export class ManagementError extends Error {
  constructor(readonly code: string) { super(code); }
}

const allowedPaths = new Set([
  '/ops/list', '/ops/read', '/ops/draft', '/ops/preview', '/ops/publish',
  '/ops/rollback/prepare', '/ops/rollback/commit', '/ops/status',
]);

/** 地址在启动时固定；工具参数不能选择服务器，也不能请求批准端点。 */
export function createManagementClient({ baseUrl, token }: { baseUrl: string; token: string }): ManagementClient {
  let url: URL;
  try { url = new URL(baseUrl); }
  catch { throw new ManagementError('invalid_base_url'); }
  if (url.href !== 'http://127.0.0.1:4194/' || !token) throw new ManagementError('invalid_configuration');
  return {
    async call(path, input) {
      if (!allowedPaths.has(path)) throw new ManagementError('invalid_path');
      let response: Response;
      try {
        response = await fetch(new URL(path, url), {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(input),
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
      } catch { throw new ManagementError('service_unavailable'); }
      let value: unknown;
      try {
        if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error();
        value = await response.json();
      } catch { throw new ManagementError('invalid_response'); }
      if (value && typeof value === 'object' && !Array.isArray(value) && 'error' in value) {
        const code = value.error;
        throw new ManagementError(typeof code === 'string' ? code : 'invalid_response');
      }
      if (!response.ok) throw new ManagementError('http_error');
      return value;
    },
  };
}
