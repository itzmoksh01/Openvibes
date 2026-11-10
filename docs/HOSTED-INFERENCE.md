# Hosted inference without local model installation

Openvibes supports online inference through Pollinations' hosted generation API. Model weights run on provider infrastructure; end users do not need a local GPU, ComfyUI, Python environment or downloaded checkpoints.

## Best no-local-install starting point: Cloudflare Workers AI

Cloudflare Workers AI is the first option to try when you want a real hosted free allowance. Its current Free Workers plan includes 10,000 Neurons per day, reset at 00:00 UTC. Openvibes includes online tools for Google Gemma 4 26B A4B text generation, FLUX.1-schnell image generation, and Deepgram Aura-1 text-to-speech. These are hosted model inference calls; no model files or local GPU are required. The free allowance is shared across Workers AI requests and is not unlimited.

1. Create a Cloudflare account and open Workers AI → Use REST API.
2. Copy the Account ID and create a Workers AI API token with Workers AI Read and Edit permissions.
3. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment inherited by your MCP host.
4. Restart the coding agent and call `openvibes_cloudflare_generate_text`, `openvibes_cloudflare_generate_image`, or `openvibes_cloudflare_generate_audio`.

Default models: `@cf/google/gemma-4-26b-a4b-it`, `@cf/black-forest-labs/flux-1-schnell`, and `@cf/deepgram/aura-1` for TTS. FLUX.1-schnell is a 12B hosted text-to-image model; its Cloudflare model page documents the REST API and base64 image response.

Cloudflare Aura-1 TTS is a hosted Deepgram partner model, not an open-weight model. Its unit rate is $0.015 per 1,000 characters (1,363.64 Neurons); eligible usage can consume the 10,000-Neuron daily free allocation. Usage above that allowance requires Workers Paid and is billed at $0.011 per 1,000 Neurons. For video generation, use Pollinations' live video catalogue where account balance and model availability permit. Open-weight hosted video inference with a dependable free public quota is not currently verified.

## Set up Pollinations for video/audio and wider model choice

1. Create your own key at https://enter.pollinations.ai/keys.
2. Give it only the model categories you intend to use and set a conservative spending budget/expiry in the provider dashboard.
3. Set `OPENVIBES_POLLINATIONS_API_KEY` in the environment inherited by Muse Code, Claude Code, Codex, Antigravity or Zed **before launching the MCP host**. Examples:

   macOS/Linux (from a terminal): `export OPENVIBES_POLLINATIONS_API_KEY='sk_…'`

   Windows PowerShell (current session): `$env:OPENVIBES_POLLINATIONS_API_KEY='sk_…'`

   For desktop-launched clients, configure the variable in your operating system's user environment and fully restart the client.
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

Cloudflare Workers AI currently advertises 10,000 Neurons per day on its Free Workers plan, with limits resetting at 00:00 UTC. Eligible model usage consumes this allowance; partner models such as Deepgram Aura-1 have published per-character unit pricing that is converted to Neurons. It hosts open-weight text, image, text-to-speech and speech-to-text models, but its catalogue does not provide a general first-party text-to-video model. Account ID and API token are required. This is a daily allowance, not unlimited free inference. Openvibes currently implements Cloudflare hosted text, image and text-to-speech tools. Pollinations provides the optional wider model catalogue, including video/audio models subject to live availability and account budget.

Hugging Face Inference Providers currently gives free accounts $0.10/month in credits, subject to change. That is useful for testing but not a dependable free video-generation backend.

## Official references

- [Cloudflare Workers AI free daily allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Workers AI REST API setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Cloudflare FLUX.1-schnell model and REST API](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/)
- [Cloudflare Aura-1 text-to-speech model](https://developers.cloudflare.com/workers-ai/models/aura-1/)
- [Cloudflare Gemma 4 26B A4B model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)

- [Pollinations open-source repository and unified API](https://github.com/pollinations/pollinations)
- [Pollinations API quick start](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/docs/quick-start.md)
- [Pollinations authentication and BYOP](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/docs/authentication.md)
- [Pollinations live model catalogue](https://gen.pollinations.ai/models)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Workers AI model catalogue](https://developers.cloudflare.com/workers-ai/models/)
- [Hugging Face Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing)
