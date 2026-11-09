# Security policy

## Reporting a vulnerability
Please report privately. Do **not** open a public issue for a security problem.
On GitHub, open this repository's **Security** tab and choose **Report a vulnerability** (a private advisory). Include the steps to reproduce, the affected commit or version, and the impact.

This is a volunteer project. The aim is to acknowledge within 7 days and to fix or reduce serious problems within 30 days; these are goals, not guarantees. Reporters are credited in the advisory unless they prefer to stay anonymous.

## Supported versions
Only the latest commit on `main`.

## In scope
Authentication and sessions (cookies, CSRF), one business reading or changing another business's data, injection, exposed secrets, and the production Docker/Caddy configuration.

## Out of scope
Findings that need an already compromised server or browser, volume-based denial of service, social engineering, and the documented gaps below.

## Known gaps (listed so nobody assumes more protection than exists)
- No two-factor authentication.
- Rate limits are kept in memory, per server process; use Redis if you run several workers.
- A stolen session cookie works until it expires or the password changes.
- The strict Content-Security-Policy was tested in headless Chromium only.
- The delay-risk model is trained on synthetic data and is only a demonstration.
- The production Docker/Caddy files are validated in CI but have not been verified on a live server by the author yet.

Operators should also follow the hardening notes in [DEPLOY.md](DEPLOY.md).
