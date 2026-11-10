# Security Policy

## Supported versions

Security fixes are applied to the latest version on the default branch. Until a stable release is published, no older version is guaranteed to receive security updates.

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities, credentials, or session data in public issues. Use GitHub's **Report a vulnerability** action in the repository's Security tab when private vulnerability reporting is enabled. If unavailable, contact the maintainer privately through the contact method listed on the GitHub profile.

Include the affected commit/component, reproducible steps, impact, and suggested mitigation. Allow a reasonable period for investigation and coordinated remediation before public disclosure.

## Security design

- Never request or store provider passwords, browser cookies, or session tokens.
- Provider secrets are read from environment variables and must never be printed or returned by diagnostics.
- Provider calls use fixed HTTPS origins; model IDs and async job identifiers are validated.
- Generated files use unique names and restrictive file permissions where supported.
- Provider outputs and user-supplied workflows are untrusted input.
- Do not bypass authentication, CAPTCHA, rate limits, paid entitlements, or provider access controls.
