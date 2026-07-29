import type { PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { resolveOptions } from '../types'
import { createOAuthEndpoints } from './oauth'

beforeAll(() => {
  vi.stubEnv('PAYLOAD_SECRET', 'test-secret-for-payload-auth-unit-tests-min-32-chars')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-google-client-id')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-google-client-secret')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const mockOptions = resolveOptions({ serverURL: 'http://localhost:3006' })

function makeReq(
  url: string,
  overrides: { headers?: Record<string, string>; payload?: Record<string, unknown> } = {},
): PayloadRequest {
  return {
    headers: new Headers({ host: 'localhost:3006', ...overrides.headers }),
    payload: {
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      ...overrides.payload,
    },
    routeParams: { provider: 'google' },
    url,
  } as unknown as PayloadRequest
}

describe('createOAuthEndpoints', () => {
  it('should return /auth/oauth/:provider and /auth/oauth/:provider/callback', () => {
    const endpoints = createOAuthEndpoints(mockOptions)
    expect(endpoints.map((e) => e.path)).toEqual([
      '/auth/oauth/:provider',
      '/auth/oauth/:provider/callback',
    ])
    expect(endpoints.every((e) => e.method === 'get')).toBe(true)
  })

  describe('initiate (state signing + returnUrl guard)', () => {
    it('should sign a state param and redirect to the provider authorization URL', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[0].handler

      const req = makeReq('http://localhost:3006/api/auth/oauth/google?returnUrl=/dashboard')
      const response = await handler(req)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth')

      const params = new URL(location!).searchParams
      expect(params.get('state')).toBeTruthy()
      // The state must be an opaque signed JWT, not the raw returnUrl.
      expect(params.get('state')).not.toContain('/dashboard')
    })

    it('should preserve a safe returnUrl (e.g. /dashboard) through the signed state', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[0].handler
      const callbackHandler = endpoints[1].handler

      const req = makeReq('http://localhost:3006/api/auth/oauth/google?returnUrl=/dashboard')
      const initiateResponse = await handler(req)
      const state = new URL(initiateResponse.headers.get('Location')!).searchParams.get('state')!

      // Feed the signed state back through the callback (short-circuiting before
      // the network calls) to confirm the returnUrl round-trips unchanged and
      // ends up in a same-origin redirect (not further validated here beyond
      // reaching token exchange, which fails fast for a fake code).
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 })
      vi.stubGlobal('fetch', fetchMock)

      const callbackReq = makeReq(
        `http://localhost:3006/api/auth/oauth/google/callback?code=fake-code&state=${encodeURIComponent(state)}`,
      )
      const callbackResponse = await callbackHandler(callbackReq)

      // Token exchange fails (mocked), so it falls back to the oauth_failed
      // redirect — but this proves the state was NOT rejected as invalid.
      expect(callbackResponse.status).toBe(302)
      expect(callbackResponse.headers.get('Location')).toContain('error=oauth_failed')
      expect(callbackResponse.headers.get('Location')).not.toContain('error=invalid_state')
    })

    it('should coerce an unsafe protocol-relative returnUrl (//evil.com) to the admin route', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[0].handler

      const req = makeReq('http://localhost:3006/api/auth/oauth/google?returnUrl=//evil.com')
      const response = await handler(req)
      const state = new URL(response.headers.get('Location')!).searchParams.get('state')!

      // Decode the signed JWT payload (base64url, no verification needed for
      // this assertion — we only need to confirm what value was embedded).
      const payloadSegment = state.split('.')[1]
      const decoded = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'))
      expect(decoded.returnUrl).toBe('/admin')
    })

    it('should coerce an unsafe absolute returnUrl (http://evil.com) to the admin route', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[0].handler

      const req = makeReq(
        `http://localhost:3006/api/auth/oauth/google?returnUrl=${encodeURIComponent('http://evil.com')}`,
      )
      const response = await handler(req)
      const state = new URL(response.headers.get('Location')!).searchParams.get('state')!

      const payloadSegment = state.split('.')[1]
      const decoded = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'))
      expect(decoded.returnUrl).toBe('/admin')
    })

    it('should default returnUrl to the admin route when none is provided', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[0].handler

      const req = makeReq('http://localhost:3006/api/auth/oauth/google')
      const response = await handler(req)
      const state = new URL(response.headers.get('Location')!).searchParams.get('state')!

      const payloadSegment = state.split('.')[1]
      const decoded = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'))
      expect(decoded.returnUrl).toBe('/admin')
    })

    it('should return 404 for an unconfigured provider', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[0].handler

      const req = makeReq('http://localhost:3006/api/auth/oauth/facebook')
      req.routeParams = { provider: 'facebook' }
      const response = await handler(req)
      expect(response.status).toBe(404)
    })
  })

  describe('callback (tampered/invalid state)', () => {
    it('should redirect with error=invalid_state for a tampered state param instead of crashing', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[1].handler

      const req = makeReq(
        'http://localhost:3006/api/auth/oauth/google/callback?code=some-code&state=not-a-valid-jwt',
      )
      const response = await handler(req)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_state')
    })

    it('should redirect with error=missing_params when code or state is absent', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[1].handler

      const req = makeReq('http://localhost:3006/api/auth/oauth/google/callback')
      const response = await handler(req)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=missing_params')
    })

    it('should redirect with error=oauth_failed when the provider reports an error', async () => {
      const endpoints = createOAuthEndpoints(mockOptions)
      const handler = endpoints[1].handler

      const req = makeReq(
        'http://localhost:3006/api/auth/oauth/google/callback?error=access_denied',
      )
      const response = await handler(req)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=oauth_failed')
    })
  })
})
