import type { Payload, PayloadRequest } from 'payload'

/**
 * Default access token lifetime in seconds (15 minutes).
 */
export const DEFAULT_ACCESS_TOKEN_LIFETIME = 15 * 60

/**
 * Default magic link validity in seconds (15 minutes).
 */
export const DEFAULT_MAGIC_LINK_VALIDITY = 15 * 60

/**
 * Default session lifetime in seconds (7 days).
 */
export const DEFAULT_SESSION_LIFETIME = 7 * 24 * 60 * 60

/**
 * Default collection slugs used by the plugin.
 */
export const DEFAULT_USERS_COLLECTION_SLUG = 'users'
export const DEFAULT_SESSIONS_COLLECTION_SLUG = 'sessions'
export const DEFAULT_WEBAUTHN_COLLECTION_SLUG = 'webauthn-credentials'

/**
 * Name of the auth strategy the plugin registers on the users collection.
 */
export const AUTH_STRATEGY_NAME = 'payload-auth'

/**
 * Shape of a social account entry stored on the user document.
 */
export interface SocialAccount {
  email?: string
  provider: string
  providerId: string
}

/**
 * Arguments passed to the `buildEmailHTML` / `buildEmailSubject` callbacks.
 */
export interface MagicLinkEmailArgs {
  /** Application context requested for this login (if contexts are configured). */
  context?: string
  /** Recipient email address. */
  email: string
  /** The fully-qualified magic link URL. */
  url: string
}

/**
 * Magic link email configuration. Can be set globally (`email`) and
 * overridden per application context (`contexts.<name>.email`).
 */
export interface MagicLinkEmailConfig {
  /**
   * Builds the HTML body of the magic link email.
   * A neutral default template is used when omitted.
   */
  buildEmailHTML?: (args: MagicLinkEmailArgs) => Promise<string> | string
  /**
   * The `from` address, e.g. `'My App <noreply@example.com>'`.
   * Falls back to the `EMAIL_FROM_ADDRESS` env var.
   */
  from?: string
  /**
   * The email subject. A neutral default is used when omitted.
   */
  subject?: ((args: { context?: string }) => string) | string
}

/**
 * Per-application-context configuration. Contexts are entirely optional —
 * configure them when a single Payload instance serves multiple frontends
 * (e.g. a public app, a back-office, a partner portal) that need different
 * session lifetimes, login paths, or email branding.
 */
export interface ApplicationContextConfig {
  /** Email configuration overrides for this context. */
  email?: MagicLinkEmailConfig
  /**
   * Path of the login page for this context (the magic link points here).
   * @default '/login'
   */
  loginPath?: string
  /**
   * Session (refresh token) lifetime for this context in seconds.
   * @default DEFAULT_SESSION_LIFETIME (7 days)
   */
  sessionLifetime?: number
}

/**
 * Arguments passed to the magic link `allowUser` guard.
 */
export interface MagicLinkAllowUserArgs {
  /** Application context requested for this login (if configured). */
  context?: string
  /** The (lowercased) email address that requested a magic link. */
  email: string
  payload: Payload
  req: PayloadRequest
  /**
   * The existing user document, or `null` when no user with this email
   * exists yet.
   */
  user: null | Record<string, unknown>
}

/**
 * Magic link behaviour configuration.
 */
export interface MagicLinkConfig {
  /**
   * Guard executed before a magic link is issued. Return `false` to deny
   * the request (e.g. restrict an admin context to certain roles or email
   * domains). The default allows all requests.
   */
  allowUser?: (args: MagicLinkAllowUserArgs) => boolean | Promise<boolean>
  /**
   * Automatically create a user when no account exists for the requested
   * email (passwordless registration).
   * @default true
   */
  autoCreateUsers?: boolean
  /**
   * Resolve the login path for the magic link URL. Takes precedence over
   * `contexts.<name>.loginPath`. Useful for host-based routing setups.
   */
  getLoginPath?: (args: { context?: string; host?: null | string }) => string
}

/**
 * OAuth provider credentials.
 */
export interface OAuthProviderCredentials {
  clientId: string
  clientSecret: string
}

