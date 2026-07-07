import type {
  AuthStrategyFunction,
  AuthStrategyResult,
  CollectionConfig,
  Config,
  Plugin,
} from 'payload'

import type { PayloadAuthPluginConfig, ResolvedAuthPluginOptions } from './types'

import { buildSessionsCollection } from './collections/Sessions'
import { buildWebAuthnCredentialsCollection } from './collections/WebAuthnCredentials'
import { createAgentLoginEndpoint } from './endpoints/agent-login'
import { createLogoutEndpoints } from './endpoints/logout'
import { createMagicLinkEndpoints } from './endpoints/magic-link'
import { createOAuthEndpoints } from './endpoints/oauth'
import { createOnboardingEndpoints } from './endpoints/onboarding'
import { createRefreshEndpoints } from './endpoints/refresh'
import { createWebAuthnEndpoints } from './endpoints/webauthn'
import { buildUserFields } from './fields/userFields'
import { createTrackLastLoginHook } from './hooks/afterLogin'
import { AUTH_STRATEGY_NAME, DEFAULT_WEBAUTHN_COLLECTION_SLUG, resolveOptions } from './types'
import { asLoosePayload } from './utilities/loosePayload'
import { cleanupExpiredSessions } from './utilities/session'
import { verifyAccessToken } from './utilities/tokens'

/**
 * Passwordless authentication plugin for Payload CMS.
 *
 * Provides a complete, self-hosted authentication system:
 * - WebAuthn/passkey support (registration + authentication)
 * - Magic link email login
 * - OAuth social login (Google, Facebook)
 * - Custom session management with refresh tokens (HttpOnly cookies)
 * - Optional application contexts with per-context session lifetimes,
 *   login paths, and email branding
 * - Last login tracking (timestamp + IP)
 * - Scheduled cleanup of expired sessions
 *
 * The plugin modifies the incoming Payload config by:
 * 1. Adding new collections (webauthn-credentials, sessions)
 * 2. Extending the users collection with auth fields, hooks, and a custom
 *    JWT auth strategy (replacing the local email+password strategy)
 * 3. Registering API endpoints for all auth flows
 * 4. Registering a scheduled Payload job to clean up expired sessions
 */
export const authPlugin = (pluginOptions: PayloadAuthPluginConfig = {}): Plugin => {
  const options = resolveOptions(pluginOptions)
  const webauthnSlug = pluginOptions.webauthnCollectionSlug ?? DEFAULT_WEBAUTHN_COLLECTION_SLUG

  return (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // --- 1. Add new collections ---
    config.collections = [
      ...(config.collections || []),
      buildWebAuthnCredentialsCollection({ usersSlug: options.usersSlug, webauthnSlug }),
      buildSessionsCollection({ sessionsSlug: options.sessionsSlug, usersSlug: options.usersSlug }),
    ]

    // --- 2. Extend the users collection ---
    config.collections = config.collections.map((collection) => {
      if (collection.slug === options.usersSlug) {
        return extendUsersCollection(collection, options)
      }
      return collection
    })

    // --- 3. Register API endpoints ---
    const endpoints = [
      ...(options.enableMagicLink ? createMagicLinkEndpoints(options) : []),
      ...(options.enableWebAuthn ? createWebAuthnEndpoints(options, webauthnSlug) : []),
      ...(options.enableOAuth ? createOAuthEndpoints(options) : []),
      ...createRefreshEndpoints(options),
      ...createLogoutEndpoints(options),
      ...(options.enableOnboarding ? createOnboardingEndpoints(options) : []),
      ...(options.enableAgentLogin ? [createAgentLoginEndpoint(options)] : []),
    ]

    config.endpoints = [...(config.endpoints || []), ...endpoints]

    // --- 4. Inject admin panel login components ---
    // Magic link form above Payload's login form (beforeLogin) and
    // OAuth/passkey buttons below it (afterLogin). Opt out via
    // `adminUI.enabled: false`.
    if (options.adminUI.enabled) {
      const redirectPath = options.adminUI.redirectPath ?? incomingConfig.routes?.admin ?? '/admin'

      const beforeLogin = [...(config.admin?.components?.beforeLogin || [])]
      const afterLogin = [...(config.admin?.components?.afterLogin || [])]

      if (options.enableMagicLink) {
        beforeLogin.push({
          clientProps: {
            context: options.adminUI.context,
            redirectPath,
          },
          path: '@trieb.work/payload-auth-pwless/client#AdminMagicLinkLogin',
        })
      }

      if (options.enableWebAuthn || options.adminUI.oauthProviders.length > 0) {
        afterLogin.push({
          clientProps: {
            context: options.adminUI.context,
            oauthProviders: options.adminUI.oauthProviders,
            redirectPath,
            showPasskey: options.enableWebAuthn,
          },
          path: '@trieb.work/payload-auth-pwless/client#AdminLoginButtons',
        })
      }

      config.admin = {
        ...(config.admin || {}),
        components: {
          ...(config.admin?.components || {}),
          afterLogin,
          beforeLogin,
        },
      }
    }

    // --- 5. Register scheduled job for session cleanup ---
    // Uses PayloadCMS 3 Jobs Queue. The task is auto-queued by its `schedule`.
    // To actually execute the queued jobs, the root config must also configure
    // `jobs.autoRun` (or use Vercel Cron / a custom runner on serverless).
    if (options.sessionCleanup.enabled) {
      config.jobs = {
        ...(config.jobs || {}),
        tasks: [
          ...(config.jobs?.tasks || []),
          {
            slug: 'cleanup-expired-sessions',
            handler: async ({ req }) => {
              const deletedCount = await cleanupExpiredSessions(req.payload, options.sessionsSlug)
              req.payload.logger.info({ deletedCount }, 'Session cleanup completed')
              return { output: { deletedCount } }
            },
            label: 'Cleanup Expired Sessions',
            schedule: [
              {
                cron: options.sessionCleanup.cron,
                queue: options.sessionCleanup.queue,
              },
            ],
          },
        ],
      }
    }

    return config
  }
}

