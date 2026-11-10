# Architecture

Openvibes separates MCP interface, local orchestration and provider implementation.

```text
Coding agent -> MCP STDIO server -> tools -> job store / prompt engine -> provider registry
                                                              |
                                                       local asset store
```

## Current implementation

- MCP server: official TypeScript SDK v2 package `@modelcontextprotocol/server`.
- Transport: STDIO.
- Runtime: Node.js 22.13+.
- Validation: Zod v4.
- Job persistence: Node built-in `node:sqlite`.
- Provider: `MetaVibesFreeProvider`, currently evidence-gated and blocked.

## Constraints

- Multiple MCP processes may share the same SQLite path using WAL and busy timeout.
- STDIO stdout is reserved for protocol messages; diagnostics belong on stderr.
- Capability claims must be evidence-backed.
- Paid providers are not silently enabled.
- Client configuration must be backed up and validated before automated modification.
