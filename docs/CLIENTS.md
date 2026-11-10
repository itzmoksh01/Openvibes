# Coding-agent compatibility

Openvibes uses MCP STDIO. Compatibility depends on the host's MCP implementation and configuration schema.

| Client | Status |
|---|---|
| Claude Code | MCP-compatible target; local connection not yet tested |
| Codex | MCP-compatible target; local connection not yet tested |
| Zed | MCP-compatible target; local connection not yet tested |
| Antigravity | Configuration format requires current official verification |
| Muse Code | Configuration format requires current official verification |

The CLI currently detects likely local installation directories only. Detection is not proof of a working connection. It does not modify client configuration files.
