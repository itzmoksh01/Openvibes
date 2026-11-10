# Meta Vibes feasibility and evidence register

**Last reviewed:** 2026-11-10  
**Provider:** `meta-vibes-free`  
**Decision:** `BLOCKED` for unattended MCP generation pending authoritative API/authorization evidence.

## What Meta publicly documents

Meta's Vibes product page describes creating expressive AI-generated videos, animating user images, editing/restyling, and remixing. Meta's September 25, 2025 announcement describes Vibes as a short-form AI-generated video creation and sharing experience in Meta AI and meta.ai.

These are consumer product capabilities. They do not establish that an ordinary free Vibes account has a supported public API, OAuth scope, programmatic job submission endpoint, result retrieval endpoint, or permission for unattended browser automation. Meta's current Meta AI FAQ describes everyday use as free but says some compute-intensive features have daily/monthly usage limits and may offer a subscription when the free limit is reached; this does not establish unlimited Vibes generation.

## Evidence

| Source | What it establishes | What it does not establish |
|---|---|---|
| [Meta Vibes product page](https://ai.meta.com/meta-ai/vibes/) | Consumer creation, image animation, editing/restyling and remix features | Public developer API, free-plan API entitlement, automation permission, job/result schemas |
| [Meta announcement, 2025-09-25](https://about.fb.com/news/2025/09/introducing-vibes-ai-videos/) | Vibes launched as a creation and sharing experience in Meta AI and meta.ai | An MCP integration or unattended API |
| [Meta AI FAQ](https://ai.meta.com/meta-ai/assistant/) | Everyday assistant use is free; some compute-intensive features have daily/monthly usage limits | Unlimited Vibes generations or a free Vibes API |
| [Meta developer catalogue](https://ai.meta.com/llama/) | Meta separately lists Muse Image on Meta Model API at US$0.01/image | A public Vibes video API or use of the consumer Vibes free-plan entitlement |
| [Meta Model API terms](https://dev.meta.ai/legal/terms-of-service) | Separate terms apply to the Meta Model API | Does not grant Vibes consumer-account access or free Vibes video generation |

## Important distinction: Muse Image is not Meta Vibes Free

Meta separately documents **Muse Image** as a developer API on Meta Model API. Its official pricing page currently lists **US$0.01 per successfully returned image**. The image-generation guide documents OpenAI-compatible image endpoints and requires a Meta Model API key. This is a separate paid developer product; it is not evidence of free Vibes-account API access and does not provide Vibes video generation.

- [Official Muse Image API guide](https://dev.meta.ai/docs/image-generation)
- [Official Meta Model API pricing](https://dev.meta.ai/docs/pricing-rate-limits)

Openvibes intentionally does not enable Muse Image as a fallback because the project goal is to use the user's existing free Meta Vibes entitlement without per-generation charges.

## Capability matrix

| Operation | Consumer UI described | Official unattended free-account API verified | Openvibes state |
|---|---:|---:|---|
| Text-to-video | Yes | No | BLOCKED |
| Image-to-video | Yes | No | BLOCKED |
| Video remix/restyle | Yes | No | BLOCKED |
| Programmatic image result retrieval | Not established | No | BLOCKED |
| Programmatic video result retrieval | Not established | No | BLOCKED |

## Enablement gate

Do not change the provider to `VERIFIED_WORKING` until all of the following are available:

1. An official API document or explicit written authorization covering the exact interface.
2. Documented authentication for ordinary eligible free Vibes accounts.
3. Documented request and response schemas for each claimed modality.
4. Documented job status and output retrieval.
5. Terms permitting the proposed unattended automation.
6. A real end-to-end test showing generated output downloaded without per-job manual interaction.
7. Evidence that no paid API or hidden billing path was used.

## Prohibited implementation shortcuts

Do not use undocumented endpoints, private GraphQL, copied browser cookies, session replay, CAPTCHA bypass, fingerprint spoofing, quota evasion, or a browser bot that performs consumer UI generation without authorization.
