# MCP client setup

Openvibes exposes a local MCP server over STDIO. Build it first, then register the absolute path to the compiled entrypoint.

## 1. Build Openvibes

~~~bash
git clone https://github.com/itzmoksh01/Openvibes.git
cd Openvibes
npm install
npm run typecheck
npm test
~~~

The compiled entrypoint is dist/src/index.js. Use its absolute path in client configuration.

## 2. Automatic setup

Run:

~~~bash
npm link
openvibes setup --client auto
~~~

Supported automatic setup targets are Muse Code, Google Antigravity CLI, Codex CLI, and Claude Code CLI. The setup command reports detected clients, configuration changes and errors. Existing entries are preserved; JSON settings files are backed up before modification.

To configure all supported clients even when not detected:

~~~bash
openvibes setup --client all
~~~

## 3. Client-specific setup

### Muse Code

Muse Code reads user MCP settings from ~/.config/muse/settings.json (or $XDG_CONFIG_HOME/muse/settings.json). The setup command adds an entry under mcpServers using the documented type=stdio schema, sets required=false, and allows a 600-second tool timeout.

You can inspect the active servers with /mcp. Restart Muse Code after changing settings.

Official documentation: https://dev.meta.ai/docs/muse-code/configuration and https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/

### Google Antigravity CLI

Antigravity CLI uses agy and its global MCP configuration at ~/.gemini/config/mcp_config.json. Open /mcp in the CLI to inspect server status.

Official documentation: https://antigravity.google/docs/mcp and https://antigravity.google/docs/cli/mcp

### Codex CLI

Openvibes setup uses the official command form:

~~~bash
codex mcp add openvibes --env COMFYUI_URL=http://127.0.0.1:8188 --env OPENVIBES_DATA_DIR=/absolute/path/to/data --env OPENVIBES_OUTPUT_DIR=/absolute/path/to/generated -- node /absolute/path/to/Openvibes/dist/src/index.js mcp
~~~

Inspect the result with codex mcp list. Official docs: https://developers.openai.com/codex/mcp/

### Claude Code

Openvibes setup uses the official CLI:

~~~bash
claude mcp add --scope user --transport stdio -e COMFYUI_URL=http://127.0.0.1:8188 -e OPENVIBES_DATA_DIR=/absolute/path/to/data -e OPENVIBES_OUTPUT_DIR=/absolute/path/to/generated openvibes -- node /absolute/path/to/Openvibes/dist/src/index.js mcp
~~~

Inspect the result with claude mcp list. Official docs: https://docs.anthropic.com/en/docs/claude-code/mcp

### Zed (manual)

Zed is not currently modified by the automatic setup command. Add an entry to your Zed settings.json under context_servers:

~~~json
{
  "context_servers": {
    "openvibes": {
      "command": "node",
      "args": ["/absolute/path/to/Openvibes/dist/src/index.js", "mcp"],
      "env": {
        "COMFYUI_URL": "http://127.0.0.1:8188",
        "OPENVIBES_DATA_DIR": "/absolute/path/to/data",
        "OPENVIBES_OUTPUT_DIR": "/absolute/path/to/generated"
      }
    }
  }
}
~~~

Merge this into your existing settings; do not replace the entire file. Restart Zed and verify the MCP server.

## 4. Configure ComfyUI

Start ComfyUI locally (default http://127.0.0.1:8188). Use openvibes_comfy_server_info to check connectivity. Use openvibes_comfy_list_checkpoints to list installed image checkpoints, then openvibes_comfy_generate_image for a one-call text-to-image job. For video, export a full API-format ComfyUI workflow and use openvibes_comfy_run_workflow.

See COMFYUI-LOCAL.md for model recommendations, licensing, and video workflows.

## Security

Only connect Openvibes to a ComfyUI server you control or are authorized to use. Keep ComfyUI bound to localhost unless you have configured appropriate network security. Never put passwords or session cookies in MCP environment variables.
