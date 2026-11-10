# Openvibes agent instructions

- Read README.md and docs/META-FEASIBILITY.md before changing provider behaviour.
- Never claim Meta Vibes free-plan API support without official authorization evidence and a real end-to-end test.
- Never add private endpoints, cookie replay, CAPTCHA bypass, quota evasion, or silent paid fallback.
- Keep stdout reserved for MCP protocol data in STDIO mode; write logs to stderr.
- Run typecheck, tests and build after changes.
- Do not commit secrets, local databases, or generated media.
