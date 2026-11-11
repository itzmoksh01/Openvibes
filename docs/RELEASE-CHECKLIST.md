# Production Release Checklist

A green unit-test suite is necessary but is not sufficient for a production release. Do not mark a release ready until every applicable item below has evidence.

## Source and dependency integrity

- [x] Commit and review `package-lock.json`; CI and release workflows use `npm ci`.
- [x] Pin direct dependencies and configure Dependabot for npm and GitHub Actions updates.
- [x] The latest CI run passed `npm audit --audit-level=high` on the tested Linux matrix jobs; rerun on every release commit.
- [x] CodeQL analysis is configured and the latest run on the current release baseline completed successfully; review any new findings on each release commit. Dependabot update schedules are configured.
- [x] CI reviews npm package contents with `npm pack --dry-run`.
- [x] Confirm LICENSE, NOTICE, README, docs and runtime files are included in the package allowlist and pack smoke check.

## Automated verification

- [x] Minimum supported Node.js 22.13.0 passes type-check, build and tests on Linux, Windows and macOS.
- [x] Node.js 24 passes type-check, build and tests on Linux.
- [x] Windows, macOS and Linux pass the supported CI matrix.
- [x] MCP STDIO smoke test completes initialize, tools/list and a mocked ComfyUI image-generation/download flow without stdout contamination.
- [x] SQLite job and asset records persist across a Store close/reopen cycle.
- [x] Asset filename, metadata and path-traversal validation have automated tests.
- [x] Introduce SQLite schema version 2, safely migrate version-zero and version-one databases, and reject databases created by a newer schema version.
- [x] Enforce shared UTC daily provider request quotas in SQLite and test cross-process reservation, exhaustion, and daily reset.
- [x] Provide a preview-first manual retention cleanup command; media deletion is restricted to real paths beneath the configured output directory.
- [ ] Validate every job-state transition and recover or safely fail interrupted jobs after process restart.
  - [x] Lifecycle transitions are checked transactionally; tests cover valid resume transitions and prevention of rewrites after a terminal `SAVED` state.
  - [x] MCP integration test proves a persisted ComfyUI job with a saved prompt ID can be resumed after a fresh server process starts.
  - [ ] A crash before the provider ID is persisted (or during a synchronous hosted request) remains an ambiguous outcome and requires provider-side inspection; automatic resubmission is intentionally disabled.
- [x] Automated tests cover missing credentials, malformed JSON, oversized responses, invalid ComfyUI URLs, and queued-job cancellation.
- [x] Add provider rate-limit and timeout tests plus interrupted/partial media-download recovery tests.
  - [x] ComfyUI, Pollinations and Cloudflare expose HTTP 429 failures and propagate transport timeouts to the caller.
  - [x] Pollinations async polling retries HTTP 429 and 5xx responses before accepting a successful result.
  - [x] ComfyUI, Pollinations and Cloudflare persist media via same-directory temporary files and atomic create-if-absent links.
  - [x] Tests verify atomic writes do not overwrite existing files, do not leave temp files, and remain safe under concurrent writers; interrupted ComfyUI response streams produce no visible output file.

## Live provider verification

Run only with a user-owned account and an explicit spend limit. Never place secrets in source files, test fixtures, terminal transcripts, or public MCP configuration.

- [ ] Cloudflare text generation succeeds with a low-cost supported model.
- [ ] Cloudflare image generation saves a decodable image with correct extension, MIME type and SHA-256.
- [ ] Cloudflare TTS saves playable audio; check its $0.015/1,000-character unit rate, Neuron consumption and remaining daily free allowance before testing.
- [ ] Pollinations model discovery works without credentials.
- [ ] Pollinations text generation works with a restricted user key.
- [ ] Pollinations image generation saves a valid image.
- [ ] Pollinations video/audio generation and async job polling are tested with a capped budget.
- [ ] Local ComfyUI generation succeeds with a documented workflow and installed checkpoint.
- [ ] Interrupted jobs can be resumed or safely marked failed; no false SAVED state is returned.

## MCP host verification

- [x] Test the exact packaged binary from a clean install, including CLI execution, MCP initialize and tools/list on Linux, Windows and macOS.
- [x] Automated Muse Code setup test verifies config merge, backup creation, idempotency and that provider secrets are not written to config.
- [ ] Verify setup and tool invocation inside real Muse Code and each other supported host claimed in documentation.
- [ ] Verify config backup, merge behavior, idempotency, paths with spaces, and Windows paths.
- [ ] Confirm credentials are inherited safely and never written to host config files.
- [ ] Restart the host and invoke at least one tool end to end.

## Release and operations

- [ ] Update version, changelog and migration notes.
- [ ] Confirm provider prices, free allowances, model availability and model licenses against current official documentation.
- [ ] Publish only from a reviewed tag with npm trusted publishing configured; use Node.js 24 and npm 11.5.1 or newer, and verify provenance.
  - [x] Release workflow uses GitHub OIDC permissions, Node 24, GitHub-hosted runners and disables npm cache.
  - [x] Exact npm trusted publisher fields and 48-hour first-publish window are documented in [NPM-TRUSTED-PUBLISHING.md](NPM-TRUSTED-PUBLISHING.md).
  - [ ] Package owner configures the trusted publisher on npmjs.com and confirms the `openvibes-mcp` package name before release.
- [ ] Verify the published tarball installs globally on a clean machine.
- [ ] Tag the exact tested commit and retain CI evidence.
- [ ] Publish known limitations and rollback instructions.

## Current known blockers

- Live provider generation requires the user's own credentials and explicit usage/billing approval.
- Meta Vibes consumer free-plan unattended generation remains blocked pending an official, authorized integration.
- Advertised MCP-host setup and a real provider generation still require end-user environment verification.
- npm Trusted Publishing must be configured by the package owner before the first public npm release.
