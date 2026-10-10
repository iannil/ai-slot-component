import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { request } from 'node:http';

// 仅供本机真实浏览器验收：两个 HTTPS 入口分别映射 WordPress 与公开交付服务。
const key = readFileSync(process.env.AI_SLOT_TLS_KEY);
const cert = readFileSync(process.env.AI_SLOT_TLS_CERT);
for (const [publicPort, upstreamPort] of [[18882, 18881], [4195, 4194]]) {
  createServer({ key, cert }, (incoming, outgoing) => {
    const upstream = request({ hostname: '127.0.0.1', port: upstreamPort, path: incoming.url,
      method: incoming.method, headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}`, 'accept-encoding': 'identity' } }, response => {
      const headers = { ...response.headers };
      if (upstreamPort === 18881) {
        for (const name of ['location', 'content-location']) {
          if (typeof headers[name] === 'string') headers[name] = headers[name].replaceAll('http://127.0.0.1:18881', 'https://127.0.0.1:18882');
        }
      }
      const type = String(headers['content-type'] ?? '');
      if (upstreamPort === 18881 && /text\/html|application\/json|text\/css/.test(type)) {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString().replaceAll('http://127.0.0.1:18881', 'https://127.0.0.1:18882');
          delete headers['content-length'];
          outgoing.writeHead(response.statusCode, headers).end(body);
        });
      } else { outgoing.writeHead(response.statusCode, headers); response.pipe(outgoing); }
    });
    upstream.on('error', () => outgoing.writeHead(502).end('upstream unavailable'));
    incoming.pipe(upstream);
  }).listen(publicPort, '127.0.0.1');
}
