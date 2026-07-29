---
'@trieb.work/payload-auth-pwless': minor
---

Ship admin panel UI components and inject them automatically (new `adminUI`
option):

- `AdminMagicLinkLogin` — magic link login form on the admin login view
  (`beforeLogin`), including `?token=` verification and redirect
- `AdminLoginButtons` — "Sign in with Passkey" plus buttons for configured OAuth
  providers (`afterLogin`)
- `PasskeyManagementField` — passkey list/register/delete UI field injected into
  the users collection

Injection respects the feature flags (`enableMagicLink`, `enableWebAuthn`,
configured OAuth providers) and can be disabled or customised via
`adminUI: { enabled, context, oauthProviders, passkeyManagementField, redirectPath }`.
`@payloadcms/ui` is now a peer dependency.
