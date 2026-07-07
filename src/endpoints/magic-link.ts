import type { Endpoint, PayloadRequest } from 'payload'

import type { ResolvedAuthPluginOptions } from '../types'

import {
  buildMagicLinkEmail,
  resolveEmailConfig,
  resolveEmailFrom,
  resolveEmailSubject,
} from '../utilities/emailTemplates'
import { AuthErrors } from '../utilities/errorResponses'
import { getClientIp } from '../utilities/getClientIp'
import { asLoosePayload } from '../utilities/loosePayload'
import { magicLinkRateLimit } from '../utilities/rateLimit'
import { getLoginPath, getRequestOrigin } from '../utilities/requestOrigin'
import { buildAuthCookieHeader, createSession } from '../utilities/session'
import { signMagicLinkToken, verifyMagicLinkToken } from '../utilities/tokens'
import { validateMagicLinkRequest } from '../utilities/validation'

/**
 * Creates the magic link endpoints:
 * - POST /api/auth/magic-link/request  — sends a magic link email
 * - POST /api/auth/magic-link/verify   — verifies a magic link token and logs in
 */
export function createMagicLinkEndpoints(options: ResolvedAuthPluginOptions): Endpoint[] {
  const contextNames = Object.keys(options.contexts)

  return [
    {
      handler: async (req: PayloadRequest) => {
        const { payload } = req

        // Apply rate limiting
        const rateLimitResult = await magicLinkRateLimit(req)
        if (!rateLimitResult.success) {
          return Response.json(
            { error: 'Too many requests' },
            {
              headers: {
                'Retry-After': '900',
                'X-RateLimit-Limit': '5',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.ceil((rateLimitResult.resetTime || 0) / 1000)),
              },
              status: 429,
            },
          )
        }

        let body: unknown
        try {
          body = await req.json!()
        } catch {
          return AuthErrors.invalidRequest('Invalid JSON in request body')
        }

        // Validate input
        const validation = validateMagicLinkRequest(body, contextNames)
        if (validation.error) {
          return AuthErrors.invalidRequest(validation.error)
        }

        const { applicationContext, email } = validation.data!

        try {
          // Find user by email
          const result = await asLoosePayload(payload).find({
            collection: options.usersSlug,
            depth: 1,
            limit: 1,
            where: { email: { equals: email } },
          })

          let user = result.docs[0]

          // Custom guard — e.g. restrict an admin context to certain roles
          // or email domains. Defaults to allowing every request.
          if (options.magicLink.allowUser) {
            const allowed = await options.magicLink.allowUser({
              context: applicationContext,
              email,
              payload,
              req,
              user: (user as null | Record<string, unknown>) ?? null,
            })
            if (!allowed) {
              payload.logger.warn(
                { context: applicationContext, email },
                'Magic link request denied by allowUser guard',
              )
              return Response.json({ error: 'Access denied' }, { status: 403 })
            }
          }

          if (!user) {
            if (!options.magicLink.autoCreateUsers) {
              payload.logger.warn(
                { email },
                'Magic link request for unknown user (autoCreateUsers disabled)',
              )
              // Return success to prevent email enumeration
              return Response.json({ success: true })
            }

            // Auto-create user (passwordless registration)
            payload.logger.info({ email }, 'Creating new user via magic link request')
            const data: Record<string, unknown> = { email }
            const context = applicationContext || options.defaultContext
            if (contextNames.length > 0 && context) {
              data.applicationContext = context
            }
            user = await asLoosePayload(payload).create({
              collection: options.usersSlug,
              data,
            })
          }

          // Generate magic link token
          const token = await signMagicLinkToken(
            {
              applicationContext,
              email: user.email as string,
            },
            options.tokens.magicLinkValidity,
          )

          // Build magic link URL from the actual request origin
          const origin = getRequestOrigin(req, options.serverURL)
          const loginPath = getLoginPath(options, applicationContext, req.headers?.get?.('host'))
          const magicLinkUrl = `${origin}${loginPath}?token=${token}`

          // Resolve email configuration (per-context overrides > global > defaults)
          const context = applicationContext || (user.applicationContext as string | undefined)
          const emailConfig = resolveEmailConfig(options, context)
          const emailSubject = resolveEmailSubject(emailConfig, context)
          const emailFrom = resolveEmailFrom(emailConfig)
          const emailHtml = await buildMagicLinkEmail(emailConfig, {
            context,
            email: user.email as string,
            url: magicLinkUrl,
          })

          // Fire-and-forget: send email without awaiting to prevent
          // Payload's handleEndpoints from intercepting APIError responses.
          // Errors are logged but never exposed to the client (anti-enumeration).
          void payload
            .sendEmail({
              from: emailFrom,
              html: emailHtml,
              subject: emailSubject,
              to: user.email,
            })
            .then(() => {
              payload.logger.info({ email, userId: user.id }, 'Magic link sent')
            })
            .catch((emailError: unknown) => {
              payload.logger.error({ email, err: emailError }, 'Failed to send magic link email')
            })

          return Response.json({ success: true })
        } catch (error) {
          payload.logger.error({ err: error }, 'Magic link request failed')
          // Always return 200 to prevent email enumeration
          return Response.json({ success: true })
        }
      },
      method: 'post',
      path: '/auth/magic-link/request',
    },
    {
      handler: async (req: PayloadRequest) => {
        const { payload } = req

        let body: { token?: string }
        try {
          body = await req.json!()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const { token } = body

        if (!token) {
          return Response.json({ error: 'Token is required' }, { status: 400 })
        }

        try {
          // Verify magic link token
          const claims = await verifyMagicLinkToken(token)

          // One-time-use enforcement: reject if a session was already created
          // for this token's JTI (i.e. the token has already been used).
          const usedCheck = await asLoosePayload(payload).find({
            collection: options.sessionsSlug,
            depth: 0,
            limit: 1,
            where: { magicLinkTokenId: { equals: claims.jti } },
          })
          if (usedCheck.docs[0]) {
            payload.logger.warn(
              { jti: claims.jti },
              'Magic link replay attempt rejected - token already used',
            )
            return Response.json({ error: 'Invalid or expired magic link' }, { status: 401 })
          }

          // Find user by email
          const result = await asLoosePayload(payload).find({
            collection: options.usersSlug,
            depth: 1,
            limit: 1,
            where: { email: { equals: claims.email } },
          })

          const user = result.docs[0]
          if (!user) {
            payload.logger.warn(
              { email: claims.email },
              'Magic link verification failed - user not found',
            )
            return Response.json({ error: 'User not found' }, { status: 404 })
          }

          // Create session
          const session = await createSession({
            clientIp: getClientIp(req),
            magicLinkTokenId: claims.jti,
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

          // Update last login — non-critical, do not await so a transient
          // WriteConflict cannot cause a 401 for an already-successful login.
          void asLoosePayload(payload)
            .update({
              id: String(user.id),
              collection: options.usersSlug,
              context: { skipHooks: true },
              data: {
                lastLoginAt: new Date().toISOString(),
                lastLoginIp: getClientIp(req),
              },
            })
            .catch((updateErr: unknown) => {
              payload.logger.warn(
                { err: updateErr, userId: user.id },
                'Failed to update lastLoginAt (non-critical)',
              )
            })

          const needsOnboarding =
            options.enableOnboarding &&
            (!user.firstName || !user.lastName || !user.onboardingComplete)

          payload.logger.info(
            {
              clientIp: getClientIp(req),
              email: user.email,
              needsOnboarding,
              userId: user.id,
            },
            'Magic link verification successful',
          )

          const headers = new Headers({ 'Content-Type': 'application/json' })
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

          return new Response(
            JSON.stringify({
              needsOnboarding,
              user: { id: String(user.id), email: user.email },
            }),
            { headers, status: 200 },
          )
        } catch (error) {
          payload.logger.error({ err: error }, 'Magic link verification failed')
          return Response.json({ error: 'Invalid or expired magic link' }, { status: 401 })
        }
      },
      method: 'post',
      path: '/auth/magic-link/verify',
    },
  ]
}
