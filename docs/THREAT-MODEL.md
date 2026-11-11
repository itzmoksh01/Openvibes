# Openvibes Threat Model

**Scope:** the v0.3.x local STDIO MCP server, its provider adapters, local SQLite store, generated-media directory, and CLI client setup. This is an engineering threat model, not a certification or third-party penetration test.

## Assets

1. Cloudflare and Pollinations API credentials and the provider accounts/budgets behind them.
2. User prompts, reference-image identifiers, workflow JSON, generated media, and local file paths.
3. The ComfyUI server, installed checkpoints, custom nodes, and the host's GPU/CPU/memory.
4. SQLite job/asset metadata and generated media on disk.
5. MCP client configuration files modified by the setup CLI.
6. Availability and integrity of the user's local coding-agent session.

## Trust boundaries

- **TB1 — Agent to MCP:** a model or user can supply tool arguments. Treat prompts, model IDs, options, and custom workflows as untrusted.
- **TB2 — MCP to providers:** provider APIs receive user content and may return malformed, oversized, delayed, or hostile responses.
- **TB3 — MCP to ComfyUI:** the default ComfyUI API is unauthenticated and can control a powerful local generation service. It is restricted to loopback unless the user opts into a remote HTTPS endpoint.
- **TB4 — MCP to filesystem/SQLite:** prompts, job metadata, and media are written to local storage under the process's OS privileges.
- **TB5 — CLI to MCP host configuration:** the setup command reads and modifies user-owned JSON settings or invokes official client CLIs.

## Threats and controls

| Threat | Impact | Current mitigation | Residual risk |
|---|---|---|---|
| SSRF / accidental connection to an untrusted ComfyUI host | Prompts/workflows disclosed; unauthenticated remote API controlled | Loopback-only URL policy by default; remote host requires explicit opt-in and HTTPS; URL credentials/query/fragment rejected | Explicit remote opt-in trusts the selected host and its TLS/DNS/network path. Openvibes does not authenticate remote ComfyUI. |
| Global cancellation interrupts another ComfyUI user/job | Availability and work loss | Queue checked and running interruption includes the target prompt_id; queued delete also uses that ID | ComfyUI remains a shared service; external users can race or alter its queue. |
| Unbounded concurrent generation | GPU exhaustion, memory pressure, disk use, provider spend | Two active and four waiting operations per process; further calls rejected | Separate MCP processes do not share a limiter; no per-user rate or dollar budget is enforced. |
| Oversized provider/ComfyUI responses | Memory exhaustion or disk exhaustion | Bounded response readers and per-modality media limits; request timeouts | The current implementation buffers an accepted response in memory before atomic persistence. Very large media may still be resource intensive. |
| Malicious or malformed provider payload | Invalid job polling, corrupt output, parser failures | Validate provider job IDs/status URL origin/path; bounded JSON and binary readers; image signatures checked for Cloudflare images | Provider schemas can evolve; full media decoding/antivirus scanning is not performed. |
| Malicious ComfyUI workflow/custom node | Arbitrary local effects through installed extension code; accidental secret persistence | Require user-controlled ComfyUI; do not silently install custom nodes; persist only node count and SHA-256, never the raw graph | Openvibes does not sandbox ComfyUI or third-party custom nodes; ComfyUI still receives the full workflow. Review graphs and install only trusted nodes. |
| Credential disclosure | Account takeover or spend | Environment-only credentials; no secret in client setup config; diagnostics omit values; fixed HTTPS provider origins | Secrets can still be exposed by a compromised host, shell, debugger, crash dump, or local process with sufficient permissions. |
| Local data disclosure/tampering | Prompt/media privacy or integrity loss | User-local storage, restrictive modes where supported, atomic create-if-absent media writes, transactional SQLite state | No application-level encryption, retention purge, file malware scan, or tamper-proof audit log. Protect OS account, disk, and backups. |
| Client config clobbering | MCP host configuration loss or malicious server registration | Malformed/conflicting JSON rejected; existing config backed up; unrelated keys preserved; writes staged via temp file and rename | Client format changes and OS-specific CLI behavior need live testing on each supported host. |
| Supply-chain compromise | Code execution / release compromise | Pinned npm dependency versions and lockfile, npm audit, CI matrix, CodeQL, release provenance workflow | Checkout, setup-node, and CodeQL actions are pinned to immutable commit SHAs; review Dependabot updates and complete owner-side security settings and Trusted Publishing. |
| Public exposure of the MCP process | Unauthorized generation/data access | STDIO transport only; no HTTP listener or remote-user authentication | Do not wrap or expose the process as a public service without a separate authenticated service architecture. |

## Security invariants

- Never log or return secret values.
- Never place API credentials in user-editable prompts, workflows, client settings, source control, or generated documentation.
- Never follow an untrusted user-provided provider URL with an authorization header.
- Keep ComfyUI loopback-only unless a deliberate remote HTTPS trust decision is made.
- Never issue a global ComfyUI interrupt when cancelling a single Openvibes job.
- Never automatically retry an ambiguous ComfyUI submit after losing the provider ID.
- Never silently switch providers or bypass paid/free-plan access boundaries.
- Treat custom workflows and custom nodes as code-trust decisions.

## Recommended owner-side hardening

1. Enable GitHub private vulnerability reporting, Dependabot alerts/security updates, secret scanning, and push protection where available for the repository.
2. Protect main with required CI and CodeQL checks; require review before changes to release workflows.
3. Use least-privilege, revocable provider keys and provider-side budget alerts; do not put keys in GitHub unless a workflow actually needs them.
4. Back up the database and generated media with encrypted storage; define retention and deletion requirements before storing sensitive or regulated content.
5. Keep ComfyUI bound to loopback or a private network, update it and every custom node, and review the code of any custom node that can run commands or access files.
6. Run provider end-to-end tests only with a test account, low budget, and explicitly approved test prompts.

## Incident response

If a provider key is suspected to be exposed, revoke it at the provider immediately, issue a replacement with least privilege, inspect provider usage, and remove the leaked copy from environment files, logs, and repository history as appropriate. If local media or SQLite is exposed, isolate the host, preserve relevant logs, rotate any affected keys, and assess whether prompts/reference content require notification under the user's policies.
