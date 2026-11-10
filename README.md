# Openvibes

**Open-source MCP server for local AI image/video workflows, with a separately gated Meta Vibes provider.**

> **Current version: 0.2.0 — early development.** Openvibes now includes a local ComfyUI API provider for running user-supplied API-format workflows, monitoring jobs and downloading outputs. Meta Vibes free-plan automation remains blocked because an authorised unattended public interface has not been verified.

Openvibes is an independent community project. It is not affiliated with, endorsed by, sponsored by, or officially supported by Meta Platforms, Inc.

## What works

| Capability | Status |
|---|---|
| MCP STDIO server | Implemented; build/protocol tests pending |
| Local SQLite job history | Implemented |
| Prompt structuring | Implemented |
| ComfyUI local server discovery | Implemented |
| ComfyUI workflow submission | Implemented |
| ComfyUI job polling | Implemented |
| ComfyUI image/video output download | Implemented for supported output nodes and formats |
| ComfyUI cancellation | Implemented for confirmed queued/running jobs |
| Meta Vibes free image/video generation | Blocked / unverified |
| Automatic generic workflow construction | Not implemented; supply API-format workflow JSON |

## Free local generation

The practical free route is to run [ComfyUI](https://github.com/Comfy-Org/ComfyUI) and compatible open models on your own hardware. Openvibes does not send jobs to Comfy Cloud or paid partner models.

Read [docs/COMFYUI-LOCAL.md](docs/COMFYUI-LOCAL.md) for installation, hardware considerations, and setup. For a higher-level ready-made local integration, see the official [Comfy MCP](https://github.com/Comfy-Org/comfy-mcp) project.

## Quick start

~~~bash
git clone https://github.com/itzmoksh01/Openvibes.git
cd Openvibes
npm install
npm run typecheck
npm test
npm link
openvibes setup --client auto
~~~

Set COMFYUI_URL=http://127.0.0.1:8188, start ComfyUI, export a workflow in API format, and use openvibes_comfy_run_workflow. Output files are downloaded to OPENVIBES_OUTPUT_DIR (default: generated).

## MCP tools

- openvibes_get_capabilities
- openvibes_generate_image / openvibes_generate_video / openvibes_animate_image — Meta provider, currently blocked
- openvibes_comfy_server_info
- openvibes_comfy_run_workflow
- openvibes_comfy_check_job
- openvibes_comfy_download_outputs
- openvibes_get_job
- openvibes_wait_for_job
- openvibes_list_jobs
- openvibes_cancel_job
- openvibes_list_assets
- openvibes_get_asset
- openvibes_doctor

## Meta Vibes limitation

Meta's public Vibes page describes consumer creation, remixing, and image animation. It does not establish an authorised public API for unattended generation using a standard free account. Openvibes does not use private endpoints, session-cookie replay, CAPTCHA bypass, or hidden paid fallbacks. See docs/META-FEASIBILITY.md.

## Security

- No passwords or browser session cookies are collected.
- No undocumented Meta endpoints or private GraphQL operations.
- No CAPTCHA or rate-limit bypass.
- No silent paid-provider fallback.
- Local-first job and asset storage.
- Only connect to a ComfyUI instance you control or are authorised to use.

## License

Apache-2.0. See LICENSE and NOTICE.
