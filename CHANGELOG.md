# @trieb.work/payload-auth-pwless

## 0.1.0

### Minor Changes

- 2bf81fb: Initial release: passwordless authentication plugin for Payload
  CMS 3.

  - WebAuthn/passkey registration + authentication (multi-credential, multi-host
    RP resolution with origin allowlist)
  - Magic link email login with rate limiting, anti-enumeration, configurable
    `allowUser` guard and email templates
  - OAuth login for Google and Facebook (verified-email-only, automatic account
    linking)
  - Refresh-token sessions in HttpOnly cookies with device-fingerprint binding,
    request deduplication, and a scheduled cleanup job
  - Optional application contexts with per-context session lifetimes, login
    paths, and email branding
  - Optional onboarding endpoint + fields, last-login tracking, dev-only agent
    auto-login
  - Optional admin login form component
    (`@trieb.work/payload-auth-pwless/client`)

- 6e0a13f: Enforce one-time-use for magic link tokens via JTI tracking. Each
  magic link JWT now includes a `jti` claim; the verify endpoint checks the
  sessions collection for an existing session with that JTI before creating a
  new one, rejecting replay attempts with 401. A unique DB index on
  `magicLinkTokenId` in the sessions collection provides a last line of defence
  against concurrent replays.
