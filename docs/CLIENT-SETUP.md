# MCP client setup

Openvibes uses MCP over STDIO. After installing the package, run:

```bash
openvibes setup --client auto
openvibes doctor
```

The setup command detects supported installed clients and adds the Openvibes entry using each client's current MCP configuration format.

## Supported clients

| Client | Automatic setup method | Configuration |
|---|---|---|
| Muse Code | Writes settings JSON | `~/.config/muse/settings.json` (or `$XDG_CONFIG_HOME/muse/settings.json`), `mcp_servers`, `transport: "stdio"`, `enabled: true`, `mode: "optional"` |
| Antigravity | Writes settings JSON | `~/.gemini/config/mcp_config.json` |
| Codex | Uses `codex mcp add` | Codex CLI-managed config |
| Claude Code | Uses `claude mcp add --scope user` | Claude Code CLI-managed config |
| Zed | Writes settings JSON | `settings.json`, `context_servers` |

To explicitly configure one client, use `openvibes setup --client muse`, `antigravity`, `codex`, `claude`, or `zed`.

To attempt every supported client, run:

```bash
openvibes setup --client all
```

## Safety behavior

- Existing unrelated MCP entries are preserved.
- Existing JSON settings files are backed up before changes.
- If a settings file is malformed or contains a conflicting Openvibes entry, setup leaves it unchanged and reports the problem.
- Zed settings may contain JSON comments. If the existing file is not strict JSON, automatic setup refuses to rewrite it; add the server through Zed's MCP settings UI instead.
- Codex and Claude entries already named `openvibes` are left unchanged. Remove the old entry with the client's own CLI first if you deliberately want to replace it.
- No passwords, browser cookies or Meta session tokens are written to client configuration.

## Manual verification

Restart the MCP host after setup, then verify:

**Muse Code:** run `/mcp` in a session. The settings file requires `schema_version: 1`; stdio server entries are under `mcpServers`. Official reference: https://dev.meta.ai/docs/muse-code/extending

**Antigravity:** open the MCP manager with `/mcp` in the CLI or Settings → MCP Servers in the IDE. Global config: `~/.gemini/config/mcp_config.json`. Official reference: https://www.antigravity.google/docs/cli/mcp/

**Codex:** run `codex mcp list`. Codex supports STDIO servers through `codex mcp add`. Official reference: https://developers.openai.com/codex/mcp/

**Claude Code:** run `claude mcp list`, then `/mcp` in a session. User-scoped configuration is available across projects. Official reference: https://code.claude.com/docs/en/mcp

**Zed:** open Settings → AI → MCP Servers and confirm that Openvibes is active. Zed uses `context_servers`, not `mcpServers`. Official reference: https://zed.dev/docs/ai/mcp

## Manual STDIO entry

For a manual setup, use absolute paths:

```json
{
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/Openvibes/dist/src/index.js", "mcp"],
  "env": {
    "COMFYUI_URL": "http://127.0.0.1:8188",
    "OPENVIBES_DATA_DIR": "/absolute/path/to/.openvibes/data",
    "OPENVIBES_OUTPUT_DIR": "/absolute/path/to/Openvibes/generated"
  }
}
```

## ComfyUI connection

Start your local ComfyUI server (default `http://127.0.0.1:8188`). Call `openvibes_comfy_server_info` to verify connectivity. Use `openvibes_comfy_list_checkpoints` then `openvibes_comfy_generate_image` for one-call text-to-image generation. For video, export a full API-format ComfyUI workflow and use `openvibes_comfy_run_workflow`.

See [COMFYUI-LOCAL.md](COMFYUI-LOCAL.md) for model guidance, model licenses and video workflow instructions.
