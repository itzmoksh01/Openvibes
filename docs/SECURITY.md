# Security policy

Do not submit passwords, access tokens, session cookies, or private account data in issues.

Report vulnerabilities privately through GitHub Security Advisories when enabled, or contact the repository maintainer through the public GitHub profile.

Openvibes must not implement undocumented provider endpoints, cookie replay, CAPTCHA bypass, quota evasion, or hidden paid fallback. Local databases and generated media may contain sensitive content; protect the user's filesystem and backups.

The ComfyUI endpoint is configurable through COMFYUI_URL. By default it is localhost. Only point it at a ComfyUI instance you control or are authorized to use. Do not expose an unauthenticated ComfyUI server to the public internet. Openvibes does not add authentication to a ComfyUI instance.
