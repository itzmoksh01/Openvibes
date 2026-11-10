# Coding-agent compatibility

Openvibes exposes a local MCP STDIO server. Client configuration is created only for detected clients when running `openvibes setup --client auto`; `--client all` creates supported JSON entries even if an application is not detected. Existing JSON configuration files are backed up before Openvibes writes them. Existing `openvibes` entries are left unchanged.

| Client | Setup path | Status |
|---|---|---|
| Claude Code | `claude mcp add --transport stdio --scope user openvibes -- node <entrypoint> mcp` | Configured through official CLI when available |
| Codex | `codex mcp add openvibes -- node <entrypoint> mcp` | Configured through official CLI when available |
| Zed | `context_servers` in user settings JSON | Supported JSON merge |
| Google Antigravity | `mcpServers` in `~/.gemini/config/mcp_config.json` | Supported JSON merge |
| Muse Code | No verified official config schema | Manual configuration not automated |

The CLI checks for existing server entries and avoids replacing them. If a CLI is installed but its MCP command fails, the output includes the command error. Restart the client after setup and confirm Openvibes appears in its MCP server list.

References:
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)
- [Zed MCP](https://zed.dev/docs/ai/mcp)
- [Google Antigravity MCP](https://antigravity.google/docs/mcp)
