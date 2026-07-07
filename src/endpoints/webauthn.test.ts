import type { PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { resolveOptions } from '../types'
import { createWebAuthnEndpoints } from './webauthn'

beforeAll(() => {
  vi.stubEnv('PAYLOAD_SECRET', 'test-secret-for-payload-auth-unit-tests-min-32-chars')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const mockOptions = resolveOptions({ serverURL: 'http://localhost:3006' })
const webauthnSlug = 'webauthn-credentials'

function makeReq(
  overrides: {
    body?: unknown
    headers?: Record<string, string>
    payload?: Record<string, unknown>
    routeParams?: Record<string, string>
    url?: string
    user?: null | Record<string, unknown>
  } = {},
): PayloadRequest {
  const { body, headers, payload, routeParams, url, user } = overrides
  return {
    headers: new Headers({ host: 'localhost:3006', ...headers }),
    json: async () => body ?? {},
    payload: {
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue({ docs: [] }),
      findByID: vi.fn().mockResolvedValue(null),
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      update: vi.fn().mockResolvedValue({}),
      ...payload,
    },
    routeParams,
    url: url ?? 'http://localhost:3006/api/auth/webauthn/credentials',
    user: user !== undefined ? user : { id: 'user-1', email: 'user@example.com' },
  } as unknown as PayloadRequest
}

function getEndpoint(name: string) {
  return createWebAuthnEndpoints(mockOptions, webauthnSlug).find((e) => e.path === name)!
}

describe('createWebAuthnEndpoints', () => {
  it('should register all 7 expected endpoints', () => {
    const endpoints = createWebAuthnEndpoints(mockOptions, webauthnSlug)
    const paths = endpoints.map((e) => e.path)
    expect(paths).toContain('/auth/webauthn/register-options')
    expect(paths).toContain('/auth/webauthn/register-verify')
    expect(paths).toContain('/auth/webauthn/has-credentials')
    expect(paths).toContain('/auth/webauthn/credentials')
    expect(paths).toContain('/auth/webauthn/credentials/:id')
    expect(paths).toContain('/auth/webauthn/authenticate-options')
    expect(paths).toContain('/auth/webauthn/authenticate-verify')
    expect(endpoints).toHaveLength(7)
  })

  // ── register-options ──────────────────────────────────────────────────────

  describe('POST /auth/webauthn/register-options', () => {
    it('returns 401 when unauthenticated', async () => {
      const { handler } = getEndpoint('/auth/webauthn/register-options')
      const response = await handler(makeReq({ user: null }))
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Authentication required')
    })

    it('returns challengeToken and options for an authenticated user', async () => {
      const { handler } = getEndpoint('/auth/webauthn/register-options')
      const response = await handler(makeReq())
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('challengeToken')
      expect(body).toHaveProperty('options')
    })

    it('excludes existing credentials from the registration options', async () => {
      const mockFind = vi.fn().mockResolvedValue({
        docs: [{ credentialID: 'existing-cred-id', transports: ['internal'] }],
      })
      const { handler } = getEndpoint('/auth/webauthn/register-options')
      const response = await handler(makeReq({ payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } } }))
      expect(response.status).toBe(200)
      const body = await response.json()
      const excluded = body.options?.excludeCredentials ?? []
      expect(excluded.some((c: { id: string }) => c.id === 'existing-cred-id')).toBe(true)
    })
  })

  // ── register-verify ───────────────────────────────────────────────────────

  describe('POST /auth/webauthn/register-verify', () => {
    it('returns 401 when unauthenticated', async () => {
      const { handler } = getEndpoint('/auth/webauthn/register-verify')
      const response = await handler(makeReq({ user: null }))
      expect(response.status).toBe(401)
    })

    it('returns 400 when body cannot be parsed', async () => {
      const { handler } = getEndpoint('/auth/webauthn/register-verify')
      const req = {
        ...makeReq(),
        json: async () => { throw new Error('bad json') },
      } as unknown as PayloadRequest
      const response = await handler(req)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    it('returns 400 when response or challengeToken is missing', async () => {
      const { handler } = getEndpoint('/auth/webauthn/register-verify')
      const response = await handler(makeReq({ body: { challengeToken: 'tok' } }))
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Response and challengeToken are required')
    })

    it('returns 400 when challengeToken is invalid', async () => {
      const { handler } = getEndpoint('/auth/webauthn/register-verify')
      const response = await handler(
        makeReq({
          body: {
            challengeToken: 'not.a.valid.jwt',
            response: { id: 'cred-id', response: { transports: [] } },
          },
        }),
      )
      expect(response.status).toBe(400)
    })
  })

  // ── has-credentials ───────────────────────────────────────────────────────

  describe('POST /auth/webauthn/has-credentials', () => {
    it('returns 401 when unauthenticated', async () => {
      const { handler } = getEndpoint('/auth/webauthn/has-credentials')
      const response = await handler(makeReq({ user: null }))
      expect(response.status).toBe(401)
    })

    it('returns hasPasskey: false when no credentials exist', async () => {
      const { handler } = getEndpoint('/auth/webauthn/has-credentials')
      const response = await handler(makeReq())
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.hasPasskey).toBe(false)
    })

    it('returns hasPasskey: true when credentials exist', async () => {
      const mockFind = vi.fn().mockResolvedValue({ docs: [{ credentialID: 'cred-1' }] })
      const { handler } = getEndpoint('/auth/webauthn/has-credentials')
      const response = await handler(
        makeReq({ payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } } }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.hasPasskey).toBe(true)
    })

    it('returns 500 when the database throws', async () => {
      const mockFind = vi.fn().mockRejectedValue(new Error('db down'))
      const { handler } = getEndpoint('/auth/webauthn/has-credentials')
      const response = await handler(
        makeReq({ payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } } }),
      )
      expect(response.status).toBe(500)
    })
  })

  // ── credentials (list) ────────────────────────────────────────────────────

  describe('GET /auth/webauthn/credentials', () => {
    it('returns 401 when unauthenticated', async () => {
      const { handler } = getEndpoint('/auth/webauthn/credentials')
      const response = await handler(makeReq({ user: null }))
      expect(response.status).toBe(401)
    })

    it('returns the current user\'s credentials', async () => {
      const credential = {
        id: 'cred-doc-1',
        createdAt: '2024-01-01T00:00:00Z',
        credentialID: 'cred-1',
        deviceName: 'My iPhone',
        lastUsedAt: '2024-06-01T00:00:00Z',
        transports: ['internal'],
      }
      const mockFind = vi.fn().mockResolvedValue({ docs: [credential] })
      const { handler } = getEndpoint('/auth/webauthn/credentials')
      const response = await handler(
        makeReq({ payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } } }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.credentials).toHaveLength(1)
      expect(body.credentials[0].deviceName).toBe('My iPhone')
    })

    it('returns 403 when a user tries to list credentials for another user without permission', async () => {
      const { handler } = getEndpoint('/auth/webauthn/credentials')
      const response = await handler(
        makeReq({
          url: 'http://localhost:3006/api/auth/webauthn/credentials?userId=other-user-id',
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      )
      expect(response.status).toBe(403)
    })

    it('allows a privileged user to list credentials for another user', async () => {
      const options = resolveOptions({
        serverURL: 'http://localhost:3006',
        webauthn: {
          canManageUser: () => true,
        },
      })
      const mockFind = vi.fn().mockResolvedValue({ docs: [] })
      const endpoints = createWebAuthnEndpoints(options, webauthnSlug)
      const { handler } = endpoints.find((e) => e.path === '/auth/webauthn/credentials')!
      const response = await handler(
        makeReq({
          payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          url: 'http://localhost:3006/api/auth/webauthn/credentials?userId=other-user-id',
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      )
      expect(response.status).toBe(200)
    })

    it('returns 500 when the database throws', async () => {
      const mockFind = vi.fn().mockRejectedValue(new Error('db down'))
      const { handler } = getEndpoint('/auth/webauthn/credentials')
      const response = await handler(
        makeReq({ payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } } }),
      )
      expect(response.status).toBe(500)
    })
  })

  // ── credentials/:id (delete) ──────────────────────────────────────────────

  describe('DELETE /auth/webauthn/credentials/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const { handler } = getEndpoint('/auth/webauthn/credentials/:id')
      const response = await handler(makeReq({ routeParams: { id: 'cred-doc-1' }, user: null }))
      expect(response.status).toBe(401)
    })

    it('returns 400 when no credential id is provided in route params', async () => {
      const { handler } = getEndpoint('/auth/webauthn/credentials/:id')
      const response = await handler(makeReq())
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Credential ID is required')
    })

    it('returns 404 when the credential does not exist', async () => {
      const mockFindByID = vi.fn().mockResolvedValue(null)
      const { handler } = getEndpoint('/auth/webauthn/credentials/:id')
      const response = await handler(
        makeReq({
          payload: { findByID: mockFindByID, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          routeParams: { id: 'nonexistent-cred' },
        }),
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Credential not found')
    })

    it('returns 403 when the credential belongs to a different user', async () => {
      const mockFindByID = vi.fn().mockResolvedValue({ id: 'cred-doc-1', user: 'other-user-id' })
      const { handler } = getEndpoint('/auth/webauthn/credentials/:id')
      const response = await handler(
        makeReq({
          payload: { findByID: mockFindByID, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          routeParams: { id: 'cred-doc-1' },
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      )
      expect(response.status).toBe(403)
    })

    it('deletes a credential belonging to the authenticated user and returns deleted: true', async () => {
      const mockFindByID = vi.fn().mockResolvedValue({ id: 'cred-doc-1', user: 'user-1' })
      const mockDelete = vi.fn().mockResolvedValue({})
      const { handler } = getEndpoint('/auth/webauthn/credentials/:id')
      const response = await handler(
        makeReq({
          payload: {
            delete: mockDelete,
            findByID: mockFindByID,
            logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
          },
          routeParams: { id: 'cred-doc-1' },
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.deleted).toBe(true)
      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cred-doc-1', collection: webauthnSlug }),
      )
    })

    it('returns 500 when the database throws during delete', async () => {
      const mockFindByID = vi.fn().mockResolvedValue({ id: 'cred-doc-1', user: 'user-1' })
      const mockDelete = vi.fn().mockRejectedValue(new Error('db down'))
      const { handler } = getEndpoint('/auth/webauthn/credentials/:id')
      const response = await handler(
        makeReq({
          payload: {
            delete: mockDelete,
            findByID: mockFindByID,
            logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
          },
          routeParams: { id: 'cred-doc-1' },
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      )
      expect(response.status).toBe(500)
    })
  })

  // ── authenticate-options ──────────────────────────────────────────────────

  describe('POST /auth/webauthn/authenticate-options', () => {
    it('returns challengeToken and options without an email (discoverable credentials)', async () => {
      const { handler } = getEndpoint('/auth/webauthn/authenticate-options')
      const response = await handler(makeReq({ body: {}, user: null }))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('challengeToken')
      expect(body).toHaveProperty('options')
    })

    it('scopes allowCredentials to the user when an email is provided', async () => {
      const mockFind = vi
        .fn()
        .mockResolvedValueOnce({ docs: [{ id: 'user-1', email: 'user@example.com' }] })
        .mockResolvedValueOnce({ docs: [{ credentialID: 'cred-1', transports: ['internal'] }] })
      const { handler } = getEndpoint('/auth/webauthn/authenticate-options')
      const response = await handler(
        makeReq({
          body: { email: 'user@example.com' },
          payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          user: null,
        }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      const allowCreds = body.options?.allowCredentials ?? []
      expect(allowCreds.some((c: { id: string }) => c.id === 'cred-1')).toBe(true)
    })

    it('returns empty allowCredentials when the email is not found', async () => {
      const mockFind = vi.fn().mockResolvedValue({ docs: [] })
      const { handler } = getEndpoint('/auth/webauthn/authenticate-options')
      const response = await handler(
        makeReq({
          body: { email: 'unknown@example.com' },
          payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          user: null,
        }),
      )
      expect(response.status).toBe(200)
    })

    it('returns 500 when the database throws', async () => {
      const mockFind = vi.fn().mockRejectedValue(new Error('db down'))
      const { handler } = getEndpoint('/auth/webauthn/authenticate-options')
      const response = await handler(
        makeReq({
          body: { email: 'user@example.com' },
          payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          user: null,
        }),
      )
      expect(response.status).toBe(500)
    })
  })

  // ── authenticate-verify ───────────────────────────────────────────────────

  describe('POST /auth/webauthn/authenticate-verify', () => {
    it('returns 400 when the request body cannot be parsed', async () => {
      const { handler } = getEndpoint('/auth/webauthn/authenticate-verify')
      const req = {
        ...makeReq({ user: null }),
        json: async () => { throw new Error('bad json') },
      } as unknown as PayloadRequest
      const response = await handler(req)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    it('returns 400 when response or challengeToken is missing', async () => {
      const { handler } = getEndpoint('/auth/webauthn/authenticate-verify')
      const response = await handler(makeReq({ body: { challengeToken: 'tok' }, user: null }))
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Response and challengeToken are required')
    })

    it('returns 401 when the challengeToken is invalid', async () => {
      const { handler } = getEndpoint('/auth/webauthn/authenticate-verify')
      const response = await handler(
        makeReq({
          body: {
            challengeToken: 'not.a.valid.jwt',
            response: { id: 'cred-id' },
          },
          user: null,
        }),
      )
      expect(response.status).toBe(401)
    })

    it('returns 404 when the credential referenced in the response is not found', async () => {
      const { signChallengeToken } = await import('../utilities/tokens')
      const challengeToken = await signChallengeToken('test-challenge', 'user-1')

      const mockFind = vi.fn().mockResolvedValue({ docs: [] })
      const { handler } = getEndpoint('/auth/webauthn/authenticate-verify')
      const response = await handler(
        makeReq({
          body: { challengeToken, response: { id: 'nonexistent-cred' } },
          payload: { find: mockFind, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
          user: null,
        }),
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toBe('Credential not found')
    })
  })
})
