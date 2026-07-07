import type { Config } from 'payload'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { authPlugin } from './plugin'
import { AUTH_STRATEGY_NAME } from './types'

vi.stubEnv('PAYLOAD_SECRET', 'test-secret-for-payload-auth-unit-tests-min-32-chars')

afterAll(() => {
  vi.unstubAllEnvs()
})

function createMockConfig(): Config {
  return {
    collections: [
      {
        slug: 'users',
        auth: true,
        fields: [{ name: 'name', type: 'text' }],
      },
      {
        slug: 'pages',
        fields: [{ name: 'title', type: 'text' }],
      },
    ],
  } as unknown as Config
}

async function applyPlugin(opts?: Parameters<typeof authPlugin>[0]): Promise<Config> {
  const plugin = authPlugin(opts)
  return await plugin(createMockConfig())
}

describe('authPlugin', () => {
  it('should return a function (Plugin type)', () => {
    const plugin = authPlugin()
    expect(typeof plugin).toBe('function')
  })

  it('should add WebAuthnCredentials and Sessions collections', async () => {
    const result = await applyPlugin()
    const slugs = (result.collections || []).map((c) => c.slug)
    expect(slugs).toContain('webauthn-credentials')
    expect(slugs).toContain('sessions')
  })

  it('should preserve existing collections', async () => {
    const result = await applyPlugin()
    const slugs = (result.collections || []).map((c) => c.slug)
    expect(slugs).toContain('users')
    expect(slugs).toContain('pages')
  })

  it('should add email field to Users', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('email')
  })

  it('should add socialAccounts field to Users when OAuth is enabled', async () => {
    const result = await applyPlugin({ enableOAuth: true })
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('socialAccounts')
  })

  it('should not add socialAccounts field to Users when OAuth is disabled', async () => {
    const result = await applyPlugin({ enableOAuth: false })
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).not.toContain('socialAccounts')
  })

  it('should add lastLoginAt and lastLoginIp fields to Users', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('lastLoginAt')
    expect(fieldNames).toContain('lastLoginIp')
  })

  it('should add applicationContext field to Users when contexts are configured', async () => {
    const result = await applyPlugin({
      contexts: { 'app-context-a': {}, 'app-context-b': {} },
    })
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('applicationContext')
  })

  it('should not add applicationContext field to Users when no contexts are configured', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).not.toContain('applicationContext')
  })

  it('should configure auth on Users with correct values', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const auth = users?.auth as Record<string, unknown>
    expect(auth).toBeDefined()
    expect(auth.disableLocalStrategy).toBe(true)
    expect(auth.useSessions).toBe(false)
    expect(auth.maxLoginAttempts).toBe(5)
    expect(auth.lockTime).toBe(600_000)
    expect(auth.tokenExpiration).toBe(900)
    expect(auth.strategies).toBeDefined()
    expect(Array.isArray(auth.strategies)).toBe(true)
    const strategies = auth.strategies as Array<{ name: string }>
    expect(strategies.some((s) => s.name === AUTH_STRATEGY_NAME)).toBe(true)
  })

  it('should add afterLogin hook to Users', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const hooks = users?.hooks
    expect(hooks?.afterLogin).toBeDefined()
    expect(hooks?.afterLogin?.length).toBeGreaterThan(0)
  })

  it('should register API endpoints when all features enabled', async () => {
    const result = await applyPlugin({
      enableMagicLink: true,
      enableOAuth: true,
      enableWebAuthn: true,
    })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).toContain('/auth/magic-link/request')
    expect(paths).toContain('/auth/magic-link/verify')
    expect(paths).toContain('/auth/webauthn/register-options')
    expect(paths).toContain('/auth/webauthn/register-verify')
    expect(paths).toContain('/auth/webauthn/authenticate-options')
    expect(paths).toContain('/auth/webauthn/authenticate-verify')
    expect(paths).toContain('/auth/oauth/:provider')
    expect(paths).toContain('/auth/oauth/:provider/callback')
    expect(paths).toContain('/auth/refresh')
    expect(paths).toContain('/auth/logout')
    expect(paths).toContain('/auth/logout-all')
  })

  it('should not register magic link endpoints when disabled', async () => {
    const result = await applyPlugin({ enableMagicLink: false })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).not.toContain('/auth/magic-link/request')
    expect(paths).not.toContain('/auth/magic-link/verify')
  })

  it('should not register WebAuthn endpoints when disabled', async () => {
    const result = await applyPlugin({ enableWebAuthn: false })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).not.toContain('/auth/webauthn/register-options')
    expect(paths).not.toContain('/auth/webauthn/register-verify')
    expect(paths).not.toContain('/auth/webauthn/authenticate-options')
    expect(paths).not.toContain('/auth/webauthn/authenticate-verify')
  })

  it('should not register OAuth endpoints when disabled', async () => {
    const result = await applyPlugin({ enableOAuth: false })
    const paths = (result.endpoints || []).map((e) => e.path)
    const oauthPaths = paths.filter((p) => p?.includes('/auth/oauth'))
    expect(oauthPaths).toHaveLength(0)
  })

  it('should always register refresh and logout endpoints', async () => {
    const result = await applyPlugin({
      enableMagicLink: false,
      enableOAuth: false,
      enableWebAuthn: false,
    })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).toContain('/auth/refresh')
    expect(paths).toContain('/auth/logout')
    expect(paths).toContain('/auth/logout-all')
  })

  it('should register agent-login endpoint when enableAgentLogin is true', async () => {
    const result = await applyPlugin({ enableAgentLogin: true })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).toContain('/auth/agent-login')
  })

  it('should NOT register agent-login endpoint when enableAgentLogin is false', async () => {
    const result = await applyPlugin({ enableAgentLogin: false })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).not.toContain('/auth/agent-login')
  })

  it('should add firstName, lastName, and onboardingComplete fields to Users', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('firstName')
    expect(fieldNames).toContain('lastName')
    expect(fieldNames).toContain('onboardingComplete')
  })

  it('should register onboarding endpoint', async () => {
    const result = await applyPlugin()
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).toContain('/auth/onboarding')
  })

  it('should not register onboarding endpoint or fields when disabled', async () => {
    const result = await applyPlugin({ enableOnboarding: false })
    const paths = (result.endpoints || []).map((e) => e.path)
    expect(paths).not.toContain('/auth/onboarding')

    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).not.toContain('firstName')
    expect(fieldNames).not.toContain('lastName')
    expect(fieldNames).not.toContain('onboardingComplete')
  })

  it('should register a scheduled session-cleanup job by default', async () => {
    const result = await applyPlugin()
    const taskSlugs = (result.jobs?.tasks || []).map((t) => t.slug)
    expect(taskSlugs).toContain('cleanup-expired-sessions')
  })

  it('should not register the session-cleanup job when disabled', async () => {
    const result = await applyPlugin({ sessionCleanup: { enabled: false } })
    const taskSlugs = (result.jobs?.tasks || []).map((t) => t.slug)
    expect(taskSlugs).not.toContain('cleanup-expired-sessions')
  })
})

