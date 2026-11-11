# Openvibes System Design

**Status:** v0.3.x local-first MCP developer tool. This design is intentionally not a SaaS or multi-tenant architecture.

## 1. Goals and non-goals

The system lets a coding agent request text, image, video, and speech generation through one local MCP STDIO process. It validates tool inputs, applies bounded admission control, calls a selected provider, persists job state, and saves media to the user's filesystem.

Goals:
- Keep the agent interface provider-neutral while making provider capabilities and costs explicit.
- Keep the default ComfyUI integration on loopback.
- Keep API credentials outside prompts, source code, and generated client configuration.
- Make media writes atomic and job state recoverable after process restarts.
- Bound request sizes, provider response sizes, generation concurrency, and queue depth.

Non-goals:
- No network-facing MCP server, user login, identity service, tenant isolation, distributed scheduler, or shared cloud storage.
- No exactly-once generation guarantee across a process crash.
- No Openvibes-managed provider billing cap or promise of unlimited/free hosted generation.
- No Meta Vibes private endpoint, browser-cookie replay, or paid-provider fallback.

## 2. Logical architecture

~~~mermaid
flowchart LR
  A["Coding agent / MCP host"] -->|"local STDIO"| B["Openvibes MCP process"]
  B --> C["Zod input validation"]
  C --> D["FIFO generation limiter<br/>2 active / 4 waiting"]
  D --> E{"Provider adapter"}
  E --> F["ComfyUI<br/>loopback by default"]
  E --> G["Cloudflare Workers AI<br/>fixed HTTPS origin"]
  E --> H["Pollinations<br/>fixed HTTPS origin"]
  E --> I["Meta Vibes gate<br/>BLOCKED"]
  F --> J["Bounded response reader"]
  G --> J
  H --> J
  I --> K["Structured blocked result"]
  J --> L["Atomic asset writer<br/>same-directory temp + fsync + link"]
  L --> M["Local output directory"]
  D --> N["SQLite job store"]
  L --> N
  B --> O["Diagnostics / capabilities"]
~~~

The MCP host launches the process and owns its lifecycle. STDOUT is reserved for MCP protocol frames; tool results are returned as structured text content. The application does not expose an inbound HTTP listener.

## 3. Main request sequence

1. The MCP SDK parses the JSON-RPC request. Zod schemas constrain fields, lengths, numeric ranges, option keys, and option counts.
2. The generation limiter admits the request if a slot is available. There are at most two active generation operations and four waiting operations per process. Further requests fail fast.
3. The selected adapter uses a fixed provider origin. Credentials are read from the process environment and sent only to the configured provider.
4. HTTP calls have explicit timeouts. Response readers reject bodies above their configured byte budgets before they are persisted.
5. Media bytes are written to a private temporary file beside the destination, fully written and synced, then linked into the final name atomically. Existing targets are not overwritten.
6. The SQLite store records job state, output metadata, and SHA-256. Database transactions serialize state transitions.

## 4. Provider boundaries

| Adapter | Destination | Security / operational contract |
|---|---|---|
| ComfyUI local | COMFYUI_URL; loopback only by default | Remote use requires OPENVIBES_ALLOW_REMOTE_COMFYUI=true and HTTPS. ComfyUI itself is not authenticated by Openvibes. |
| Cloudflare Workers AI | Fixed api.cloudflare.com HTTPS origin | Requires a user-owned account ID and API token. Model IDs are validated. Billing follows the user's Cloudflare plan and allowance. |
| Pollinations | Fixed gen.pollinations.ai HTTPS origin | Requires the user's API key and Pollen budget. Async job IDs and status URLs are validated. |
| Meta Vibes | No outbound generation request | Explicitly blocked until an authorized, documented API for the requested entitlement is verified. |

Provider-specific model availability, pricing, and account entitlements can change. Capability reporting must not imply live readiness solely because a credential is present.

## 5. Job lifecycle and crash semantics

The job store models bounded state transitions such as SUBMITTING, SUBMITTED, PROCESSING, DOWNLOADING, SAVED, FAILED, CANCELLED, and BLOCKED.

