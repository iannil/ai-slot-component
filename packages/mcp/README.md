# @ai-slot/mcp

**English** | [简体中文](https://github.com/iannil/ai-slot-component/blob/master/packages/mcp/README.zh-CN.md)

An experimental AI-SLOT management MCP package requiring Node.js 22 or later. It exposes tools over local stdio and forwards requests to a fixed management service at `http://127.0.0.1:4194`. It does not start that service, open the version store, or grant approval permissions. Compatibility across versions is not yet guaranteed for the 0.x interface.

## Installation and usage

```bash
npm install @ai-slot/mcp
```

First, start the service by following the repository's [management reference service instructions](https://github.com/iannil/ai-slot-component/tree/master/examples/managed-slot). Set the `AI_SLOT_AGENT_TOKEN` environment variable to the token configured for the Agent by the service. Do not give the Owner token to the Agent or commit real tokens to a configuration repository.

The command in your client configuration can point to `node_modules/.bin/ai-slot-management-mcp` in the project where the package is installed. From that project's terminal, you can run:

```bash
npx --no-install ai-slot-management-mcp
```

The process communicates using MCP over standard input and output; no manual input is required. The programmatic API exports `createManagementClient` and `createManagementServer`.

## Capabilities and limitations

Seven tools support slot discovery, reading, draft creation, preview, publication, rollback, and status checks. There is no approval tool. The Agent can submit the corresponding artifact only after the Owner approves it on the reference management page. Retrieve the actual tool list through MCP `tools/list`.

The initial release supports only the fixed local HTTP service. Remote MCP, arbitrary target URLs, multiple tenants, and automatic approval by AI are not supported. The published package does not include the reference management page, CMS plugins, or service configuration; these are in the repository. Validation with the official SDK, real stdio, HTTP, and the complete browser workflow has passed. External AI clients and real customer pilots still await validation.

MIT license. Report issues at https://github.com/iannil/ai-slot-component/issues.
