# npm Trusted Publishing

Openvibes declares the npm package as `openvibes-mcp` at version `0.3.0`. The repository has a GitHub Actions release workflow at `.github/workflows/publish.yml`, triggered only by tags matching `v*`.

The npm account's Trusted Publisher settings must be configured by the package owner. No npm credentials or long-lived write token are required in GitHub Actions once OIDC trusted publishing is active.

## First publication bootstrap

A trusted-publisher relationship is configured on an existing npm package. The npm CLI's `npm trust` documentation also lists package existence as a prerequisite. Because `openvibes-mcp` has not yet been published from this repository, the owner must create the package once before adding the GitHub Actions trusted publisher.

1. First check that the name is available and belongs to the intended owner: `npm view openvibes-mcp name`. If it resolves to a package owned by someone else, stop and do not publish.
2. On the owner's computer, clone this repository, use Node.js 22.14+ and npm 11.5.1+, then run `npm ci`, `npm run check`, and `npm pack --dry-run`.
3. Sign in interactively to the intended npm owner account with 2FA enabled, review the packed files, and perform the one-time initial `0.3.0` publish with `npm publish --access public`.
4. Once the package page exists, configure the GitHub Actions trusted publisher below.
5. Revoke any one-time token or other temporary publishing credential used for the bootstrap. Do not save it in GitHub Actions secrets.
6. Future releases must use a new matching version/tag (for example `0.3.1` / `v0.3.1`) after the exact commit's CI and CodeQL checks pass. Do not re-publish the already bootstrapped `0.3.0` tag.

The initial local bootstrap publish does not get GitHub Actions provenance. The subsequent OIDC releases do. This one-time bootstrap limitation is an npm package-creation prerequisite, not a reason to add a long-lived write token to the repository.

References: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and [npm trust command prerequisites](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-trust.md).

## Exact npm Trusted Publisher settings

On npmjs.com, open the `openvibes-mcp` package settings and add a **GitHub Actions** trusted publisher. Use these exact values:

| npm setting | Value |
|---|---|
| Organization or user | `itzmoksh01` |
| Repository | `Openvibes` |
| Workflow filename | `publish.yml` |
| Environment name | Leave blank; the workflow does not declare a GitHub environment |
| Allowed action | Enable direct `npm publish`; the workflow currently runs `npm publish --provenance --access public` |

Enter only `publish.yml` for the workflow filename, not the full `.github/workflows/` path. Values are case-sensitive. The `repository.url` field in `package.json` already points to `https://github.com/itzmoksh01/Openvibes.git`, which must match the repository used by the trusted publisher.

**Important:** npm's current publisher setup defaults to allowing `npm stage publish`. Because Openvibes' existing workflow uses direct `npm publish`, explicitly allow that action in the trusted publisher settings. Do not select stage-only access unless the workflow is deliberately changed to the staged-publishing flow.

A new trusted-publisher configuration must complete its first successful publish within 48 hours. If it expires before a successful publish, delete it and create a new one immediately before the release attempt.

## Release sequence

1. Confirm the exact `main` commit has a successful CI matrix and CodeQL result.
2. Review the package version, README, LICENSE, NOTICE, package allowlist and `npm pack --dry-run` output.
3. Confirm the npm package name is available and controlled by the intended npm account. The package has not yet been published from this repository.
4. Add or refresh the npm Trusted Publisher configuration using the table above.
5. Create a Git tag whose version exactly matches `package.json` (currently `v0.3.0`). The tag push triggers `.github/workflows/publish.yml`.
6. Confirm the publish workflow succeeds, then verify the package page, provenance, and clean-machine global installation before announcing the release.

Do not publish from an unreviewed commit or create the release tag until the package contents and version have been approved.

## Workflow compatibility

The current workflow already:
- runs on GitHub-hosted Ubuntu runners;
- grants `id-token: write` and `contents: read`;
- uses Node.js 24;
- sets `package-manager-cache: false`;
- installs from the committed lockfile with `npm ci`;
- runs type-check, build, tests, audit and package-content verification before publishing.

npm documents a minimum of npm CLI 11.5.1 and Node.js 22.14.0 for Trusted Publishing. Node.js 24 is configured in the release workflow. npm automatically creates provenance attestations for successful GitHub Actions OIDC publishes from a public repository to a public package.

## Security notes

- Never add an npm write token to GitHub secrets for this OIDC workflow.
- After trusted publishing works, consider npm's **Require two-factor authentication and disallow tokens** publishing-access setting. OIDC trusted publishers continue to work when traditional token publishing is disabled.
- Protect release tags so only maintainers who have reviewed the exact commit can trigger publication.
- If the release workflow is changed to use a GitHub Environment, set the same exact environment name in the npm trusted publisher configuration.

Official references:
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm package provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Actions setup-node Trusted Publishing guidance](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md)
