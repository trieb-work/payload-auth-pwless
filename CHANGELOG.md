# @trieb.work/payload-auth-pwless

## 0.2.0

### Minor Changes

- 750b662: Ship admin panel UI components and inject them automatically (new
  `adminUI` option):

  - `AdminMagicLinkLogin` — magic link login form on the admin login view
    (`beforeLogin`), including `?token=` verification and redirect
  - `AdminLoginButtons` — "Sign in with Passkey" plus buttons for configured
    OAuth providers (`afterLogin`)
  - `PasskeyManagementField` — passkey list/register/delete UI field injected
    into the users collection

  Injection respects the feature flags (`enableMagicLink`, `enableWebAuthn`,
  configured OAuth providers) and can be disabled or customised via
  `adminUI: { enabled, context, oauthProviders, passkeyManagementField, redirectPath }`.
  `@payloadcms/ui` is now a peer dependency.

- f140429: Make the post-login redirect generic and configurable:

  - New `onboarding.path` option (static path or `({ context, host }) => string`
    resolver). Users with incomplete profiles are only redirected to
    `<path>?step=onboarding` after OAuth login when this is configured —
    previously the redirect always targeted the context login path, which 404s
    in apps without a frontend onboarding page.
  - Without `onboarding.path`, `returnUrl` is honored.
  - The default `returnUrl` (OAuth initiate, agent login, and unsafe-redirect
    fallbacks) is now the Payload admin route from the consuming config
    (`routes.admin`, usually `/admin`) instead of `/`.

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
