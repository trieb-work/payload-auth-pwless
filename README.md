# @trieb.work/payload-auth-pwless

A self-hosted, passwordless authentication plugin for
[Payload CMS](https://payloadcms.com) 3.x.

Replaces Payload's built-in email+password strategy with WebAuthn/passkeys,
magic-link email login, and OAuth (Google, Facebook) — backed by a custom
refresh-token session system. No third-party auth service required.

## Features

- **WebAuthn / passkeys** — registration and authentication, multi-credential
  per user, multi-host support with anti-spoofing origin checks.
- **Magic link email login** — passwordless, rate-limited, anti-enumeration by
  design.
- **OAuth** — Google and Facebook out of the box, verified-email-only, automatic
  account linking by email.
- **Sessions & refresh tokens** — short-lived access tokens (JWT) + long-lived
  refresh tokens in `HttpOnly` cookies, device-fingerprint binding, request
  deduplication, scheduled cleanup of expired sessions via Payload's Jobs Queue.
- **Application contexts** _(optional)_ — run one Payload instance behind
  multiple frontends (e.g. a public site and a back office) with different
  session lifetimes, login paths, and email branding per context.
- **Rate limiting** on sensitive endpoints (in-memory — see
  [Security notes](#security-notes)).
- **Last-login tracking** (timestamp + IP).
- **Optional onboarding step** (`firstName`/`lastName`/`onboardingComplete`) for
  profile completion after first login.
- **Dev-only agent/browser auto-login** for local testing and CI, gated behind
  an explicit opt-in, a shared secret, and a localhost allowlist.

Roles and permissions are intentionally **not** part of this plugin — bring your
own authorization layer on top.

## Installation

```sh
pnpm add @trieb.work/payload-auth-pwless
# or: npm install / yarn add
```

Peer dependencies: `payload ^3.0.0`, `next ^15.0.0 || ^16.0.0`, `react ^19.0.0`.

## Quick start

```ts
// payload.config.ts
import { authPlugin } from '@trieb.work/payload-auth-pwless'
import { buildConfig } from 'payload'

export default buildConfig({
  collections: [
    {
      slug: 'users',
      auth: true, // required — the plugin extends this collection
      fields: [],
    },
    // ...
  ],
  plugins: [
    authPlugin({
      serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
      rpName: 'My App',
    }),
  ],
  secret: process.env.PAYLOAD_SECRET,
})
```

> **Breaking behavioral change:** the plugin sets `disableLocalStrategy: true`
> on the `users` collection and registers its own auth strategy. Existing
> email+password logins on that collection stop working once the plugin is added
> — plan a migration path (e.g. magic link to the same email) if you have
> existing password-based users.

The `users` collection must have `auth: true` set already; the plugin only
extends it.

## Configuration

All options are optional; sensible generic defaults are shipped. Full type:
`PayloadAuthPluginConfig` (exported from the package).

| Option                                               | Default                                                        | Description                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverURL`                                          | `NEXT_PUBLIC_SERVER_URL` env var, then `http://localhost:3000` | Base URL used for OAuth callbacks and magic-link URLs.                                                                                                                                                                                                   |
| `rpName`                                             | `'Payload'`                                                    | WebAuthn Relying Party name shown to users during passkey registration.                                                                                                                                                                                  |
| `rpID`                                               | hostname of `serverURL`                                        | WebAuthn Relying Party ID.                                                                                                                                                                                                                               |
| `allowedOrigins`                                     | `[serverURL]`                                                  | Origins allowed to perform WebAuthn ceremonies (needed for multi-host/subdomain setups).                                                                                                                                                                 |
| `usersCollectionSlug`                                | `'users'`                                                      | Slug of the existing collection the plugin extends.                                                                                                                                                                                                      |
| `sessionsCollectionSlug`                             | `'sessions'`                                                   | Slug of the sessions collection the plugin creates.                                                                                                                                                                                                      |
| `webauthnCollectionSlug`                             | `'webauthn-credentials'`                                       | Slug of the WebAuthn credentials collection the plugin creates.                                                                                                                                                                                          |
| `enableWebAuthn` / `enableMagicLink` / `enableOAuth` | `true`                                                         | Toggle each auth method independently.                                                                                                                                                                                                                   |
| `enableOnboarding`                                   | `true`                                                         | Registers `/api/auth/onboarding` plus `firstName`/`lastName`/`onboardingComplete` fields.                                                                                                                                                                |
| `onboarding.path`                                    | —                                                              | Frontend onboarding UI path (static or `({ context, host }) => string`). When set, users with incomplete profiles are redirected to `<path>?step=onboarding` after OAuth login; when omitted, `returnUrl` is honored (default: the Payload admin route). |
| `enableAgentLogin`                                   | `false`                                                        | Registers the dev-only auto-login endpoint. See [Agent login](#agent-login-dev-only).                                                                                                                                                                    |
| `contexts`                                           | `{}`                                                           | Optional map of named application contexts — see [Application contexts](#application-contexts).                                                                                                                                                          |
| `defaultContext`                                     | first key of `contexts`                                        | Context assigned to auto-created users when none is requested.                                                                                                                                                                                           |
| `magicLink`                                          | —                                                              | `allowUser` guard, `autoCreateUsers` toggle, `getLoginPath` override. See `MagicLinkConfig`.                                                                                                                                                             |
| `email`                                              | —                                                              | Global magic-link email config (`from`, `subject`, `buildEmailHTML`). Overridable per context.                                                                                                                                                           |
| `oauth.providers.{google,facebook}`                  | env vars                                                       | `{ clientId, clientSecret }`, see [OAuth setup](#oauth-setup).                                                                                                                                                                                           |
| `webauthn.canManageUser`                             | denies all                                                     | Lets privileged users view/delete another user's passkeys.                                                                                                                                                                                               |
| `tokens.accessTokenLifetime`                         | `900` (15 min)                                                 | Access token (JWT) lifetime in seconds.                                                                                                                                                                                                                  |
| `tokens.defaultSessionLifetime`                      | `604800` (7 days)                                              | Refresh-token/session lifetime in seconds when no per-context value applies.                                                                                                                                                                             |
| `tokens.magicLinkValidity`                           | `900` (15 min)                                                 | Magic-link token validity in seconds.                                                                                                                                                                                                                    |
| `sessionCleanup`                                     | daily at 2 AM                                                  | Cron schedule for the expired-session cleanup job (`enabled`, `cron`, `queue`).                                                                                                                                                                          |
| `agentLogin`                                         | —                                                              | `email`, `secret`, `allowedHostnames` for the dev-only auto-login endpoint.                                                                                                                                                                              |

### Application contexts

Contexts are entirely optional. Configure them when a single Payload instance
serves multiple frontends that need different session lifetimes, login paths, or
email branding:

```ts
authPlugin({
  contexts: {
    app: { loginPath: '/login', sessionLifetime: 30 * 24 * 60 * 60 },
    backoffice: {
      loginPath: '/admin/login',
      sessionLifetime: 8 * 60 * 60,
      email: { subject: 'Sign in to the back office' },
    },
  },
  defaultContext: 'app',
})
```

When configured, an `applicationContext` select field is added to the `users`
collection, and clients pass `?context=<name>` to the magic-link and OAuth
endpoints to scope the session.

### Magic link emails

Magic link emails are sent via Payload's built-in `payload.sendEmail()`, so you
need an [email adapter](https://payloadcms.com/docs/email/overview) configured in
your Payload config. The plugin handles subject, HTML body, and sender address.

```ts
authPlugin({
  email: {
    from: 'My App <noreply@myapp.com>', // falls back to EMAIL_FROM_ADDRESS env
    subject: 'Your sign-in link',       // or: ({ context }) => `Sign in to ${context}`
    buildEmailHTML: ({ url, email, context }) => `
      <h1>Sign in to ${context ?? 'My App'}</h1>
      <p>Welcome ${email}!</p>
      <a href="${url}">Click here to sign in</a>
    `,
  },
})
```

When omitted, a neutral default HTML template and subject (`"Your login link"`)
are used. Per-context overrides via `contexts.<name>.email` take precedence over
the global `email` config.

### OAuth setup

OAuth is enabled by default (`enableOAuth: true`); a provider becomes active as
soon as its credentials are configured, either via plugin options:

```ts
authPlugin({
  oauth: {
    providers: {
      google: {
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      },
    },
  },
})
```

or via environment variables (fallback when the option is not set):

| Provider | Env vars                                                   | Redirect URI to register with the provider     |
| -------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Google   | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`     | `{serverURL}/api/auth/oauth/google/callback`   |
| Facebook | `FACEBOOK_OAUTH_CLIENT_ID`, `FACEBOOK_OAUTH_CLIENT_SECRET` | `{serverURL}/api/auth/oauth/facebook/callback` |

**Provider console setup (Google):** Google Cloud Console → APIs & Services →
Credentials → Create OAuth client ID → type "Web application" → add
`{serverURL}` as authorized JavaScript origin and the redirect URI from the
table above. `http://localhost:{port}` works for development without domain
verification. Facebook requires a Meta developer app with the equivalent
redirect URI ("Valid OAuth Redirect URIs").

**Triggering the flow:** link or redirect the browser to

```
GET /api/auth/oauth/{provider}?returnUrl=/dashboard&context=my-context
```

- `returnUrl` (optional) — same-origin path to land on after login. Defaults to
  the Payload admin route. Unsafe values (absolute/protocol-relative URLs) are
  replaced with the admin route to prevent open redirects.
- `context` (optional) — application context assigned to auto-created users
  (only meaningful when `contexts` are configured).

The shipped admin login buttons (see [Admin panel UI](#admin-panel-ui)) render a
button per configured provider automatically.

**Flow behavior:**

- Only verified-email OAuth profiles are accepted; unverified emails are
  rejected with `?error=email_unverified`.
- New users are created automatically on first login; existing users are matched
  first by linked social account (provider + provider ID via the
  `socialAccounts` field), then by email — an email match links the social
  account to that user for future logins.
- The OAuth `state` parameter is a signed, short-lived JWT (CSRF protection);
  tampered or expired states are rejected with `?error=invalid_state`.
- After login, users with incomplete profiles are redirected to
  `onboarding.path` (if configured, see [Configuration](#configuration));
  otherwise `returnUrl` is honored.

### WebAuthn / passkey gotchas

- `rpID` must equal (or be a registrable-domain suffix of) the origin the
  browser is actually on. Browsers treat `localhost` as a public suffix, so a
  static `rpID: 'localhost'` will fail on an `app.localhost` subdomain with a
  "RP ID wrong" error.
- If you serve the app from more than one host (subdomains, staging vs.
  production), list every allowed origin in `allowedOrigins`. Requests from a
  non-allowlisted `Host`/`x-forwarded-host` fall back to the static `serverURL`
  rather than trusting the header — this prevents a forged Host header from
  binding credentials to an attacker-controlled domain.

### Magic link

- `magicLink.autoCreateUsers` (default `true`) registers a new user on first
  magic-link request (passwordless sign-up). Set to `false` for invite-only
  apps.
- `magicLink.allowUser` is a guard executed before a link is issued — return
  `false` to deny (e.g. restrict a context to an email domain or an
  existing-user check). It receives `{ context, email, payload, req, user }`.
- Requires an [email adapter](https://payloadcms.com/docs/email/overview)
  configured on the root Payload config, plus an `EMAIL_FROM_ADDRESS` env var or
  `email.from` option.
- Both endpoints always return `{ success: true }` on the request step
  regardless of whether the email exists, to prevent account enumeration.

### Agent login (dev-only)

`enableAgentLogin: true` registers
`GET /api/auth/agent-login?secret=<secret>&returnUrl=/`, useful for automated
browser testing (e.g. Playwright, Claude-in-Chrome) without going through a real
auth flow. It:

- only responds to allowlisted hostnames (`localhost`, `127.0.0.1`, `::1` by
  default),
- requires a shared secret (`agentLogin.secret` option or
  `AGENT_AUTO_LOGIN_SECRET` env var),
- creates or reuses a single agent user (`agent@localhost.dev` by default).

Do not enable this in a production deployment.

## Admin panel UI

The plugin ships React components for the Payload admin and injects them
automatically (opt out with `adminUI: { enabled: false }`):

- **Magic link login form** (`beforeLogin`) — request a login link by email and
  verify `?token=` links, then redirect into the admin.
- **Passkey + OAuth login buttons** (`afterLogin`) — "Sign in with Passkey" plus
  buttons for every configured OAuth provider.
- **Passkey management field** — injected into the users collection so every
  user can list, register, and delete their passkeys from their profile.
  Privileged users (see `webauthn.canManageUser`) can view/delete passkeys of
  other users.

```ts
authPlugin({
  adminUI: {
    enabled: true, // default
    context: 'backoffice', // application context for admin logins (default: defaultContext)
    oauthProviders: ['google'], // default: auto-detected from configured credentials
    passkeyManagementField: true, // default: enableWebAuthn
    redirectPath: '/admin', // default: the config's admin route
  },
})
```

All components are also exported from `@trieb.work/payload-auth-pwless/client`
(`AdminMagicLinkLogin`, `AdminLoginButtons`, `PasskeyManagementField`, and the
standalone unstyled `LoginForm` for app frontends) if you prefer to wire them
manually. They are styled with Payload admin CSS variables only. After adding or
removing components, regenerate the import map (`payload generate:importmap`).

## Endpoints registered

| Method   | Path                                      | Requires                          |
| -------- | ----------------------------------------- | --------------------------------- |
| `POST`   | `/api/auth/magic-link/request`            | —                                 |
| `POST`   | `/api/auth/magic-link/verify`             | —                                 |
| `GET`    | `/api/auth/oauth/:provider`               | `enableOAuth`                     |
| `GET`    | `/api/auth/oauth/:provider/callback`      | `enableOAuth`                     |
| `POST`   | `/api/auth/webauthn/register-options`     | authenticated, `enableWebAuthn`   |
| `POST`   | `/api/auth/webauthn/register-verify`      | authenticated, `enableWebAuthn`   |
| `POST`   | `/api/auth/webauthn/has-credentials`      | authenticated, `enableWebAuthn`   |
| `GET`    | `/api/auth/webauthn/credentials`          | authenticated, `enableWebAuthn`   |
| `DELETE` | `/api/auth/webauthn/credentials/:id`      | authenticated, `enableWebAuthn`   |
| `POST`   | `/api/auth/webauthn/authenticate-options` | `enableWebAuthn`                  |
| `POST`   | `/api/auth/webauthn/authenticate-verify`  | `enableWebAuthn`                  |
| `POST`   | `/api/auth/refresh`                       | valid `refresh-token` cookie      |
| `POST`   | `/api/auth/logout`                        | —                                 |
| `POST`   | `/api/auth/logout-all`                    | authenticated                     |
| `POST`   | `/api/auth/onboarding`                    | authenticated, `enableOnboarding` |
| `GET`    | `/api/auth/agent-login`                   | `enableAgentLogin` (dev only)     |

## Security notes

- **Rate limiting is in-process** (an in-memory `Map`), applied to the
  magic-link and refresh endpoints. This works correctly on a single instance
  but does **not** share state across replicas/serverless invocations — for
  multi-instance deployments, put a shared store (e.g. Redis) in front of these
  endpoints or accept best-effort protection.
- **Device fingerprint is User-Agent-only, deliberately excluding client IP.**
  IP addresses legitimately change mid-session (dual-stack IPv4/IPv6, Wi-Fi ↔
  mobile handoff, CGNAT, rotating egress IPs), which would otherwise cause false
  "device mismatch" logouts. The high-entropy refresh token is the actual
  security boundary; the fingerprint only catches a token replayed from a
  clearly different client.
- **OAuth `state` is a signed, short-lived JWT** (10 minutes), and the
  `returnUrl` carried through both the OAuth flow and the dev-only agent-login
  endpoint is validated to be a same-origin, path-relative URL before being used
  in a redirect — this closes an open-redirect vector.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when
  `NODE_ENV=production`.
- `disableLocalStrategy: true` fully replaces Payload's built-in email+password
  strategy on the extended collection — see the [Quick start](#quick-start)
  warning above.

## Development

```sh
pnpm install
pnpm dev              # runs the dev/ Payload+Next app against an in-memory MongoDB
pnpm test:int         # vitest (unit + integration)
pnpm test:e2e         # Playwright, against the dev app
pnpm build            # builds dist/
pnpm typecheck
pnpm lint
```

The `dev/` app requires no external database by default — it spins up an
in-memory MongoDB replica set automatically. Set `DATABASE_URL`/`MONGODB_URI` to
point at a real MongoDB instance instead.

## License

MIT