For ComfyUI:
- The server first submits a workflow and receives a provider prompt_id.
- Openvibes persists that ID with the job before it starts polling.
- A later MCP process can resume polling with openvibes_wait_for_job and download the completed output without resubmitting.
- Cancellation first checks the ComfyUI queue. Pending work is removed by its prompt ID; running work is interrupted with a prompt-specific ID, not a global interrupt.
- Ambiguous crash boundary: if the process terminates after ComfyUI accepts a workflow but before Openvibes persists the returned prompt ID, the outcome cannot be safely inferred. Automatic resubmission is deliberately avoided because it could create duplicate provider work. Inspect ComfyUI queue/history before retrying.

For hosted asynchronous Pollinations generation, a returned job ID is validated and polled until success, failure, or the bounded timeout.

## 6. Data classification and storage

| Data | Location | Protection / caveat |
|---|---|---|
| Provider API keys | Process environment | Never written into generated MCP client config or returned by doctor output. Environment is still visible to sufficiently privileged local processes. |
| Prompts and job inputs | Local SQLite database | May contain sensitive user content; not encrypted by Openvibes. |
| Generated media | Local output directory | Restrictive permissions are requested where supported; use OS account isolation and encrypted disk/backups. |
| Job/asset metadata and hashes | Local SQLite database | SQLite WAL and transactional transitions; protect database and WAL/SHM files with the same OS account boundary. |
| Imported ComfyUI workflows | Passed to local ComfyUI; job history stores only node count and SHA-256 | The full workflow graph is not retained in SQLite because third-party nodes may embed secrets or private paths. Treat it as executable integration input. |

No automatic retention or purge policy is implemented. Users must manage disk usage and retention themselves until a documented lifecycle policy is added.

## 7. Availability and resource model

- Generation concurrency is bounded at two active plus four queued operations per process.
- Input schemas cap prompt and option sizes; ComfyUI workflow JSON is additionally capped before submission.
- Provider readers enforce per-operation response size limits. Current media caps are deliberately conservative relative to a streaming-to-disk design; very large video outputs may be rejected.
- Network calls have provider-specific timeouts; Pollinations async jobs have a finite polling deadline.
- SQLite uses WAL, foreign keys, a busy timeout, and explicit schema versioning.
- Media files are create-if-absent and atomically exposed. Duplicate filenames do not silently overwrite prior media.

The limiter is not shared across separately launched MCP processes. Multiple processes have separate in-memory queues and may still compete for one GPU or spend against one provider account.

## 8. Deployment profiles

**Local-only profile (recommended):** Run Openvibes as a STDIO child process under one desktop agent. Keep ComfyUI on 127.0.0.1, provider secrets in the user's process environment, and data directories owned by the same OS account.

**Remote ComfyUI profile (advanced):** Set OPENVIBES_ALLOW_REMOTE_COMFYUI=true only when using a trusted HTTPS endpoint protected by a VPN/private network or an authenticated gateway. Openvibes does not provide remote ComfyUI authentication. Do not expose raw ComfyUI to the public internet.

**Hosted provider profile:** Keep API tokens in a secret manager or protected environment configuration, restrict each token to the minimum provider permissions, configure provider-side spend/budget alerts, and rotate/revoke keys if exposed.

Do not deploy the current process as a shared multi-user service. A future service deployment requires a separate architecture for identity, authorization, tenant-separated secrets and storage, request quotas, network isolation, audit logging, observability, and abuse response.

## 9. Operational signals

The current openvibes_doctor and openvibes_get_capabilities tools report configuration and provider readiness without exposing secret values. They are diagnostics, not monitoring, billing controls, or end-to-end proofs. The current release process uses CI, dependency audit, package smoke tests, CodeQL, and npm provenance when the owner completes Trusted Publishing setup.

See [Threat Model](THREAT-MODEL.md) for abuse cases and [Production Readiness Review](PRODUCTION-READINESS-REVIEW.md) for remaining release/deployment work.
