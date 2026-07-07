---
'@trieb.work/payload-auth-pwless': minor
---

Initial release: passwordless authentication plugin for Payload CMS 3.

- WebAuthn/passkey registration + authentication (multi-credential, multi-host
  RP resolution with origin allowlist)
- Magic link email login with rate limiting, anti-enumeration, configurable
  `allowUser` guard and email templates
- OAuth login for Google and Facebook (verified-email-only, automatic account
  linking)
- Refresh-token sessions in HttpOnly cookies with device-fingerprint binding,
  request deduplication, and a scheduled cleanup job
- Optional application contexts with per-context session lifetimes, login paths,
  and email branding
- Optional onboarding endpoint + fields, last-login tracking, dev-only agent
  auto-login
- Optional admin login form component (`@trieb.work/payload-auth-pwless/client`)
