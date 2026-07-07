import type { Endpoint, PayloadRequest } from 'payload'

import type { ResolvedAuthPluginOptions } from '../types'

import { getClientIp } from '../utilities/getClientIp'
import { asLoosePayload } from '../utilities/loosePayload'
import { getOnboardingPath, getRequestOrigin, isSafeRedirectPath } from '../utilities/requestOrigin'
import { buildAuthCookieHeader, createSession } from '../utilities/session'
import { signOAuthState, verifyOAuthState } from '../utilities/tokens'

/**
 * OAuth provider configuration.
 */
interface OAuthProviderConfig {
  authorizationUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
  tokenUrl: string
  userInfoUrl: string
}

/**
 * Provider configurations from plugin options with env var fallbacks.
 */
function getProviderConfig(
  provider: string,
  options: ResolvedAuthPluginOptions,
): null | OAuthProviderConfig {
  switch (provider) {
    case 'facebook': {
      const clientId =
        options.oauth.providers?.facebook?.clientId || process.env.FACEBOOK_OAUTH_CLIENT_ID
      const clientSecret =
        options.oauth.providers?.facebook?.clientSecret || process.env.FACEBOOK_OAUTH_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        return null
      }
      return {
        authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        clientId,
        clientSecret,
        scopes: ['email', 'public_profile'],
        tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
        userInfoUrl: 'https://graph.facebook.com/v19.0/me?fields=id,name,email',
      }
    }
    case 'google': {
      const clientId =
        options.oauth.providers?.google?.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID
      const clientSecret =
        options.oauth.providers?.google?.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        return null
      }
      return {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId,
        clientSecret,
        scopes: [
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'openid',
        ],
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      }
    }
    default:
      return null
  }
}

interface OAuthProfile {
  email: string
  emailVerified: boolean
  name?: string
  providerId: string
}

/**
 * Fetches user profile from OAuth provider using access token.
 */
