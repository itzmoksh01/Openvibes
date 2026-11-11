# Meta Vibes automation research

**Reviewed:** 2026-11-11  
**Repository:** Openvibes  
**Decision:** Keep the Meta Vibes provider blocked. Do not integrate unofficial private-endpoint clients or session replay.

## User requirement

The target experience is: the user signs in to Meta Vibes once, then an MCP client can submit generation requests and retrieve generated media without repeatedly asking the user to log in.

This requirement has two separate parts:
- Persistent user authentication.
- An authorized, stable way to create jobs and retrieve outputs.

A persistent browser session can solve the first part. It does not, by itself, establish authorization for unattended use or provide stable generation APIs.

## Candidate 1: VibesAI-api

Repository: https://github.com/mir-ashiq/VibesAI-api

The public repository describes an unofficial Python SDK/CLI for vibes.ai. It claims support for video/image generation, image animation, video editing, lip-sync, projects, media-library operations, polling, and downloads. Its README declares MIT licensing.

Authentication and implementation caveats documented by the project:
- It reverse-engineers the Vibes Next.js bundles and observed network traffic.
- It uses the private `meta_session` cookie.
- Optional automatic re-login requires replaying `auth.meta.com` cookies through an OIDC flow.
- Its documentation says there is no public Vibes API and that private endpoints may change.
- Its test-results document reports live tests, but these are maintainer-provided claims and have not been independently reproduced by Openvibes.

**Decision:** Do not integrate this client into Openvibes under the current project security policy. Its cookie extraction, private endpoint use, and session replay conflict with the project's explicit prohibited-shortcuts policy. MIT licensing does not grant permission to use Meta's private interfaces or override Meta's terms.

References:
- https://github.com/mir-ashiq/VibesAI-api
- https://github.com/mir-ashiq/VibesAI-api/blob/main/COOKIES.md
- https://github.com/mir-ashiq/VibesAI-api/blob/main/TEST_RESULTS.md

## Candidate 2: agentic-browser-mcp

Repository: https://github.com/q35888/agentic-browser-mcp

The project is an MIT-licensed MCP server using Playwright and Chrome DevTools Protocol. It can connect to a dedicated, already-authenticated Chrome profile and expose navigation, snapshots, clicks, typing, screenshots, and a human handoff tool.

It is a generic browser automation layer, not a Vibes integration. It does not define Vibes-specific generation, job polling, or media-download operations. A Vibes-specific adapter would still need to operate the consumer UI and would be fragile as the site changes.

**Decision:** Keep as a research candidate only. Do not use it to automate consumer Vibes generation unless Meta's terms or explicit authorization permit that workflow. Never copy a user's normal browser profile wholesale; use a dedicated profile and least-privilege controls if an authorized browser workflow is later established.

Reference:
- https://github.com/q35888/agentic-browser-mcp

## Candidate 3: anomalyco/browse

Repository: https://github.com/anomalyco/browse

This project combines a Chromium extension and MCP server for persistent browser sessions, human handoff, and domain allowlists. It is useful infrastructure for authorized browser workflows, but it is not a Vibes API and does not resolve the authorization question.

Reference:
- https://github.com/anomalyco/browse

## Not a suitable candidate: chang-pro/meta-ai-mcp

Repository: https://github.com/chang-pro/meta-ai-mcp

Its README describes Meta AI image/chat browser automation and explicitly marks the Vibes video tool as deprecated. It is not a current Vibes video integration.

Reference:
- https://github.com/chang-pro/meta-ai-mcp

## Recommended Openvibes direction

1. Keep `MetaVibesFreeProvider` in `BLOCKED` state.
2. Do not add private Vibes endpoints, copied Meta cookies, automatic auth-cookie replay, CAPTCHA bypass, fingerprint spoofing, or quota evasion.
3. Do not claim that a one-time login makes unattended consumer-account automation authorized.
4. Reopen implementation only when Meta provides a documented API or written authorization covering the intended account tier and unattended workflow.
5. If an authorized browser workflow becomes available, use a dedicated local browser profile, local-only credential storage, explicit user handoff for login/2FA/challenges, strict Vibes-domain allowlisting, and clear UI automation disclosure.
6. Independently verify job creation, status polling, result retrieval, free-plan eligibility, quotas, and zero hidden paid fallback before marking any capability as working.

## Bottom line

A technically close unofficial SDK exists, and generic MCP browser servers can preserve a login session. Neither establishes an authorized, production-safe way to automate Meta Vibes free-plan generation. Openvibes should not adopt the unofficial SDK under its current security policy.
