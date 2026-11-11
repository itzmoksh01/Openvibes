# Production Readiness Review

**Review date:** 2026-11-11  
**Reviewed target:** Openvibes v0.3.x default branch  
**Review type:** source, architecture, provider, packaging, CI, and security-control review. No external penetration test or live provider generation was performed.

## Executive assessment

Openvibes has a solid local-first foundation: MCP STDIO, Zod input validation, separate provider adapters, transactional SQLite state, bounded HTTP readers, atomic media writes, CI across operating systems, npm dependency audit, and CodeQL.

It is **not yet a production-certified or multi-tenant service**. It is suitable for continued controlled local development once the main-branch CI matrix passes and the owner completes local/provider checks. Do not expose it as a shared network service or store regulated/highly sensitive workloads without the additional controls below.

## Implemented in this review

| Area | Change |
|---|---|
| ComfyUI network boundary | Loopback-only by default; remote use requires explicit opt-in and HTTPS. |
| ComfyUI cancellation | Running cancellation now sends the specific prompt ID rather than requesting a global interrupt. |
| Resource admission | Two active and four queued generation operations per process; SQLite leases cap active work at two across processes sharing the same data directory; UTC daily per-provider request caps are also enforced. |
| Provider input limits | Option maps are limited by key pattern, value length/range, and number of entries; ComfyUI workflow payloads are capped at 10 MiB. |
| ComfyUI response safety | Queue JSON is read through a bounded response reader; max media response reduced to 256 MiB. |
| Package hygiene | Published package includes runtime source output only, not compiled test files; the package smoke test asserts the exclusion. |
| Cross-platform packaging | npm staging paths are space-free on Windows; package is copied into a spaced runtime directory to exercise setup path handling without confusing npm.cmd. |
| Documentation | Added system design, threat model, deployment boundary, residual risk, and owner-side controls. |

## Existing controls retained

- Provider credentials come from environment variables and are not written to MCP client configuration or diagnostics.
- Cloudflare and Pollinations use fixed HTTPS API origins.
- Provider model IDs, asynchronous job IDs, and status URLs are validated.
- Prompt and media response bodies are bounded and network calls time out.
- SQLite uses schema versioning, WAL, foreign keys, busy timeout, and transactional state transitions.
- Media files are written atomically without replacing existing targets.
- CI checks Node 22/24 on Ubuntu and Node 22 on Windows/macOS; npm audit, package smoke, and CodeQL are part of the workflow. Checkout, setup-node, and CodeQL actions are pinned to immutable commit SHAs, with Dependabot configured to surface updates.
- Meta Vibes is explicitly blocked rather than using undocumented endpoints or a hidden paid fallback.

## Release gates (must be green before publishing)

1. The latest commit's complete CI matrix must pass, including the packed-package install/launch smoke test on Windows and macOS.
2. CodeQL must complete successfully for the same commit.
3. The owner must configure npm Trusted Publishing for the exact repository/workflow and verify package-name ownership/availability. No registry publish is performed by this review.
4. Run the CLI setup/doctor/MCP handshake on each real MCP host and supported operating system that the project claims to support.
5. Run real provider tests with user-authorized test accounts, least-privilege keys, budget alerts, and low-value prompts. Current unit/integration tests use mocks for provider calls.
6. Verify that the target ComfyUI installation is bound to loopback or a protected private HTTPS route and that its custom nodes are trusted.

## Open risks and required next steps

| Priority | Gap | Why it matters | Required follow-up |
|---|---|---|---|
| High | No end-user authentication, authorization, or tenant isolation | STDIO is a local trust model; it is not safe as a shared server boundary | Keep deployment local. If service mode is required, design separate identity, authorization, isolated secrets/storage, per-tenant quotas, network policy, and audit trail first. |
| High | No exact application-enforced USD spend meter | Model pricing, token counts, steps, image dimensions and Pollinations Pollen rates vary; a generic request counter cannot calculate actual cost | Daily per-provider request caps are enforced locally, but they are not dollar budgets. Set provider-side account budgets/alerts and least-privilege keys; integrate verified metering only when provider usage data is available. |
| Medium | No automatic retention schedule or disk quota | Prompts, SQLite records, and media can grow indefinitely and contain sensitive content | A manual preview-first cleanup command is available. Choose a retention period and schedule it externally if automation is required; define disk quotas and backup retention. |
| High | No application-layer encryption or tamper-proof audit sink | Local prompts/media remain readable by the OS account; local audit events can be edited by that account | Use encrypted disks/backups. Audit metadata is recorded locally, but stronger assurance requires an external append-only audit sink. |
| Medium | No cross-machine scheduler or account-wide global quota | SQLite leases coordinate processes only when they share one local database file; separate machines remain independent | Keep the local-first boundary. A remote multi-machine service needs a central authenticated scheduler, tenant isolation and distributed storage. |
| Medium | Media buffering before persistence | Accepted large media responses consume substantial RAM | Move large media downloads to bounded streaming-to-temp-file persistence with incremental hashing. |
| Low | Pinned GitHub Actions require ongoing update review | Immutable SHA pins reduce tag-movement risk but can become stale | Review Dependabot action updates, verify upstream release notes and resolved commit SHAs, then rerun CI/CodeQL. |
| Medium | Host integrations not all exercised against real installed clients | CLI schemas/behavior can drift across versions | Add a host-specific manual test matrix and capture tested client versions. |
| Medium | No malware scanning or full media decoder validation | Binary signature/MIME checks do not prove a file is benign or fully valid | Add optional local scanning/decoder checks for untrusted media pipelines. |

## Acceptance criteria for a production service

A service deployment should not be approved until it has authenticated callers, tenant isolation, isolated secrets, provider-side and application-side quotas, bounded storage/retention, encrypted backups, structured audit events, monitoring/alerting, incident response, immutable action references, and real integration tests for every claimed provider/host. These requirements are beyond the current local STDIO product boundary.

## Final disposition

**Current disposition: controlled local developer-tool beta; not production-certified.** The code changes in this review improve network boundaries, cancellation correctness, resource admission, package contents, and documentation. The remaining gates are explicit; a successful CI or CodeQL run alone is not evidence that live provider credentials, billing behavior, host configuration, or deployment security have been validated.


## Additional controls delivered after the initial review

- SQLite schema v2 stores per-provider request counts by UTC date.
- Cloudflare and Pollinations default to 20 generation/text requests per UTC day; ComfyUI requests are counted but unlimited unless configured.
- Daily counters are reserved transactionally immediately before provider calls and shared by Openvibes processes using the same SQLite file.
- `openvibes usage` and `openvibes_usage_status` report current counts without exposing credentials.
- `openvibes cleanup --older-than-days N` is preview-only by default; `--yes` permanently deletes selected database rows and only media files under the configured output directory.

These safeguards do not provide a USD spend guarantee, automatic retention scheduling, application-level encryption, or cross-machine quotas.