describe('authPlugin admin UI injection', () => {
  function componentPaths(entries: undefined | unknown[]): string[] {
    return (entries || []).map((e) =>
      typeof e === 'string' ? e : ((e as { path?: string }).path ?? ''),
    )
  }

  it('should inject the passkey management field into users by default', async () => {
    const result = await applyPlugin()
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('passkeyManagement')
  })

  it('should NOT inject the passkey field when adminUI is disabled', async () => {
    const result = await applyPlugin({ adminUI: { enabled: false } })
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).not.toContain('passkeyManagement')
  })

  it('should NOT inject the passkey field when WebAuthn is disabled', async () => {
    const result = await applyPlugin({ enableWebAuthn: false })
    const users = (result.collections || []).find((c) => c.slug === 'users')
    const fieldNames = (users?.fields || [])
      .filter((f) => 'name' in f)
      .map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).not.toContain('passkeyManagement')
  })

  it('should inject the magic link login form into beforeLogin', async () => {
    const result = await applyPlugin()
    const paths = componentPaths(result.admin?.components?.beforeLogin)
    expect(paths).toContain('@trieb.work/payload-auth-pwless/client#AdminMagicLinkLogin')
  })

  it('should inject the passkey/OAuth buttons into afterLogin', async () => {
    const result = await applyPlugin()
    const paths = componentPaths(result.admin?.components?.afterLogin)
    expect(paths).toContain('@trieb.work/payload-auth-pwless/client#AdminLoginButtons')
  })

  it('should pass context and redirectPath as clientProps', async () => {
    const result = await applyPlugin({
      adminUI: { redirectPath: '/backoffice' },
      contexts: { intern: {}, portal: {} },
      defaultContext: 'intern',
    })
    const entry = (result.admin?.components?.beforeLogin || []).find(
      (e) =>
        typeof e === 'object' &&
        (e as { path?: string }).path ===
          '@trieb.work/payload-auth-pwless/client#AdminMagicLinkLogin',
    ) as { clientProps?: Record<string, unknown> }
    expect(entry?.clientProps?.context).toBe('intern')
    expect(entry?.clientProps?.redirectPath).toBe('/backoffice')
  })

  it('should NOT inject login components when adminUI is disabled', async () => {
    const result = await applyPlugin({ adminUI: { enabled: false } })
    const before = componentPaths(result.admin?.components?.beforeLogin)
    const after = componentPaths(result.admin?.components?.afterLogin)
    expect(before).not.toContain('@trieb.work/payload-auth-pwless/client#AdminMagicLinkLogin')
    expect(after).not.toContain('@trieb.work/payload-auth-pwless/client#AdminLoginButtons')
  })

  it('should not inject the magic link form when magic link is disabled', async () => {
    const result = await applyPlugin({ enableMagicLink: false })
    const before = componentPaths(result.admin?.components?.beforeLogin)
    expect(before).not.toContain('@trieb.work/payload-auth-pwless/client#AdminMagicLinkLogin')
  })

  it('should not inject afterLogin buttons when WebAuthn is off and no OAuth providers configured', async () => {
    const result = await applyPlugin({
      adminUI: { oauthProviders: [] },
      enableWebAuthn: false,
    })
    const after = componentPaths(result.admin?.components?.afterLogin)
    expect(after).not.toContain('@trieb.work/payload-auth-pwless/client#AdminLoginButtons')
  })

  it('should preserve existing beforeLogin/afterLogin entries', async () => {
    const plugin = authPlugin()
    const config = createMockConfig()
    config.admin = {
      components: {
        afterLogin: ['/app/components/Existing#After'],
        beforeLogin: ['/app/components/Existing#Before'],
      },
    }
    const result = await plugin(config)
    const before = componentPaths(result.admin?.components?.beforeLogin)
    const after = componentPaths(result.admin?.components?.afterLogin)
    expect(before).toContain('/app/components/Existing#Before')
    expect(after).toContain('/app/components/Existing#After')
    expect(before).toContain('@trieb.work/payload-auth-pwless/client#AdminMagicLinkLogin')
    expect(after).toContain('@trieb.work/payload-auth-pwless/client#AdminLoginButtons')
  })
})
