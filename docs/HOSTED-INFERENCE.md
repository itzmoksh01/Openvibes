# Hosted inference without local model installation

Openvibes supports online inference through Pollinations' hosted generation API. Model weights run on provider infrastructure; end users do not need a local GPU, ComfyUI, Python environment or downloaded checkpoints.

## Set up once

1. Create your own key at https://enter.pollinations.ai/keys.
2. Give it only the model categories you intend to use and set a conservative spending budget/expiry in the provider dashboard.
3. Set `OPENVIBES_POLLINATIONS_API_KEY` in the environment inherited by Muse Code, Claude Code, Codex, Antigravity or Zed **before launching the MCP host**.
4. Restart the coding agent and call `openvibes_hosted_list_models`.

Never paste a secret key into a chat prompt, source file, issue, commit, or publicly shared MCP configuration. The key is not copied into Openvibes client setup files. Environment variables are the current credential mechanism; a future release may add an OS-keychain-backed OAuth flow after registering an official Pollinations Connect application.

## MCP tools

- `openvibes_hosted_list_models`: discover all currently available models or filter by `text`, `image`, `video`, or `audio`. The public catalogue does not require a key.
- `openvibes_hosted_generate_text`: OpenAI-compatible chat completion.
- `openvibes_hosted_generate_media`: hosted image, video, or text-to-speech/audio generation. Long media jobs use the provider's async job API; completed media is downloaded, SHA-256 hashed, saved under the Openvibes output directory, and recorded in SQLite.

Always select a model from the live catalogue. Pass model-specific parameters through the `options` object only when that model documents them. Different models accept different aspect ratios, duration, size, voices, and input requirements.

## Cost and licensing — important

Pollinations' API and integration are open source, but that does **not** mean every model behind the API is open-weight or free to use. Its current API requires a user-owned secret key for generation. A key's Pollen budget is a spending cap, not free credit. The account's available Pollen balance, model price, access restrictions, and quotas determine whether a request succeeds. Some catalogue entries route to proprietary models/providers. Check each model's licence and the live catalogue before commercial use.

Openvibes does not:
- create or fund an account for you;
- claim unlimited free video, image, audio or text inference;
- switch to a paid model without your selected model ID;
- buy Pollen, top up an account, or bypass provider quotas;
- send your key to any host other than `https://gen.pollinations.ai`.

The provider may return `401` for an invalid/missing key, `402` when the account or key budget is exhausted, or model-specific errors when a model is unavailable. Openvibes returns these failures rather than hiding them.

## Online free-tier alternatives

Cloudflare Workers AI currently advertises 10,000 Neurons per day on its Free Workers plan, with limits resetting at 00:00 UTC. It hosts open-weight text, image, text-to-speech and speech-to-text models, but its catalogue does not provide a general first-party text-to-video model. Account ID and API token are required. This is a daily allowance, not unlimited free inference. Cloudflare is documented as a future provider adapter; the current hosted MCP implementation uses Pollinations' unified API for all four requested modalities.

Hugging Face Inference Providers currently gives free accounts $0.10/month in credits, subject to change. That is useful for testing but not a dependable free video-generation backend.

## Official references

- [Pollinations open-source repository and unified API](https://github.com/pollinations/pollinations)
- [Pollinations API quick start](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/docs/quick-start.md)
- [Pollinations authentication and BYOP](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/docs/authentication.md)
- [Pollinations live model catalogue](https://gen.pollinations.ai/models)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Workers AI model catalogue](https://developers.cloudflare.com/workers-ai/models/)
- [Hugging Face Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing)