/**
 * Extends the users collection with auth-related fields, hooks, and config.
 */
function extendUsersCollection(
  collection: CollectionConfig,
  options: ResolvedAuthPluginOptions,
): CollectionConfig {
  const existingFields = collection.fields || []
  const existingHooks = collection.hooks || {}

  return {
    ...collection,
    auth: {
      ...(typeof collection.auth === 'object' ? collection.auth : {}),
      cookies: {
        sameSite: 'Lax' as const,
        secure: options.cookieSecure,
      },
      disableLocalStrategy: true,
      lockTime: 600_000, // 10 minutes
      maxLoginAttempts: 5,
      strategies: [
        {
          name: AUTH_STRATEGY_NAME,
          authenticate: createAuthStrategy(options),
        },
      ],
      tokenExpiration: options.tokens.accessTokenLifetime,
      useSessions: false,
    },
    fields: [...existingFields, ...buildUserFields(options)],
    hooks: {
      ...existingHooks,
      afterLogin: [
        ...(existingHooks.afterLogin || []),
        createTrackLastLoginHook(options.usersSlug),
      ],
    },
  }
}

/**
 * Custom auth strategy for Payload's admin panel and API.
 *
 * Extracts the JWT from the `payload-token` cookie or Authorization header,
 * verifies it with PAYLOAD_SECRET (HS256), and returns the user document.
 * This replaces Payload's built-in local strategy (email+password).
 */
function createAuthStrategy(options: ResolvedAuthPluginOptions): AuthStrategyFunction {
  return async ({ headers, isGraphQL, payload }) => {
    try {
      // Extract token from Authorization header or cookie
      const authHeader = headers.get('authorization') || headers.get('Authorization')
      let token: null | string = null

      if (authHeader?.startsWith('JWT ') || authHeader?.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]
      }

      if (!token) {
        const cookieHeader = headers.get('cookie') || ''
        const match = cookieHeader.match(/payload-token=([^;]+)/)
        token = match?.[1] || null
      }

      if (!token) {
        return { user: null }
      }

      const claims = await verifyAccessToken(token)

      if (!claims.id || claims.collection !== options.usersSlug) {
        return { user: null }
      }

      const user = await asLoosePayload(payload).findByID({
        id: claims.id,
        collection: options.usersSlug,
        depth: isGraphQL ? 0 : 1,
      })

      if (!user) {
        return { user: null }
      }

      const authedUser = { ...user, _strategy: AUTH_STRATEGY_NAME, collection: options.usersSlug }
      return { user: authedUser as unknown as AuthStrategyResult['user'] }
    } catch {
      return { user: null }
    }
  }
}