/**
 * OAuth configuration. Google and Facebook are supported out of the box.
 * Credentials fall back to the `GOOGLE_OAUTH_CLIENT_ID` /
 * `GOOGLE_OAUTH_CLIENT_SECRET` / `FACEBOOK_OAUTH_CLIENT_ID` /
 * `FACEBOOK_OAUTH_CLIENT_SECRET` env vars.
 */
export interface OAuthConfig {
  providers?: {
    facebook?: OAuthProviderCredentials
    google?: OAuthProviderCredentials
  }
}

/**
 * WebAuthn behaviour configuration.
 */
export interface WebAuthnConfig {
  /**
   * Returns `true` when `reqUser` may view/manage passkey credentials of
   * `targetUserId` (e.g. admin support tooling). Users can always manage
   * their own credentials; the default denies everything else.
   */
  canManageUser?: (reqUser: Record<string, unknown>, targetUserId: string) => boolean
}

/**
 * Dev-only agent/browser auto-login configuration.
 */
export interface AgentLoginConfig {
  /**
   * Hostnames the endpoint responds to.
   * @default ['localhost', '127.0.0.1', '::1']
   */
  allowedHostnames?: string[]
  /**
   * Email of the auto-created agent user.
   * @default 'agent@localhost.dev'
   */
  email?: string
  /**
   * Shared secret required as `?secret=` query param.
   * Falls back to the `AGENT_AUTO_LOGIN_SECRET` env var.
   */
  secret?: string
}

/**
 * Session cleanup job configuration.
 */
export interface SessionCleanupConfig {
  /**
   * Cron schedule for the cleanup job.
   * @default '0 2 * * *' (daily at 2 AM)
   */
  cron?: string
  /**
   * Register a scheduled Payload job that deletes expired sessions.
   * @default true
   */
  enabled?: boolean
  /**
   * Jobs queue name.
   * @default 'default'
   */
  queue?: string
}

/**
 * Token configuration options.
 */
export interface TokenConfig {
  /**
   * Access token lifetime in seconds.
   * @default 900 (15 minutes)
   */
  accessTokenLifetime?: number
  /**
   * Session (refresh token) lifetime in seconds, used when no
   * per-context lifetime applies.
   * @default 604800 (7 days)
   */
  defaultSessionLifetime?: number
  /**
   * Magic link validity in seconds.
   * @default 900 (15 minutes)
   */
  magicLinkValidity?: number
}

/**
 * Admin panel UI configuration. The plugin ships React components for the
 * Payload admin (magic link login form, passkey/OAuth login buttons, and a
 * passkey management field on the users collection) and injects them
 * automatically. Set `enabled: false` to opt out and wire your own.
 */
export interface AdminUIConfig {
  /**
   * Application context used by the admin login components (magic link
   * request + OAuth initiate). Defaults to `defaultContext`.
   */
  context?: string
  /**
   * Inject the admin login components and passkey management field.
   * @default true
   */
  enabled?: boolean
  /**
   * OAuth providers to show login buttons for. Defaults to the providers
   * that are actually configured (options or env vars).
   */
  oauthProviders?: string[]
  /**
   * Inject the passkey management UI field into the users collection.
   * Defaults to `enableWebAuthn`.
   */
  passkeyManagementField?: boolean
  /**
   * Where the admin login components redirect after a successful login.
   * Defaults to the admin route of the Payload config (usually `/admin`).
   */
  redirectPath?: string
}

/**
 * Configuration options for the payload-auth plugin.
 */
