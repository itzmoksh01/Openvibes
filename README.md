# Openvibes

**Open-source MCP server for hosted and local multimodal AI.** Use hosted text, image, video and audio models through Pollinations without downloading model weights, or use local ComfyUI when you prefer offline/local inference.

> **Current status: v0.3.0 — early development.** The MCP server has hosted Cloudflare and Pollinations providers, Meta Vibes capability reporting, and a local ComfyUI provider. Meta Vibes unattended generation remains blocked because a public, authorized API for ordinary free Vibes accounts has not been verified. Local ComfyUI generation requires a running ComfyUI instance, compatible models and suitable hardware.

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
| Zed configuration | Automated when Zed is detected (strict JSON settings only) |
| Cloudflare Workers AI hosted text (Gemma 4 26B A4B) | Implemented; 10,000 Neurons/day free allowance on eligible Free plan |
| Cloudflare hosted image (FLUX.1-schnell) | Implemented; uses daily Workers AI allowance |
| Cloudflare hosted text-to-speech (Aura-1) | Implemented; $0.015 per 1,000 characters, charged in Neurons and eligible for the daily free allocation |
| Pollinations hosted text/image/video/audio | Implemented; requires user-owned key and available Pollen budget |
| ComfyUI connection and system check | Implemented |
| One-call local text-to-image | Implemented; requires a compatible installed checkpoint |
| Custom ComfyUI image/video workflows | Implemented; requires an API-format workflow |
| Output download, SHA-256, and asset records | Implemented |
| Job wait/resume and queue cancellation | Implemented |
| Meta Vibes free-plan image/video automation | **BLOCKED / not verified** |
| Paid Meta Model API fallback | **Not enabled** |

## Quick installation

Requirements: Node.js 22.13+, npm 10+, Git.

The npm registry package has not been published or verified yet. The owner-only OIDC setup and release sequence are documented in [npm Trusted Publishing](docs/NPM-TRUSTED-PUBLISHING.md). Install from the public GitHub repository:

```bash
npm install --global github:itzmoksh01/Openvibes
openvibes setup --client auto
openvibes doctor
```

Automatic setup always registers Muse Code, then adds detected Antigravity, Codex, Claude Code and Zed clients. The installer backs up existing JSON settings before adding the Openvibes entry. Codex and Claude Code are configured through their official CLIs. Existing unrelated MCP entries are preserved. A conflicting entry named `openvibes` is not overwritten.

For all supported JSON/CLI clients:

```bash
openvibes setup --client all
```

Restart or reload the MCP host after setup. See [Client setup](docs/CLIENT-SETUP.md) for manual configuration and verification.

## Generate online without installing model weights

