# Architecture

For the full logical design, trust boundaries, lifecycle, and deployment constraints, see [System Design](SYSTEM-DESIGN.md) and [Threat Model](THREAT-MODEL.md). Current delivery gaps are listed in [Production Readiness Review](PRODUCTION-READINESS-REVIEW.md).

Openvibes separates the MCP interface, local job orchestration, and provider implementations.

~~~text
Coding agent -> MCP STDIO server -> tools -> job store / prompt engine
                                             |              |
                                      Meta Vibes gate   ComfyUI local API
                                             |              |
                                       BLOCKED until      /prompt
                                       authorized API     /history
                                                          /view
                                                             |
                                                      local asset store
~~~

## Current implementation

- MCP server: official TypeScript SDK v2 package @modelcontextprotocol/server.
- Transport: STDIO.
- Runtime: Node.js 22.13+.
- Validation: Zod v4.
- Job persistence: Node built-in node:sqlite. Job-state transitions are checked and committed under a SQLite write transaction, including when multiple MCP processes share the database.
- Media persistence: completed output bytes are written to a private same-directory temporary file, synced, and atomically linked into their final path. Existing assets are never overwritten and readers cannot observe a partially written final asset.
- Restart recovery: when a ComfyUI `promptId` has been persisted, call `openvibes_list_jobs` and then `openvibes_wait_for_job` with the saved `job_id` after restarting the MCP host. Openvibes resumes polling and output download instead of resubmitting the workflow.
- Recovery boundary: if the process stops while a job is still `SUBMITTING` and before the provider ID is stored, the remote outcome is ambiguous. Openvibes deliberately does not automatically resubmit it, because ComfyUI may already have accepted the request. Inspect the ComfyUI queue/history before taking manual action.
- Meta provider: evidence-gated and blocked until official authorization for unattended free-account generation is verified.
- ComfyUI provider: loopback-only by default; remote HTTPS requires the explicit OPENVIBES_ALLOW_REMOTE_COMFYUI=true opt-in. API-format workflow submission, polling, output download, and prompt-specific queue cancellation are supported.
- Admission control: a process-wide FIFO generation limiter allows two active generation operations and four queued operations; overflow is rejected with GENERATION_CAPACITY_EXCEEDED.
- Provider option objects are constrained by key, value length/range, and entry count; provider response bodies are read through bounded readers.
- Custom ComfyUI workflow graphs are sent to the configured ComfyUI server but not stored verbatim in SQLite; only node count and SHA-256 are retained for correlation.

## Constraints

- Multiple MCP processes may share the same SQLite path using WAL and busy timeout.
- STDIO stdout is reserved for protocol messages; diagnostics belong on stderr.
- Capability claims must be evidence-backed.
- Paid providers are not silently enabled.
- ComfyUI workflows are supplied as API-format JSON; Openvibes does not guess model/node graphs.
- Only connect to a ComfyUI instance the user controls or is authorized to use. The opt-in does not add authentication to ComfyUI.
- Imported ComfyUI workflows and installed custom nodes are executable integration inputs; use trusted graphs and trusted node packages only.
- Client configuration is updated only through documented CLI/configuration formats, with JSON backups before writes.