export interface PayloadAuthPluginConfig {
  /** Admin panel UI (login components + passkey management field). */
  adminUI?: AdminUIConfig
  /** Dev-only agent auto-login configuration. */
  agentLogin?: AgentLoginConfig
  /**
   * Allowed origins for WebAuthn operations (multi-host setups).
   * Falls back to `[serverURL]`.
   */
  allowedOrigins?: string[]
  /**
   * Optional application contexts. When configured, an
   * `applicationContext` select field is added to the users collection and
   * session lifetimes / login paths / emails can vary per context.
   */
  contexts?: Record<string, ApplicationContextConfig>
  /**
   * Auth cookie configuration.
   */
  cookies?: {
    /**
     * Mark auth cookies as `Secure`. Defaults to `true` when `serverURL`
     * uses https, `false` otherwise (NOT NODE_ENV-based — `next start`
     * forces NODE_ENV=production even on plain-http localhost).
     */
    secure?: boolean
  }
  /**
   * The context assigned to auto-created users when none is requested.
   * Defaults to the first key of `contexts`.
   */
  defaultContext?: string
  /** Global magic link email configuration. */
  email?: MagicLinkEmailConfig
  /**
   * Enable the agent auto-login endpoint for local development testing.
   * When enabled, `/api/auth/agent-login` is registered. The endpoint only
   * responds to localhost hosts and requires a shared secret.
   * @default false
   */
  enableAgentLogin?: boolean
  /**
   * Whether to enable magic link email login.
   * @default true
   */
  enableMagicLink?: boolean
  /**
   * Whether to enable OAuth social login.
   * @default true
   */
  enableOAuth?: boolean
  /**
   * Register a `/api/auth/onboarding` endpoint plus `firstName` /
   * `lastName` / `onboardingComplete` user fields for profile completion
   * after first login.
   * @default true
   */
  enableOnboarding?: boolean
  /**
   * Whether to enable WebAuthn/passkey support.
   * @default true
   */
  enableWebAuthn?: boolean
  /** Magic link behaviour configuration. */
  magicLink?: MagicLinkConfig
  /** OAuth configuration. */
  oauth?: OAuthConfig
  /**
   * WebAuthn Relying Party ID (typically the domain without port).
   * Falls back to the hostname of `serverURL`.
   */
  rpID?: string
  /**
   * WebAuthn Relying Party name shown to users during passkey registration.
   * @default 'Payload'
   */
  rpName?: string
  /**
   * The URL of the application, used for OAuth callbacks and magic link
   * URLs. Falls back to the `NEXT_PUBLIC_SERVER_URL` env var, then
   * `http://localhost:3000`.
   */
  serverURL?: string
  /** Session cleanup job configuration. */
  sessionCleanup?: SessionCleanupConfig
  /**
   * Slug of the sessions collection the plugin creates.
   * @default 'sessions'
   */
  sessionsCollectionSlug?: string
  /** Token configuration options. */
  tokens?: TokenConfig
  /**
   * Slug of the (existing) users collection the plugin extends.
   * @default 'users'
   */
  usersCollectionSlug?: string
  /** WebAuthn behaviour configuration. */
  webauthn?: WebAuthnConfig
  /**
   * Slug of the WebAuthn credentials collection the plugin creates.
   * @default 'webauthn-credentials'
   */
  webauthnCollectionSlug?: string
}

/**
 * Resolved token configuration with all defaults applied.
 */
export interface ResolvedTokenConfig {
  accessTokenLifetime: number
  defaultSessionLifetime: number
  magicLinkValidity: number
  /** Session lifetimes per configured context. */
  sessionLifetimes: Record<string, number>
}

/**
 * Resolved plugin options with all defaults applied.
 */
export interface ResolvedAuthPluginOptions {
  adminUI: {
    context: string | undefined
    enabled: boolean
    oauthProviders: string[]
    passkeyManagementField: boolean
    /** `undefined` means: derive from the Payload config's admin route. */
    redirectPath: string | undefined
  }
  agentLogin: Pick<AgentLoginConfig, 'secret'> &
    Required<Pick<AgentLoginConfig, 'allowedHostnames' | 'email'>>
  allowedOrigins: string[]
  contexts: Record<string, ApplicationContextConfig>
  /** Whether auth cookies carry the `Secure` attribute. */
  cookieSecure: boolean
  defaultContext: string | undefined
  email: MagicLinkEmailConfig
  enableAgentLogin: boolean
  enableMagicLink: boolean
  enableOAuth: boolean
  enableOnboarding: boolean
  enableWebAuthn: boolean
  magicLink: Pick<MagicLinkConfig, 'allowUser' | 'getLoginPath'> &
    Required<Pick<MagicLinkConfig, 'autoCreateUsers'>>
  oauth: OAuthConfig
  rpID: string
  rpName: string
  serverURL: string
  sessionCleanup: Required<SessionCleanupConfig>
  sessionsSlug: string
  tokens: ResolvedTokenConfig
  usersSlug: string
  webauthn: WebAuthnConfig
}