async function fetchOAuthProfile(
  provider: string,
  accessToken: string,
  config: OAuthProviderConfig,
): Promise<OAuthProfile> {
  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user info from ${provider}`)
  }

  const data = await response.json()

  switch (provider) {
    case 'facebook':
      return {
        name: data.name,
        email: data.email,
        emailVerified: true, // Facebook emails are verified
        providerId: data.id,
      }
    case 'google':
      return {
        name: data.name,
        email: data.email,
        emailVerified: data.email_verified === true,
        providerId: data.sub,
      }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Creates the OAuth endpoints:
 * - GET  /api/auth/oauth/:provider            — redirects to provider
 * - GET  /api/auth/oauth/:provider/callback   — handles callback
 */
export function createOAuthEndpoints(options: ResolvedAuthPluginOptions): Endpoint[] {
  const contextNames = Object.keys(options.contexts)

  return [
    // === OAuth Initiate ===
    {
      handler: async (req: PayloadRequest) => {
        const provider = (req.routeParams as { provider?: string })?.provider
        if (!provider) {
          return Response.json({ error: 'Provider is required' }, { status: 400 })
        }

        const config = getProviderConfig(provider, options)
        if (!config) {
          return Response.json({ error: `Provider ${provider} not configured` }, { status: 404 })
        }

        // Get application context from query params
        const origin = getRequestOrigin(req, options.serverURL)
        const url = new URL(req.url || '', origin)
        const appContext = url.searchParams.get('context') || options.defaultContext || ''
        // Default post-login target: the Payload admin route
        const requestedReturnUrl = url.searchParams.get('returnUrl') || options.adminRoute
        const returnUrl =
          isSafeRedirectPath(requestedReturnUrl) ? requestedReturnUrl : options.adminRoute

        const state = await signOAuthState({ appContext, provider, returnUrl })

        const params = new URLSearchParams({
          access_type: 'offline',
          client_id: config.clientId,
          prompt: 'consent',
          redirect_uri: `${origin}/api/auth/oauth/${provider}/callback`,
          response_type: 'code',
          scope: config.scopes.join(' '),
          state,
        })

        return Response.redirect(`${config.authorizationUrl}?${params.toString()}`)
      },
      method: 'get',
      path: '/auth/oauth/:provider',
    },

    // === OAuth Callback ===
    {
      handler: async (req: PayloadRequest) => {
        const { payload } = req
        const provider = (req.routeParams as { provider?: string })?.provider
        if (!provider) {
          return Response.json({ error: 'Provider is required' }, { status: 400 })
        }

        const config = getProviderConfig(provider, options)
        if (!config) {
          return Response.json({ error: `Provider ${provider} not configured` }, { status: 404 })
        }

        const origin = getRequestOrigin(req, options.serverURL)
        const url = new URL(req.url || '', origin)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        if (error) {
          payload.logger.warn({ error, provider }, 'OAuth error from provider')
          return Response.redirect(`${origin}/login?error=oauth_failed`)
        }

        if (!code || !state) {
          return Response.redirect(`${origin}/login?error=missing_params`)
        }

        let stateData: { appContext?: string; provider: string; returnUrl: string }
        try {
          const parsed = await verifyOAuthState(state)
          const ctx =
            contextNames.includes(parsed.appContext ?? '') ?
              parsed.appContext
            : options.defaultContext
          const returnUrl =
            isSafeRedirectPath(parsed.returnUrl) ? parsed.returnUrl : options.adminRoute
          stateData = { ...parsed, appContext: ctx, returnUrl }
        } catch {
          return Response.redirect(`${origin}/login?error=invalid_state`)
        }

        try {
          // Exchange code for tokens
          const tokenResponse = await fetch(config.tokenUrl, {
            body: new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              code,
              grant_type: 'authorization_code',
              redirect_uri: `${origin}/api/auth/oauth/${provider}/callback`,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
          })

          if (!tokenResponse.ok) {
            throw new Error(`Token exchange failed: ${tokenResponse.status}`)
          }

          const tokenData = await tokenResponse.json()
          const accessToken = tokenData.access_token

          // Fetch user profile
          const profile = await fetchOAuthProfile(provider, accessToken, config)

          // Security: only allow verified emails
          if (!profile.emailVerified) {
            payload.logger.warn({ provider }, 'OAuth login with unverified email rejected')
            return Response.redirect(`${origin}/login?error=email_unverified`)
          }

          // Find user: first by socialAccounts (provider+providerId), then by email
          const bySocial = await asLoosePayload(payload).find({
            collection: options.usersSlug,
            depth: 1,
            limit: 1,
            where: {
              'socialAccounts.provider': { equals: provider },
              'socialAccounts.providerId': { equals: profile.providerId },
            },
          })

          let user = bySocial.docs[0]

          if (!user) {
            const byEmail = await asLoosePayload(payload).find({
              collection: options.usersSlug,
              depth: 1,
              limit: 1,
              where: { email: { equals: profile.email } },
            })

            user = byEmail.docs[0]

            if (user) {
              // Link social account to existing user
              const existingAccounts = (user.socialAccounts as Array<Record<string, unknown>>) || []
              await asLoosePayload(payload).update({
                id: String(user.id),
                collection: options.usersSlug,
                data: {
                  socialAccounts: [
                    ...existingAccounts,
                    { email: profile.email, provider, providerId: profile.providerId },
                  ],
                },
              })
              payload.logger.info(
                { provider, userId: String(user.id) },
                'Social account linked to existing user',
              )
            } else {
              // Create new user
              const data: Record<string, unknown> = {
                email: profile.email,
                socialAccounts: [
                  { email: profile.email, provider, providerId: profile.providerId },
                ],
              }
              if (contextNames.length > 0 && stateData.appContext) {
                data.applicationContext = stateData.appContext
              }
              user = await asLoosePayload(payload).create({
                collection: options.usersSlug,
                data,
              })
              payload.logger.info(
                { provider, userId: String(user.id) },
                'New user created via OAuth',
              )
            }
          }

          // Create session
          const session = await createSession({
            clientIp: getClientIp(req),
            payload,
            sessionsSlug: options.sessionsSlug,
            tokenConfig: options.tokens,
            user: {
              id: String(user.id),
              applicationContext: user.applicationContext as null | string | undefined,
              email: user.email as string,
            },
            userAgent: req.headers?.get?.('user-agent') || undefined,
            usersSlug: options.usersSlug,
          })

          // Update last login
          await asLoosePayload(payload).update({
            id: String(user.id),
            collection: options.usersSlug,
            context: { skipHooks: true },
            data: {
              lastLoginAt: new Date().toISOString(),
              lastLoginIp: getClientIp(req),
            },
          })

          // Redirect with cookies.
          // Users with incomplete profiles are only redirected to an
          // onboarding UI when the app configured one (`onboarding.path`);
          // otherwise `returnUrl` is honored (default: the admin route).
          const needsOnboarding =
            options.enableOnboarding &&
            (!user.firstName || !user.lastName || !user.onboardingComplete)
          const onboardingPath =
            needsOnboarding ?
              getOnboardingPath(options, stateData.appContext, req.headers?.get?.('host'))
            : undefined
          const redirectUrl =
            onboardingPath ?
              `${onboardingPath}?step=onboarding`
            : stateData.returnUrl || options.adminRoute
          const headers = new Headers()
          headers.set('Location', `${origin}${redirectUrl}`)
          headers.append(
            'Set-Cookie',
            buildAuthCookieHeader(
              'payload-token',
              session.accessToken,
              options.tokens.accessTokenLifetime,
              options.cookieSecure,
            ),
          )
          headers.append(
            'Set-Cookie',
            buildAuthCookieHeader(
              'refresh-token',
              session.refreshToken,
              Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
              options.cookieSecure,
            ),
          )

          return new Response(null, { headers, status: 302 })
        } catch (error) {
          payload.logger.error({ err: error, provider }, 'OAuth callback failed')
          const fallbackOrigin = getRequestOrigin(req, options.serverURL)
          return Response.redirect(`${fallbackOrigin}/login?error=oauth_failed`)
        }
      },
      method: 'get',
      path: '/auth/oauth/:provider/callback',
    },
  ]
}
