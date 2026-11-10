# Openvibes

**Universal open-source MCP bridge for AI creative workflows, with an evidence-gated Meta Vibes provider.**

> **Status: early development (v0.1.0).** The MCP scaffold and local job/asset infrastructure are being built. Real Meta Vibes generation is currently **blocked** because a documented and authorized unattended generation interface for ordinary free Vibes accounts has not been verified. Openvibes does not use paid Meta APIs, private endpoints, session cookies, or per-job manual browser steps.

Openvibes is an independent community project. It is not affiliated with, endorsed by, sponsored by, or officially supported by Meta Platforms, Inc.

## Current status

| Capability | Status |
|---|---|
| MCP server scaffold | Implemented locally; dependency installation/build pending |
| SQLite job history | Implemented locally using Node.js `node:sqlite` |
| Prompt structuring | Implemented locally |
| Meta Vibes free image generation | **Blocked / unverified** |
| Meta Vibes free video generation | **Blocked / unverified** |
| Meta Vibes image-to-video | **Blocked / unverified** |
| Automatic Meta result download | Not implemented; depends on a legitimate provider route |

## Requirements

- Node.js 22.13 or later
- npm

## Development

```bash
npm install
npm run build
npm test
```

## MCP tools

- `openvibes_get_capabilities`
- `openvibes_generate_image`
- `openvibes_generate_video`
- `openvibes_animate_image`
- `openvibes_get_job`
- `openvibes_wait_for_job`
- `openvibes_list_jobs`
- `openvibes_cancel_job`
- `openvibes_list_assets`
- `openvibes_get_asset`
- `openvibes_doctor`

Generation tools currently return a truthful `BLOCKED` job record. They do not pretend to generate media.

## Why the Meta provider is blocked

Meta publicly describes Vibes as a consumer creation experience for expressive AI-generated videos, including animating images and editing/restyling. That product description does not itself establish a public developer API or permission for unattended automation through a standard free account. See [`docs/META-FEASIBILITY.md`](docs/META-FEASIBILITY.md).

## Security

- No passwords or session cookies are collected.
- No undocumented endpoints or private GraphQL operations.
- No CAPTCHA or rate-limit bypass.
- No silent paid-provider fallback.
- Local-first storage.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
