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

Restart the MCP server. Call `openvibes_comfy_server_info` to verify the local engine is reachable. For a basic text-to-image run, call `openvibes_comfy_list_checkpoints`, choose an installed checkpoint, then call `openvibes_comfy_generate_image` with your prompt and checkpoint name. This uses ComfyUI's standard CheckpointLoaderSimple, CLIPTextEncode, KSampler, VAEDecode and SaveImage nodes. For video, image-to-video, or custom graphs, call `openvibes_comfy_run_workflow` with the complete API-format workflow JSON. Openvibes queues the job, waits for completion, downloads supported outputs, and records the job/assets.

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

~~~bash
pip install comfy-mcp "comfy-cli>=1.14.0"
comfy install
comfy launch
~~~

The install command places the `comfy-mcp` STDIO server on PATH. Add a second MCP server entry to your coding agent with command `comfy-mcp` and no arguments, then restart the agent. The official server can search installed nodes/models/templates, build workflows, generate images and videos from natural language, monitor/cancel jobs, and fetch outputs.

The local Comfy MCP server runs on your own hardware and has no per-generation cloud fee. Partner-hosted models can spend Comfy credits, so avoid partner-generation tools if you require strictly local, no-credit generation. Comfy Cloud MCP is a separate hosted service: new users currently get five free runs to try it, and generation beyond that requires an active Comfy Cloud subscription. Openvibes does not enable or call Comfy Cloud automatically.

**Licensing:** Comfy MCP is AGPL-3.0-or-later (or commercial license); comfy-cli is GPL-3.0. Openvibes does not import or bundle their code. It is an optional, separately installed companion process. Review their licenses before redistribution or commercial deployment.

## Suggested free model starting points

These are model files, not cloud APIs. Download weights only from the official model publisher, review the model license, and make sure the machine has enough RAM/VRAM and disk space.

### Text-to-image

- **Stable Diffusion XL Base 1.0** — a practical first checkpoint for the built-in one-call image tool because it uses ComfyUI's standard CheckpointLoaderSimple node. The Hugging Face model card lists a roughly 6.94 GB safetensors checkpoint and the CreativeML Open RAIL++-M license. Read its use restrictions before commercial use: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- **FLUX.1-schnell** — Apache-2.0 licensed and capable of 1–4-step generation, but the Hugging Face files are gated behind acceptance and the main transformer file is large (about 23.8 GB). It normally needs a FLUX-specific ComfyUI workflow and is not the simple CheckpointLoader image path: https://huggingface.co/black-forest-labs/FLUX.1-schnell

### Text-to-video and image-to-video

- **Wan 2.1** — the official Wan repository states Apache-2.0 licensing. ComfyUI provides a smaller 1.3B text-to-video workflow as well as image-to-video and larger 14B workflows. Start with the 1.3B workflow if your hardware is limited; this is still GPU-intensive and not guaranteed to run on every machine.
  - [Wan 2.1 official repository and license](https://github.com/Wan-Video/Wan2.1)
  - [Comfy-Org Wan 2.1 model pack and workflow links](https://huggingface.co/Comfy-Org/Wan-2.1)
  - [ComfyUI text-to-video Wan workflow](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/text_to_video_wan.json)
  - [ComfyUI image-to-video Wan workflow](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_to_video_wan.json)
- **LTX-2.5** — newer open model family with ComfyUI templates, but its weights use the LTX-2.x Community License rather than Apache-2.0. Official docs currently list 32 GB+ GPU VRAM and 100 GB+ free disk for the ComfyUI path. Treat it as a high-hardware option and review its separate license: [LTX-2.5 docs](https://docs.ltx.io/open-source-model/integration-tools/comfy-ui).

For any video workflow, load the official template in ComfyUI, install its required nodes and model files, then export the graph in API format. Pass that JSON to openvibes_comfy_run_workflow. Do not copy a normal UI workflow JSON; the MCP tool expects the API-format graph.

## Hardware reality

As a rough guide from Comfy's current MCP documentation, a PC with a dedicated GPU and 24 GB+ VRAM handles most local image/video workflows; 8–24 GB can be workable for images but video may be slow or may not fit; below 8 GB, local video is generally impractical. The same guidance recommends cloud for current large open models on Mac GPUs. These are broad guidelines, not guarantees: exact requirements depend on model, resolution, quantisation, offloading and custom nodes. Openvibes does not secretly route jobs to a paid cloud provider. Check the model's own hardware guide before downloading large weights.

## API behavior

Openvibes uses ComfyUI's documented `POST /prompt`, `GET /history/{prompt_id}`, `GET /view`, and `GET /system_stats` endpoints. Workflows are supplied by the user/agent as API-format JSON; Openvibes does not guess node IDs or silently fabricate a workflow. Outputs are saved locally and include SHA-256 hashes.
