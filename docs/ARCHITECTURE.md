# Architecture

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
- Restart recovery: when a ComfyUI `promptId` has been persisted, call `openvibes_list_jobs` and then `openvibes_wait_for_job` with the saved `job_id` after restarting the MCP host. Openvibes resumes polling and output download instead of resubmitting the workflow.
- Recovery boundary: if the process stops while a job is still `SUBMITTING` and before the provider ID is stored, the remote outcome is ambiguous. Openvibes deliberately does not automatically resubmit it, because ComfyUI may already have accepted the request. Inspect the ComfyUI queue/history before taking manual action.
- Meta provider: evidence-gated and blocked until official authorization for unattended free-account generation is verified.
- ComfyUI provider: local HTTP API integration for API-format workflow submission, polling, output download, and queue cancellation.

## Constraints

- Multiple MCP processes may share the same SQLite path using WAL and busy timeout.
- STDIO stdout is reserved for protocol messages; diagnostics belong on stderr.
- Capability claims must be evidence-backed.
- Paid providers are not silently enabled.
- ComfyUI workflows are supplied as API-format JSON; Openvibes does not guess model/node graphs.
- Only connect to a ComfyUI instance the user controls or is authorized to use.
- Client configuration is updated only through documented CLI/configuration formats, with JSON backups before writes.
