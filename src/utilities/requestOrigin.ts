import type { PayloadRequest } from 'payload'

import type { ResolvedAuthPluginOptions } from '../types'

/**
 * Extracts the actual request origin from incoming headers.
 * Respects reverse proxy headers (x-forwarded-proto, x-forwarded-host).
 * Falls back to req.url host, then to a static serverURL.
 */
export function getRequestOrigin(req: PayloadRequest, fallbackServerURL?: string): string {
  const protocol =
    req.headers?.get?.('x-forwarded-proto') || (req.url?.startsWith('https') ? 'https' : 'http')

  const host =
    req.headers?.get?.('x-forwarded-host') ||
    req.headers?.get?.('host') ||
    (fallbackServerURL ? new URL(fallbackServerURL).host : 'localhost')

  return `${protocol}://${host}`
}

/**
 * Returns the login path the magic link should point to.
 *
 * Resolution order:
 * 1. `magicLink.getLoginPath` callback (full control, e.g. host-based routing)
 * 2. `contexts.<context>.loginPath`
 * 3. `'/login'`
 */
export function getLoginPath(
  options: ResolvedAuthPluginOptions,
  context: string | undefined,
  requestHost: null | string | undefined,
): string {
  if (options.magicLink.getLoginPath) {
    return options.magicLink.getLoginPath({ context, host: requestHost })
  }

  if (context && options.contexts[context]?.loginPath) {
    return options.contexts[context].loginPath
  }

  return '/login'
}

/**
 * Resolves the frontend onboarding path, or `undefined` when no onboarding
 * UI is configured (in which case post-login redirects honor `returnUrl`).
 */
export function getOnboardingPath(
  options: ResolvedAuthPluginOptions,
  context: string | undefined,
  requestHost: null | string | undefined,
): string | undefined {
  if (typeof options.onboardingPath === 'function') {
    return options.onboardingPath({ context, host: requestHost })
  }
  return options.onboardingPath
}

/**
 * Guards against open-redirect attacks in `returnUrl`-style query params.
 * Only allows same-origin, path-relative redirects: must start with a
 * single `/` and must not be protocol-relative (`//host/...`) or contain a
 * backslash (some browsers treat `/\evil.com` as protocol-relative).
 */
export function isSafeRedirectPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}
