# Security policy

Do not submit passwords, access tokens, session cookies, or private account data in issues.

Report vulnerabilities privately through GitHub Security Advisories when enabled, or contact the repository maintainer through the public GitHub profile.

Openvibes must not implement undocumented provider endpoints, cookie replay, CAPTCHA bypass, quota evasion, or hidden paid fallback. Local databases and generated media may contain sensitive content; protect the user's filesystem and backups.

The ComfyUI endpoint is configurable through COMFYUI_URL. By default it is localhost. Only point it at a ComfyUI instance you control or are authorized to use. Do not expose an unauthenticated ComfyUI server to the public internet. Openvibes does not add authentication to a ComfyUI instance.

## ComfyUI endpoint policy

The default ComfyUI endpoint must resolve syntactically to loopback (`localhost`, IPv4 127/8, or IPv6 ::1). Other hosts are rejected by default. To intentionally use a remote endpoint, set both:

```bash
COMFYUI_URL=https://your-trusted-comfy-host.example
OPENVIBES_ALLOW_REMOTE_COMFYUI=true
```

Remote HTTP is rejected. This is an explicit trust decision, not authentication: ComfyUI itself must be protected by a trusted VPN/private network, access gateway, firewall, and appropriate server-side controls. Never expose an unauthenticated ComfyUI API directly to the public internet.

## Resource controls

The server allows at most two active generation calls and four waiting calls per process. Further work receives `GENERATION_CAPACITY_EXCEEDED`. SQLite also caps shared generation at two active leases across processes using the same data directory. A local structured audit trail records operational metadata without prompts, credentials, workflow bodies or file paths; it is not tamper-proof. SQLite also enforces UTC daily per-provider request limits shared by processes using the same data directory: 20/day for Cloudflare and 20/day for Pollinations by default; ComfyUI is counted but unlimited by default. Set `OPENVIBES_DAILY_CLOUDFLARE_LIMIT`, `OPENVIBES_DAILY_POLLINATIONS_LIMIT`, and `OPENVIBES_DAILY_COMFYUI_LIMIT`; 0 means unlimited. These request-count guardrails are not dollar budgets. Provider account spending controls remain essential. Use `openvibes usage` to inspect usage.

Prompts and local job metadata are stored in SQLite; generated output is stored on disk. They are not encrypted by Openvibes. Use OS account protections and encrypted disks/backups for sensitive content.
