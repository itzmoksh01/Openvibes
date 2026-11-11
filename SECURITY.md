# Security Policy

## Supported versions

Security fixes are applied to the latest version on the default branch. Until a stable release is published, no older version is guaranteed to receive security updates.

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities, credentials, or session data in public issues. Use GitHub's **Report a vulnerability** action in the repository's Security tab when private vulnerability reporting is enabled. If unavailable, contact the maintainer privately through the contact method listed on the GitHub profile.

Include the affected commit/component, reproducible steps, impact, and suggested mitigation. Allow a reasonable period for investigation and coordinated remediation before public disclosure.

## Security design

- Never request or store provider passwords, browser cookies, or session tokens.
- Provider secrets are read from environment variables and must never be printed or returned by diagnostics.
- Provider calls use fixed HTTPS origins; model IDs and async job identifiers are validated.
- Generated files use unique names and restrictive file permissions where supported.
- Provider outputs and user-supplied workflows are untrusted input.
- Do not bypass authentication, CAPTCHA, rate limits, paid entitlements, or provider access controls.

## Runtime trust boundaries

Openvibes is a local STDIO MCP server. The operating-system user and the MCP host process are the security boundary; this project does not implement remote-user authentication, tenant isolation, or a network-facing HTTP listener. Do not wrap it in a public service without adding authentication, authorization, tenant isolation, per-tenant quotas, and isolated storage.

The ComfyUI API is unauthenticated by default. Openvibes therefore accepts loopback URLs only unless `OPENVIBES_ALLOW_REMOTE_COMFYUI=true` is explicitly set. Remote endpoints must use HTTPS. This opt-in does not add authentication to ComfyUI; protect the remote endpoint independently.

Generation admission is bounded to two active and four waiting tasks per MCP process. This is not a global rate limit or a provider billing cap. Provider-side account budgets remain authoritative.

See [the threat model](docs/THREAT-MODEL.md) and [system design](docs/SYSTEM-DESIGN.md) for assets, trust boundaries, mitigations, and residual risks.
