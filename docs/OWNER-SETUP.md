# Owner setup checklist

This guide contains the steps that only the repository/package owner or someone with access to the target computer can complete. The code is already pushed to the public GitHub repository; these steps connect it to your accounts and real environment.

## 1. Protect the GitHub main branch

1. Open https://github.com/itzmoksh01/Openvibes.
2. Select **Settings**.
3. In the left menu open **Rules → Rulesets**.
4. Select **New ruleset → New branch ruleset**.
5. Set the name to `Protect main`, enforcement to **Active**, and target branch to `main`.
6. Enable **Require a pull request before merging**. For a solo-maintained repository, keep the required approval count at 0 until another reviewer is available.
7. Enable **Require status checks to pass before merging** and add these exact check names:
   - `test (ubuntu-latest, 22.13.0)`
   - `test (ubuntu-latest, 24)`
   - `test (windows-latest, 22.13.0)`
   - `test (macos-latest, 22.13.0)`
   - `Analyze TypeScript`
8. Also enable **Require conversation resolution**, block force pushes, and restrict branch deletion.
9. Save the ruleset. Confirm that GitHub shows it as Active for `main`.

Official guide: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

## 2. Turn on repository security features

1. Open repository **Settings**.
2. Find **Code security and analysis** (the section may appear under Advanced Security).
3. Enable the available options: Dependabot alerts, Dependabot security updates, secret scanning, push protection, and private vulnerability reporting.
4. Some options depend on plan/eligibility. Enable only the options GitHub offers and verify that the UI confirms them.

Dependabot configuration and CodeQL workflow are already committed.

## 3. Install Openvibes from GitHub

Requirements: Node.js 22.13.0 or newer and npm 10 or newer.

Open a terminal and run:

```bash
npm install --global github:itzmoksh01/Openvibes
openvibes setup --client muse
openvibes doctor
```

Completely close Muse Code and reopen it. Inside Muse Code run `/mcp` and verify that Openvibes is connected.

To configure other detected clients, run `openvibes setup --client auto`. To attempt every supported client use `openvibes setup --client all`.

If installation reports a Node version error, install a current Node.js LTS release, open a fresh terminal, and repeat.

## 4. Connect a hosted provider (optional)

You do not need a hosted provider to use Openvibes. Choose only the provider you want.

### Cloudflare Workers AI

1. Open https://dash.cloudflare.com/ and select **Workers AI**.
2. Create an API token with the minimum Workers AI permissions required for inference.
3. Add these operating-system user environment variables:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
4. Never paste the token into a chat, source file, GitHub issue, or MCP client configuration.
5. Fully restart Muse Code, run `openvibes_doctor`, and test a low-cost text request first.

### Pollinations

1. Open https://enter.pollinations.ai/keys.
2. Create a user-owned key. Restrict it to the categories you need and set a conservative budget/expiry.
3. Add `OPENVIBES_POLLINATIONS_API_KEY` to your OS user environment.
4. Restart Muse Code.
5. Call `openvibes_hosted_list_models` before generation.

A Pollinations key budget is a spending cap, not free credit. Review the model price and account balance first.

### Windows environment-variable steps

1. Start menu → search **Edit environment variables for your account**.
2. Click **Environment Variables**.
3. Under **User variables**, click **New**.
4. Enter the variable name/value and save.
5. Close every Muse Code window and reopen it.

For a temporary PowerShell session use `$env:VARIABLE_NAME='value'` before launching the app. For macOS/Linux, set variables in the environment from which Muse Code is launched. GUI-launched apps may not inherit shell exports; use the OS user environment mechanism.

## 5. Configure daily request limits

Defaults: 20 Cloudflare requests/day and 20 Pollinations requests/day; local ComfyUI is counted but unlimited by default. To change:

```text
OPENVIBES_DAILY_CLOUDFLARE_LIMIT=10
OPENVIBES_DAILY_POLLINATIONS_LIMIT=10
OPENVIBES_DAILY_COMFYUI_LIMIT=0
```

A value of 0 means unlimited. These are request counts, not rupee/dollar budgets. Set provider-side spending alerts/limits too. See `openvibes usage` or MCP tool `openvibes_usage_status`.

## 6. Test local ComfyUI (optional)

1. Install ComfyUI using https://docs.comfy.org/get_started.
2. Start it on the default local address `http://127.0.0.1:8188`.
3. Install a compatible checkpoint and confirm it is loaded.
4. In Muse Code call `openvibes_comfy_server_info`.
5. Call `openvibes_comfy_list_checkpoints`.
6. Generate a small test image with `openvibes_comfy_generate_image`.

For video, export an API-format workflow and call `openvibes_comfy_run_workflow`. Install only trusted custom nodes. Do not expose an unauthenticated ComfyUI API to the public internet.

## 7. Inspect jobs, usage and audit trail

- `openvibes jobs`: recent jobs.
- `openvibes assets`: saved media metadata.
- `openvibes usage`: provider request counters and active shared slots.
- `openvibes audit --limit 50`: recent operational audit events.
- `openvibes cleanup --older-than-days 30`: preview old job, asset and audit rows. Nothing is deleted by preview.
- Add `--yes` only after reviewing the preview to permanently delete eligible records and media files under the configured output directory.

The audit trail excludes prompts, keys, workflow bodies and local paths. It is stored locally and is not tamper-proof.

## 8. First npm publication and later releases

The package currently has version `0.3.0` and has not been published from this repository. First confirm that you can own the package name:

```bash
npm view openvibes-mcp name
```

If it already belongs to someone else, stop; do not attempt to publish over it. npm Trusted Publisher configuration requires an existing package, so for a brand-new package the owner must first publish the reviewed `0.3.0` package once from their own npm account using interactive two-factor authentication. Do not add a write token to GitHub or this repository.

After that package exists:

1. Open npmjs.com → your `openvibes-mcp` package → **Settings → Trusted Publisher**.
2. Select **GitHub Actions**.
3. Enter Organization/User `itzmoksh01`, Repository `Openvibes`, Workflow filename `publish.yml`, and leave Environment blank.
4. Allow direct `npm publish`; the committed workflow runs `npm publish --provenance --access public`.
5. Confirm `repository.url` is `https://github.com/itzmoksh01/Openvibes.git`.
6. Revoke any one-time bootstrap publish credential after Trusted Publishing has been validated.
7. For the next release, update the package version and release notes, verify CI/CodeQL on that exact commit, create the matching `vX.Y.Z` tag, and verify the publish workflow and provenance.

Trusted Publishing needs npm CLI 11.5.1+ and Node.js 22.14+. A new publisher must complete its first successful OIDC publish within 2 days. Do not create the publisher far ahead of the release. Official guide: https://docs.npmjs.com/trusted-publishers/

The existing `publish.yml` workflow already uses GitHub OIDC, Node 24 and `id-token: write`. Do not create a release tag until the owner approves the exact version and package contents.

## 9. Protect local data

Openvibes does not currently encrypt SQLite or generated media at application level. Enable full-disk encryption (BitLocker/Device Encryption on Windows, FileVault on macOS, or LUKS on Linux) and keep backups in encrypted storage. Pick a retention period and use the preview-first cleanup command manually.

## Important limits

- Meta Vibes consumer free-plan unattended generation remains blocked until Meta documents/authorizes a supported API.
- Local generation requires your own machine, ComfyUI, compatible models and adequate hardware.
- Provider requests may cost money. Local request caps are not guaranteed USD spending caps.
- Openvibes is a local STDIO developer tool, not a public multi-user server.
