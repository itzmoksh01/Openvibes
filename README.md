# Openvibes

**Open-source MCP server for AI image/video workflows.** It keeps the Meta Vibes free-account route evidence-gated and provides a practical local generation path through ComfyUI.

> **Current status: v0.3.0 — early development.** The MCP server has Meta Vibes capability reporting and a local ComfyUI provider. Meta Vibes unattended generation remains blocked because a public, authorized API for ordinary free Vibes accounts has not been verified. Local ComfyUI generation requires a running ComfyUI instance, compatible models and suitable hardware.

Openvibes is independent and is not affiliated with, endorsed by, sponsored by, or officially supported by Meta Platforms, Inc.

## What works

| Capability | Status |
|---|---|
| MCP STDIO server | Implemented |
| Local SQLite job and asset history | Implemented |
| Prompt structuring | Implemented |
| Muse Code configuration | Automated by `openvibes setup` |
| Antigravity configuration | Automated by `openvibes setup` |
| Codex configuration | Automated when Codex CLI is installed |
| Claude Code configuration | Automated when Claude CLI is installed |
| ComfyUI connection and system check | Implemented |
| One-call local text-to-image | Implemented; requires a compatible installed checkpoint |
| Custom ComfyUI image/video workflows | Implemented; requires an API-format workflow |
| Output download, SHA-256, and asset records | Implemented |
| Job wait/resume and queue cancellation | Implemented |
| Meta Vibes free-plan image/video automation | **BLOCKED / not verified** |
| Paid Meta Model API fallback | **Not enabled** |

## Quick installation

Requirements: Node.js 22.13+, npm 10+, Git.

Install Openvibes directly from the public GitHub repository:

```bash
npm install --global github:itzmoksh01/Openvibes
openvibes setup --client auto
openvibes doctor
```

The installer backs up existing Muse Code / Antigravity JSON settings before adding the Openvibes MCP entry. Codex and Claude Code are configured through their official CLIs. Existing unrelated MCP entries are preserved. A conflicting entry named `openvibes` is not overwritten.

For all supported JSON/CLI clients:

```bash
openvibes setup --client all
```

Restart or reload the MCP host after setup. See [Client setup](docs/CLIENT-SETUP.md) for manual configuration and verification.

## Generate an image locally

1. Install ComfyUI using its official instructions: https://docs.comfy.org/get_started
2. Start ComfyUI. Its default local API address is `http://127.0.0.1:8188`.
3. Install a checkpoint model compatible with the standard ComfyUI nodes.
4. In your coding agent, ask Openvibes to call `openvibes_comfy_list_checkpoints`.
5. Call `openvibes_comfy_generate_image` with your prompt and one exact checkpoint name.

Defaults are 768×768, 24 steps and CFG 7. The output is saved under `OPENVIBES_OUTPUT_DIR/images` (default: `~/Openvibes/generated/images`) and registered in the asset database.

## Generate video or use advanced workflows

Video model workflows vary by model and custom nodes. Export the workflow from ComfyUI in **API format**, then ask your agent to call `openvibes_comfy_run_workflow` with that JSON and `kind: "video"` or `"image-to-video"`. Openvibes submits the job, waits, downloads supported image/video outputs, records hashes and keeps the job ID for follow-up.

See [Free local ComfyUI setup](docs/COMFYUI-LOCAL.md).

## MCP tools

**Meta status**
- `openvibes_get_capabilities`
- `openvibes_generate_image` — intentionally returns BLOCKED until an authorized Meta Vibes route is verified
- `openvibes_generate_video` — same evidence gate
- `openvibes_animate_image` — same evidence gate

**Local ComfyUI**
- `openvibes_comfy_server_info`
- `openvibes_comfy_list_checkpoints`
- `openvibes_comfy_generate_image`
- `openvibes_comfy_run_workflow`
- `openvibes_comfy_check_job`
- `openvibes_comfy_download_outputs`

**Jobs and assets**
- `openvibes_get_job`
- `openvibes_wait_for_job`
- `openvibes_list_jobs`
- `openvibes_cancel_job`
- `openvibes_list_assets`
- `openvibes_get_asset`
- `openvibes_doctor`

## Free means local hardware, not magic cloud compute

ComfyUI and its local MCP integration are open-source. Local model inference has no per-generation API charge, but it uses your own GPU/CPU, RAM, disk space and electricity. Video generation can require substantial VRAM and time. Model weights and custom nodes have their own licenses; check them before commercial use.

Comfy Cloud is a separate hosted service and may have trial limits or paid usage. Openvibes does not enable it automatically and the local provider does not send jobs to it.

## Why Meta Vibes is blocked

Meta publicly describes Vibes as a consumer experience for creating AI videos and animating images. That description is not a developer API contract. Meta's separate Muse Image API is documented at **$0.01 per successfully generated image**; it is not the free Vibes entitlement and is not enabled as a fallback. See [Meta feasibility and evidence](docs/META-FEASIBILITY.md).

Unofficial browser/session-cookie projects exist, but they are not Meta-supported integrations and may depend on private web internals or session extraction. Openvibes deliberately does not copy those approaches, collect passwords/cookies, bypass CAPTCHA, evade quotas, or use undocumented private endpoints.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

The GitHub Actions CI workflow runs on Ubuntu, Windows and macOS. Do not claim a release is production-ready until CI and a real ComfyUI end-to-end generation have passed.

## Security

- No passwords or session cookies are collected.
- No undocumented Meta endpoints or private GraphQL operations.
- No CAPTCHA or rate-limit bypass.
- No paid provider is silently selected.
- Existing client configuration files are backed up before modification.
- Jobs and generated assets are stored locally.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
