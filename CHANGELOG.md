# Changelog

## 0.3.0 - 2026-11-10

- Added one-call local text-to-image generation using standard ComfyUI checkpoint nodes.
- Added installed-checkpoint discovery.
- Added a shared ComfyUI job runner with persistent status, output downloads and asset records.
- Improved queue cancellation to verify the target prompt ID before interrupting.
- Added clearer provider capability and doctor reporting.
- Meta Vibes free-plan automation remains blocked pending official authorization evidence.
- Build and live ComfyUI integration tests remain pending due to restricted outbound network access in the development environment.

## 0.2.0 - 2026-11-10

- Added a local ComfyUI API provider.
- Added MCP tools for ComfyUI server info, workflow submission, job checking, output download, and cancellation.
- Persisted provider prompt IDs and downloaded asset metadata.
- Added automatic client setup for detected Claude Code, Codex, Zed, and Google Antigravity installations.
- Added ComfyUI setup and hardware guidance.

## 0.1.0 - 2026-11-10

- Initial MCP server and CLI scaffold.
- Evidence-gated Meta Vibes free provider.
- SQLite job history and asset metadata schema.
- Prompt structuring, diagnostics, documentation and initial tests.
- Meta image/video automation intentionally blocked pending official authorization evidence.
