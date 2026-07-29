import { afterAll, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_ACCESS_TOKEN_LIFETIME,
  DEFAULT_MAGIC_LINK_VALIDITY,
  DEFAULT_SESSION_LIFETIME,
  resolveOptions,
} from './types'

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('default lifetimes', () => {
  it('access token lifetime should be 15 minutes (900 seconds)', () => {
    expect(DEFAULT_ACCESS_TOKEN_LIFETIME).toBe(900)
  })

  it('magic link validity should be 15 minutes (900 seconds)', () => {
    expect(DEFAULT_MAGIC_LINK_VALIDITY).toBe(900)
  })

  it('default session lifetime should be 7 days', () => {
    expect(DEFAULT_SESSION_LIFETIME).toBe(7 * 24 * 60 * 60)
  })
})

describe('resolveOptions', () => {
  it('should apply defaults for empty options', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')

    const resolved = resolveOptions({})
    expect(resolved.serverURL).toBe('http://localhost:3000')
    expect(resolved.enableWebAuthn).toBe(true)
    expect(resolved.enableMagicLink).toBe(true)
    expect(resolved.enableOAuth).toBe(true)
    expect(resolved.enableOnboarding).toBe(true)
    expect(resolved.enableAgentLogin).toBe(false)
    expect(resolved.rpName).toBe('Payload')
    expect(resolved.rpID).toBe('localhost')
    expect(resolved.allowedOrigins).toEqual(['http://localhost:3000'])
    expect(resolved.usersSlug).toBe('users')
    expect(resolved.sessionsSlug).toBe('sessions')
    expect(resolved.contexts).toEqual({})
    expect(resolved.defaultContext).toBeUndefined()
    expect(resolved.magicLink.autoCreateUsers).toBe(true)
    expect(resolved.sessionCleanup.enabled).toBe(true)
    expect(resolved.sessionCleanup.cron).toBe('0 2 * * *')
  })

  it('should use provided serverURL', () => {
    const resolved = resolveOptions({ serverURL: 'https://app.example.com' })
    expect(resolved.serverURL).toBe('https://app.example.com')
    expect(resolved.rpID).toBe('app.example.com')
    expect(resolved.allowedOrigins).toEqual(['https://app.example.com'])
  })

  it('should use NEXT_PUBLIC_SERVER_URL env var when no serverURL provided', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://env.example.com')
    const resolved = resolveOptions({})
    expect(resolved.serverURL).toBe('https://env.example.com')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
  })

  it('should respect explicit feature flags', () => {
    const resolved = resolveOptions({
      enableMagicLink: false,
      enableOAuth: false,
      enableOnboarding: false,
      enableWebAuthn: false,
    })
    expect(resolved.enableWebAuthn).toBe(false)
    expect(resolved.enableMagicLink).toBe(false)
    expect(resolved.enableOAuth).toBe(false)
    expect(resolved.enableOnboarding).toBe(false)
  })

  it('should use provided rpName and rpID', () => {
    const resolved = resolveOptions({
      rpID: 'custom.example.com',
      rpName: 'Custom RP',
      serverURL: 'https://custom.example.com',
    })
    expect(resolved.rpName).toBe('Custom RP')
    expect(resolved.rpID).toBe('custom.example.com')
  })

  it('should use provided allowedOrigins', () => {
    const resolved = resolveOptions({
      allowedOrigins: ['https://a.com', 'https://b.com'],
      serverURL: 'https://a.com',
    })
    expect(resolved.allowedOrigins).toEqual(['https://a.com', 'https://b.com'])
  })

  it('should resolve per-context session lifetimes', () => {
    const resolved = resolveOptions({
      contexts: {
        app: { sessionLifetime: 30 * 24 * 60 * 60 },
        backoffice: { sessionLifetime: 8 * 60 * 60 },
        portal: {},
      },
    })
    expect(resolved.tokens.sessionLifetimes).toEqual({
      app: 30 * 24 * 60 * 60,
      backoffice: 8 * 60 * 60,
      portal: DEFAULT_SESSION_LIFETIME,
    })
  })

  it('should default defaultContext to the first configured context', () => {
    const resolved = resolveOptions({
      contexts: {
        app: {},
        backoffice: {},
      },
    })
    expect(resolved.defaultContext).toBe('app')
  })

  it('should respect an explicit defaultContext', () => {
    const resolved = resolveOptions({
      contexts: {
        app: {},
        backoffice: {},
      },
      defaultContext: 'backoffice',
    })
    expect(resolved.defaultContext).toBe('backoffice')
  })

  it('should respect custom collection slugs', () => {
    const resolved = resolveOptions({
      sessionsCollectionSlug: 'auth-sessions',
      usersCollectionSlug: 'customers',
    })
    expect(resolved.usersSlug).toBe('customers')
    expect(resolved.sessionsSlug).toBe('auth-sessions')
  })

  it('should default adminRoute to /admin and onboardingPath to undefined', () => {
    const resolved = resolveOptions({})
    expect(resolved.adminRoute).toBe('/admin')
    expect(resolved.onboardingPath).toBeUndefined()
  })

  it('should pass through a configured onboarding path', () => {
    const resolved = resolveOptions({ onboarding: { path: '/welcome' } })
    expect(resolved.onboardingPath).toBe('/welcome')

    const fn = ({ context }: { context?: string }) => `/${context}/welcome`
    const resolvedFn = resolveOptions({ onboarding: { path: fn } })
    expect(resolvedFn.onboardingPath).toBe(fn)
  })

  it('should respect a custom default session lifetime', () => {
    const resolved = resolveOptions({
      contexts: { app: {} },
      tokens: { defaultSessionLifetime: 60 },
    })
    expect(resolved.tokens.defaultSessionLifetime).toBe(60)
    expect(resolved.tokens.sessionLifetimes.app).toBe(60)
  })
})