Openvibes can call hosted models without downloading model weights. For a daily free allowance, connect [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/): set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then use `openvibes_cloudflare_generate_text` (Google Gemma 4 26B A4B), `openvibes_cloudflare_generate_image` (FLUX.1-schnell), or `openvibes_cloudflare_generate_audio` (Deepgram Aura-1 TTS). Aura is a hosted Deepgram partner model, not an open-weight model. Current unit rates: Gemma 4 is $0.10/M input and $0.30/M output tokens; FLUX.1-schnell is $0.0000528 per 512×512 tile plus $0.0001056 per step; Aura-1 is $0.015 per 1,000 characters. These consume Neurons; the Free Workers allowance is 10,000 Neurons/day. Usage above that requires Workers Paid and is billed at $0.011 per 1,000 Neurons. For a wider live model catalogue and video/audio generation, optionally connect [Pollinations](https://github.com/pollinations/pollinations): create a user-owned key at https://enter.pollinations.ai/keys and set `OPENVIBES_POLLINATIONS_API_KEY`. Pollinations usage depends on the user's Pollen balance and model prices; it is not unlimited free compute. Do not paste credentials into prompts, source code, GitHub, or public MCP config files.

Use `openvibes_hosted_list_models` to inspect live text/image/video/audio catalogues, capabilities and pricing. Use `openvibes_hosted_generate_text` for text, and `openvibes_hosted_generate_media` with `kind: image`, `video` or `audio` to generate and automatically download output into `generated/`. Choose a model ID from the live catalogue; do not assume all models are free or open-weight. Pollinations generation requires a user-authorized key and available Pollen budget. The API key's budget is a spending cap, not free credits. Usage may cost Pollen, and exhausted budgets return an error. See [Hosted inference](docs/HOSTED-INFERENCE.md).

## Generate an image locally

1. Install ComfyUI using its official instructions: https://docs.comfy.org/get_started
2. Start ComfyUI. Its default local API address is `http://127.0.0.1:8188`.
3. Install a checkpoint model compatible with the standard ComfyUI nodes.
4. In your coding agent, ask Openvibes to call `openvibes_comfy_list_checkpoints`.
5. Call `openvibes_comfy_generate_image` with your prompt and one exact checkpoint name.

Defaults are 768×768, 24 steps and CFG 7. The output is saved under `OPENVIBES_OUTPUT_DIR/images` (default: `~/Openvibes/generated/images`) and registered in the asset database.

## Generate video or use advanced workflows

Video model workflows vary by model and custom nodes. Export the workflow from ComfyUI in **API format**, then ask your agent to call `openvibes_comfy_run_workflow` with that JSON and `kind: "video"` or `"image-to-video"`. Openvibes submits the job and waits up to 30 seconds by default. If it is still running, it returns a persistent job ID; ask the agent to call `openvibes_wait_for_job` until the job reaches `SAVED`, and it will download outputs and record hashes automatically.

For a higher-level natural-language video workflow experience, you can optionally install Comfy Org's separate first-party local MCP server:

~~~bash
pip install comfy-mcp "comfy-cli>=1.14.0"
comfy install
comfy launch
~~~

Register the `comfy-mcp` command as a second STDIO MCP server. Its local route runs on your own hardware; partner-hosted model tools can spend credits, and Comfy Cloud is a separate paid hosted route. Openvibes never silently switches to either. The companion is separately licensed (AGPL-3.0-or-later or commercial); Openvibes does not bundle its code.

See [Free local ComfyUI setup](docs/COMFYUI-LOCAL.md).

## MCP tools

**Meta status**
- `openvibes_get_capabilities`
- `openvibes_cloudflare_generate_text` — hosted Google Gemma 4 26B A4B text generation
- `openvibes_cloudflare_generate_image` — hosted FLUX image generation using Cloudflare's daily free allocation
- `openvibes_cloudflare_generate_audio` — hosted text-to-speech with Deepgram Aura-1
- `openvibes_hosted_list_models`
- `openvibes_hosted_generate_text`
- `openvibes_hosted_generate_media` — image/video/audio with automatic download
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

## Free means local hardware or provider-specific free allowances, not unlimited cloud compute

ComfyUI and its local MCP integration are open-source. Local model inference has no per-generation API charge, but it uses your own GPU/CPU, RAM, disk space and electricity. Hosted inference avoids local model installation but depends on the provider's live pricing, free allowances and account quotas; Openvibes never claims unlimited free hosted compute. Video generation can require substantial VRAM and time. Model weights and custom nodes have their own licenses; check them before commercial use.

Comfy Cloud is a separate hosted service. Its official MCP docs currently advertise five free runs for new users; generation beyond the trial requires an active subscription. This is a limited trial, not unlimited free compute. Openvibes does not enable it automatically and the local provider never sends jobs to it.

## Why Meta Vibes is blocked

Meta publicly describes Vibes as a consumer experience for creating AI videos and animating images. That description is not a developer API contract. Meta's separate Muse Image API is documented at **$0.01 per successfully generated image**; it is not the free Vibes entitlement and is not enabled as a fallback. See [Meta feasibility and evidence](docs/META-FEASIBILITY.md).

Unofficial browser/session-cookie projects exist, but they are not Meta-supported integrations and may depend on private web internals or session extraction. A generic persistent-browser MCP can preserve a login session, but it does not provide an authorized Vibes generation API; a Vibes-specific UI bot would still require separate authorization and would be fragile. Openvibes deliberately does not copy those approaches, collect passwords/cookies, bypass CAPTCHA, evade quotas, or use undocumented private endpoints. See [Meta Vibes automation research and integration decision](docs/META-VIBES-RESEARCH.md) for the repository review and recommended path.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

GitHub Actions checks Node.js 22 and 24 on Ubuntu, plus Node.js 22 on Windows and macOS. It runs type-checking, build, tests, dependency audit, package-content verification and CLI smoke checks. A passing CI run still does not replace a live provider test. Do not call a release production-ready until the release checklist in [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md) is complete.

## Security

- No passwords or session cookies are collected.
- No undocumented Meta endpoints or private GraphQL operations.
- No CAPTCHA or rate-limit bypass.
- No paid provider is silently selected.
- Existing client configuration files are backed up before modification.
- Jobs and generated assets are stored locally.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
