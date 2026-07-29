---
'@trieb.work/payload-auth-pwless': minor
---

Make the post-login redirect generic and configurable:

- New `onboarding.path` option (static path or `({ context, host }) => string`
  resolver). Users with incomplete profiles are only redirected to
  `<path>?step=onboarding` after OAuth login when this is configured —
  previously the redirect always targeted the context login path, which 404s in
  apps without a frontend onboarding page.
- Without `onboarding.path`, `returnUrl` is honored.
- The default `returnUrl` (OAuth initiate, agent login, and unsafe-redirect
  fallbacks) is now the Payload admin route from the consuming config
  (`routes.admin`, usually `/admin`) instead of `/`.
