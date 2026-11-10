# Free local generation with ComfyUI

Openvibes keeps Meta Vibes as a separate, blocked provider until Meta documents an authorised unattended interface for free accounts. The supported alternative is **self-hosted ComfyUI**.

## What is free, and what is not

- ComfyUI and the official local Comfy MCP server are open source.
- Local inference uses your own computer; there is no per-generation cloud API charge.
- Model weights have their own licenses and hardware requirements. Check each model's license before commercial use.
- Cloud-hosted Comfy services and partner models may require subscriptions or credits. Openvibes' local provider does not use those services.

References:
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI)
- [Official Comfy MCP local server](https://github.com/Comfy-Org/comfy-mcp)
- [Comfy MCP overview and pricing distinction](https://comfy.org/mcp/)
- [ComfyUI server API routes](https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/comms_routes.mdx)

## Install local ComfyUI

Follow the current official installation instructions at https://docs.comfy.org/get_started.

Start ComfyUI with its default local API endpoint, usually `http://127.0.0.1:8188`. Install a compatible image or video model and its required custom nodes. Open the ComfyUI web interface, load a workflow, then export it in **API format** (not the normal UI workflow format).

## Configure Openvibes

Set these environment variables for the Openvibes MCP process:

```bash
COMFYUI_URL=http://127.0.0.1:8188
OPENVIBES_OUTPUT_DIR=./generated
```

Restart the MCP server. Call `openvibes_comfy_server_info` to verify the local engine is reachable. Call `openvibes_comfy_run_workflow` with the exported API-format workflow JSON to queue it, wait for completion, and download supported image/video outputs into the Openvibes output directory.

Example request structure:

```json
{
  "workflow": {
    "3": {
      "class_type": "KSampler",
      "inputs": {}
    }
  },
  "timeout_seconds": 600
}
```

The node graph above is only a shape illustration, not a valid generation workflow. Use a complete API-format workflow exported by your own ComfyUI installation.

## Easier alternative: official Comfy MCP

The official local MCP project already provides higher-level tools for image/video generation, workflow templates, job monitoring and output downloads:

```bash
pip install comfy-mcp "comfy-cli>=1.14.0"
comfy install
```

Follow the repository's current client setup guide: https://github.com/Comfy-Org/comfy-mcp. This local route is free to run on your own hardware. Do not confuse it with Comfy Cloud, which uses a paid subscription for generation.

## Hardware reality

Image and especially video generation can require substantial GPU memory and disk space. If the computer lacks a suitable GPU, local generation may be slow or infeasible. Openvibes does not secretly route jobs to a paid cloud provider. Check the model's own hardware guide before downloading large weights.

## API behavior

Openvibes uses ComfyUI's documented `POST /prompt`, `GET /history/{prompt_id}`, `GET /view`, and `GET /system_stats` endpoints. Workflows are supplied by the user/agent as API-format JSON; Openvibes does not guess node IDs or silently fabricate a workflow. Outputs are saved locally and include SHA-256 hashes.
