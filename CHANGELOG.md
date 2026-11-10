# Changelog

## Unreleased

- Replace the deprecated Cloudflare Llama 3.1 default with the currently documented Google Gemma 4 26B A4B model.
- Harden Cloudflare and Pollinations provider inputs, asynchronous job identifiers, JSON parsing and media download limits.
- Detect Cloudflare-generated image formats and save files with matching extensions and MIME types.
- Harden local ComfyUI response handling and workflow size limits.
- Improve SQLite file permissions, asset metadata validation and missing-job detection.
- Improve provider readiness diagnostics without exposing credential values.
- Add real-process MCP STDIO smoke coverage, SQLite persistence tests and bounded-response tests.
- Expand cross-platform CI, CodeQL, Dependabot, npm dependency auditing and provenance-based publishing gates.
- Keep the release marked early-development until a committed dependency lockfile, passing CI and live provider/host verification are available.

## 0.3.0 - 2026-11-10

- Added one-call local text-to-image generation using standard ComfyUI checkpoint nodes.
- Added installed-checkpoint discovery.
- Added a shared ComfyUI job runner with persistent status, output downloads, SHA-256 hashes and asset records.
- Improved queue cancellation to verify the target prompt ID before interrupting.
- Added automatic MCP setup for Muse Code, Google Antigravity CLI, Codex CLI, Claude Code CLI and Zed.
- Added model licensing guidance and official Wan 2.1 / LTX-2.5 video workflow references.
- Documented the distinction between free Meta Vibes and the separately billed Muse Image API.
- Meta Vibes free-plan automation remains blocked pending official authorization evidence.
- Build and live ComfyUI integration tests remain pending due to restricted outbound network access in the development environment.

## 0.2.0 - 2026-11-10

- Added a local ComfyUI API provider.
- Added MCP tools for ComfyUI server info, workflow submission, job checking, output download, and cancellation.
- Persisted provider prompt IDs and downloaded asset metadata.
- Added initial automatic client setup and ComfyUI setup/hardware documentation.

## 0.1.0 - 2026-11-10

- Initial MCP server and CLI scaffold.
- Evidence-gated Meta Vibes free provider.
- SQLite job history and asset metadata schema.
- Prompt structuring, diagnostics, documentation and initial tests.
- Meta image/video automation intentionally blocked pending official authorization evidence.