/**
 * Returns the OAuth providers that have credentials configured, either via
 * plugin options or via the conventional env vars.
 */
export function resolveConfiguredOAuthProviders(oauth: OAuthConfig | undefined): string[] {
  const providers: string[] = []
  if (
    oauth?.providers?.google?.clientId ||
    (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  ) {
    providers.push('google')
  }
  if (
    oauth?.providers?.facebook?.clientId ||
    (process.env.FACEBOOK_OAUTH_CLIENT_ID && process.env.FACEBOOK_OAUTH_CLIENT_SECRET)
  ) {
    providers.push('facebook')
  }
  return providers
}

/**
 * Resolves plugin options by applying defaults.
 */
export function resolveOptions(opts: PayloadAuthPluginConfig = {}): ResolvedAuthPluginOptions {
  const serverURL = opts.serverURL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
  const url = new URL(serverURL)

  const contexts = opts.contexts ?? {}
  const contextNames = Object.keys(contexts)

  const defaultSessionLifetime = opts.tokens?.defaultSessionLifetime ?? DEFAULT_SESSION_LIFETIME

  const sessionLifetimes: Record<string, number> = {}
  for (const name of contextNames) {
    sessionLifetimes[name] = contexts[name].sessionLifetime ?? defaultSessionLifetime
  }

  const enableOAuth = opts.enableOAuth ?? true
  const enableWebAuthn = opts.enableWebAuthn ?? true
  const defaultContext = opts.defaultContext ?? contextNames[0]

  return {
    adminUI: {
      context: opts.adminUI?.context ?? defaultContext,
      enabled: opts.adminUI?.enabled ?? true,
      oauthProviders:
        opts.adminUI?.oauthProviders ??
        (enableOAuth ? resolveConfiguredOAuthProviders(opts.oauth) : []),
      passkeyManagementField: opts.adminUI?.passkeyManagementField ?? enableWebAuthn,
      redirectPath: opts.adminUI?.redirectPath,
    },
    agentLogin: {
      allowedHostnames: opts.agentLogin?.allowedHostnames ?? ['localhost', '127.0.0.1', '::1'],
      email: opts.agentLogin?.email ?? 'agent@localhost.dev',
      secret: opts.agentLogin?.secret,
    },
    allowedOrigins: opts.allowedOrigins ?? [serverURL],
    contexts,
    cookieSecure: opts.cookies?.secure ?? url.protocol === 'https:',
    defaultContext,
    email: opts.email ?? {},
    enableAgentLogin: opts.enableAgentLogin ?? false,
    enableMagicLink: opts.enableMagicLink ?? true,
    enableOAuth,
    enableOnboarding: opts.enableOnboarding ?? true,
    enableWebAuthn,
    magicLink: {
      allowUser: opts.magicLink?.allowUser,
      autoCreateUsers: opts.magicLink?.autoCreateUsers ?? true,
      getLoginPath: opts.magicLink?.getLoginPath,
    },
    oauth: opts.oauth ?? {},
    rpID: opts.rpID ?? url.hostname,
    rpName: opts.rpName ?? 'Payload',
    serverURL,
    sessionCleanup: {
      cron: opts.sessionCleanup?.cron ?? '0 2 * * *',
      enabled: opts.sessionCleanup?.enabled ?? true,
      queue: opts.sessionCleanup?.queue ?? 'default',
    },
    sessionsSlug: opts.sessionsCollectionSlug ?? DEFAULT_SESSIONS_COLLECTION_SLUG,
    tokens: {
      accessTokenLifetime: opts.tokens?.accessTokenLifetime ?? DEFAULT_ACCESS_TOKEN_LIFETIME,
      defaultSessionLifetime,
      magicLinkValidity: opts.tokens?.magicLinkValidity ?? DEFAULT_MAGIC_LINK_VALIDITY,
      sessionLifetimes,
    },
    usersSlug: opts.usersCollectionSlug ?? DEFAULT_USERS_COLLECTION_SLUG,
    webauthn: opts.webauthn ?? {},
  }
}
