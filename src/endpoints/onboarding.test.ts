import type { PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { resolveOptions } from '../types'
import { createOnboardingEndpoints } from './onboarding'

beforeAll(() => {
  vi.stubEnv('PAYLOAD_SECRET', 'test-secret-for-payload-auth-unit-tests-min-32-chars')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const mockOptions = resolveOptions({ serverURL: 'http://localhost:3006' })

function makeReq(
  body: unknown,
  overrides: { payload?: Record<string, unknown>; user?: null | Record<string, unknown> } = {},
): PayloadRequest {
  return {
    json: async () => body,
    payload: {
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      update: vi.fn().mockResolvedValue({}),
      ...overrides.payload,
    },
    user: overrides.user !== undefined ? overrides.user : { id: 'user-1', email: 'user@example.com' },
  } as unknown as PayloadRequest
}

describe('createOnboardingEndpoints', () => {
  it('should return a single POST /auth/onboarding endpoint', () => {
    const endpoints = createOnboardingEndpoints(mockOptions)
    expect(endpoints).toHaveLength(1)
    expect(endpoints[0].path).toBe('/auth/onboarding')
    expect(endpoints[0].method).toBe('post')
  })

  describe('/auth/onboarding', () => {
    it('should return 401 when the request is unauthenticated', async () => {
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq({ firstName: 'Jane', lastName: 'Doe' }, { user: null })

      const response = await handler(req)
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Authentication required')
    })

    it('should return 400 when the request body is not valid JSON', async () => {
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = {
        json: async () => { throw new Error('bad json') },
        payload: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
        user: { id: 'user-1' },
      } as unknown as PayloadRequest

      const response = await handler(req)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    it('should return 400 when firstName is missing', async () => {
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq({ lastName: 'Doe' })

      const response = await handler(req)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toMatch(/firstName/i)
    })

    it('should return 400 when lastName is missing', async () => {
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq({ firstName: 'Jane' })

      const response = await handler(req)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toMatch(/lastName/i)
    })

    it('should return 400 when firstName contains invalid characters', async () => {
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq({ firstName: 'Jane<script>', lastName: 'Doe' })

      const response = await handler(req)
      expect(response.status).toBe(400)
    })

    it('should return 400 when a name field exceeds 100 characters', async () => {
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq({ firstName: 'A'.repeat(101), lastName: 'Doe' })

      const response = await handler(req)
      expect(response.status).toBe(400)
    })

    it('should update the user and return success on valid input', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({})
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq(
        { firstName: 'Jane', lastName: 'Doe' },
        { payload: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, update: mockUpdate } },
      )

      const response = await handler(req)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          collection: 'users',
          data: expect.objectContaining({
            firstName: 'Jane',
            lastName: 'Doe',
            onboardingComplete: true,
          }),
        }),
      )
    })

    it('should accept names with accented characters, hyphens, and apostrophes', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({})
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq(
        { firstName: "O'Brien", lastName: 'Müller-Schmidt' },
        { payload: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, update: mockUpdate } },
      )

      const response = await handler(req)
      expect(response.status).toBe(200)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: "O'Brien",
            lastName: 'Müller-Schmidt',
          }),
        }),
      )
    })

    it('should return 500 when the database update throws', async () => {
      const mockUpdate = vi.fn().mockRejectedValue(new Error('db down'))
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq(
        { firstName: 'Jane', lastName: 'Doe' },
        { payload: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, update: mockUpdate } },
      )

      const response = await handler(req)
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toBe('Failed to update profile')
    })

    it('should use the authenticated user id from the request, not the body', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({})
      const [{ handler }] = createOnboardingEndpoints(mockOptions)
      const req = makeReq(
        { firstName: 'Jane', lastName: 'Doe' },
        {
          payload: { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }, update: mockUpdate },
          user: { id: 'specific-user-id', email: 'jane@example.com' },
        },
      )

      await handler(req)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'specific-user-id' }),
      )
    })
  })
})
