# Coding-agent compatibility

Openvibes uses the standard MCP STDIO transport. Automatic setup is implemented for Muse Code, Google Antigravity CLI, Codex CLI, and Claude Code CLI. Zed can be configured manually. Other MCP-compatible clients can use the same command and arguments.

See [CLIENT-SETUP.md](CLIENT-SETUP.md) for exact commands and configuration examples.

| Client | Setup | Current status |
|---|---|---|
| Muse Code | Official user settings.json schema | Automatic |
| Google Antigravity CLI | Global mcp_config.json | Automatic |
| Codex CLI | codex mcp add | Automatic |
| Claude Code | claude mcp add | Automatic |
| Zed | context_servers in settings.json | Manual |
| Other MCP hosts | STDIO command + absolute entrypoint path | Manual |

The setup command preserves existing entries and backs up JSON configuration before editing. It does not install or authenticate coding-agent applications. After setup, restart the client and inspect its MCP server manager.

Official references:
- [Muse Code MCP configuration](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/)
- [Antigravity MCP](https://antigravity.google/docs/mcp)
- [Codex MCP](https://developers.openai.com/codex/mcp/)
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Zed MCP](https://zed.dev/docs/ai/mcp)
