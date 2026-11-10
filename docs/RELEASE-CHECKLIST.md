# Production Release Checklist

A green unit-test suite is necessary but is not sufficient for a production release. Do not mark a release ready until every applicable item below has evidence.

## Source and dependency integrity

- [x] Commit and review `package-lock.json`; CI and release workflows use `npm ci`.
- [x] Pin direct dependencies and configure Dependabot for npm and GitHub Actions updates.
- [x] The latest CI run passed `npm audit --audit-level=high` on the tested Linux matrix jobs; rerun on every release commit.
- [ ] CodeQL analysis and Dependabot are configured; confirm the latest CodeQL result and resolve actionable findings.
- [x] CI reviews npm package contents with `npm pack --dry-run`.
- [ ] Confirm LICENSE, NOTICE, README, docs and runtime files are included.

## Automated verification

- [ ] Minimum supported Node.js version passes type-check, build and tests.
- [ ] Current Node.js LTS passes type-check, build and tests.
- [ ] Windows, macOS and Linux pass the supported CI matrix.
- [ ] MCP STDIO smoke test completes initialize and tools/list without stdout contamination.
- [ ] SQLite persistence, migration/restart behavior, job state transitions and asset path validation pass.
- [ ] Failure tests cover invalid credentials, rate limits, timeouts, malformed provider responses, cancellation and partial downloads.

## Live provider verification

Run only with a user-owned account and an explicit spend limit. Never place secrets in source files, test fixtures, terminal transcripts, or public MCP configuration.

- [ ] Cloudflare text generation succeeds with a low-cost supported model.
- [ ] Cloudflare image generation saves a decodable image with correct extension, MIME type and SHA-256.
- [ ] Cloudflare TTS saves playable audio; confirm the separate per-character charge before testing.
- [ ] Pollinations model discovery works without credentials.
- [ ] Pollinations text generation works with a restricted user key.
- [ ] Pollinations image generation saves a valid image.
- [ ] Pollinations video/audio generation and async job polling are tested with a capped budget.
- [ ] Local ComfyUI generation succeeds with a documented workflow and installed checkpoint.
- [ ] Interrupted jobs can be resumed or safely marked failed; no false SAVED state is returned.

## MCP host verification

- [ ] Test the exact packaged binary from a clean install, not only the repository checkout.
- [ ] Verify setup for Muse Code and each supported host claimed in documentation.
- [ ] Verify config backup, merge behavior, idempotency, paths with spaces, and Windows paths.
- [ ] Confirm credentials are inherited safely and never written to host config files.
- [ ] Restart the host and invoke at least one tool end to end.

## Release and operations

- [ ] Update version, changelog and migration notes.
- [ ] Confirm provider prices, free allowances, model availability and model licenses against current official documentation.
- [ ] Publish only from a reviewed tag with npm trusted publishing configured; use Node.js 24 and npm 11.5.1 or newer, and verify provenance.
- [ ] Verify the published tarball installs globally on a clean machine.
- [ ] Tag the exact tested commit and retain CI evidence.
- [ ] Publish known limitations and rollback instructions.

## Current known blockers

- The repository does not yet contain a committed npm lockfile; until it does, CI cannot use reproducible `npm ci` installs.
- Meta Vibes consumer free-plan unattended generation remains blocked pending an official, authorized integration.
- Advertised MCP-host setup and a real provider generation still require end-user environment verification.
- npm Trusted Publishing must be configured by the package owner before the first public npm release.
