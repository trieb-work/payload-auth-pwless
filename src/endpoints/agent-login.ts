import type { Endpoint, PayloadRequest } from 'payload'

import type { ResolvedAuthPluginOptions } from '../types'

import { getClientIp } from '../utilities/getClientIp'
import { asLoosePayload } from '../utilities/loosePayload'
import { isSafeRedirectPath } from '../utilities/requestOrigin'
import { buildAuthCookieHeader, createSession } from '../utilities/session'

/**
 * Creates a GET endpoint for agent/browser auto-login on localhost.
 *
 * Security model:
 * - The endpoint is only registered when `enableAgentLogin: true` is passed
 *   to the plugin config.
 * - It only responds to requests from allowlisted (localhost) hostnames.
 * - Requires a shared secret (`agentLogin.secret` option or the
 *   `AGENT_AUTO_LOGIN_SECRET` env var) as matching query param.
 * - Creates or reuses a single agent user (default `agent@localhost.dev`).
 *
 * Usage:
 *   GET /api/auth/agent-login?secret=<secret>&returnUrl=/
 */
export function createAgentLoginEndpoint(options: ResolvedAuthPluginOptions): Endpoint {
  const isAllowedHost = (host: string): boolean => {
    const hostname = host.split(':')[0]
    return options.agentLogin.allowedHostnames.includes(hostname)
  }

  return {
    handler: async (req: PayloadRequest) => {
      const { payload } = req

      const host = req.headers?.get?.('host') || ''
      if (!isAllowedHost(host)) {
        payload.logger.warn({ host }, 'Agent login denied — non-allowlisted host')
        return new Response('Forbidden', { status: 403 })
      }

      const secret = options.agentLogin.secret || process.env.AGENT_AUTO_LOGIN_SECRET
      if (!secret) {
        payload.logger.warn('Agent login denied — no agent login secret configured')
        return new Response('Forbidden', { status: 403 })
      }

      const url = new URL(req.url || '/', options.serverURL)
      const providedSecret = url.searchParams.get('secret')
      if (providedSecret !== secret) {
        payload.logger.warn('Agent login denied — invalid secret provided')
        return new Response('Forbidden', { status: 403 })
      }

      const agentEmail = options.agentLogin.email
      let user
      try {
        const result = await asLoosePayload(payload).find({
          collection: options.usersSlug,
          depth: 0,
          limit: 1,
          where: { email: { equals: agentEmail } },
        })
        user = result.docs[0]
      } catch (err) {
        payload.logger.error({ err }, 'Agent login: failed to find user')
        return new Response('Internal error', { status: 500 })
      }

      if (!user) {
        try {
          const data: Record<string, unknown> = { email: agentEmail }
          if (options.enableOnboarding) {
            data.firstName = 'Agent'
            data.lastName = 'Browser'
            data.onboardingComplete = true
          }
          if (options.defaultContext) {
            data.applicationContext = options.defaultContext
          }
          user = await asLoosePayload(payload).create({
            collection: options.usersSlug,
            data,
          })
          payload.logger.info({ userId: user.id }, 'Agent login: created agent user')
        } catch (err) {
          payload.logger.error({ err }, 'Agent login: failed to create user')
          return new Response('Internal error', { status: 500 })
        }
      }

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

      const headers = new Headers()
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

      const requestedReturnUrl = url.searchParams.get('returnUrl') || options.adminRoute
      headers.append(
        'Location',
        isSafeRedirectPath(requestedReturnUrl) ? requestedReturnUrl : options.adminRoute,
      )

      payload.logger.info({ userId: user.id }, 'Agent login: session created')

      return new Response(null, { headers, status: 302 })
    },
    method: 'get',
    path: '/auth/agent-login',
  }
}
