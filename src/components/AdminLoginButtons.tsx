'use client'

/**
 * Passkey + OAuth login options for the Payload admin panel.
 *
 * Injected into `admin.components.afterLogin` by the plugin (see the
 * `adminUI` options): a divider, optional OAuth provider buttons, and a
 * "Sign in with Passkey" button.
 *
 * Styled exclusively with Payload admin CSS variables and utility classes.
 */

import { startAuthentication } from '@simplewebauthn/browser'
import React, { useState } from 'react'

export interface AdminLoginButtonsProps {
  /**
   * Application context appended to the OAuth initiate URL (`?context=`).
   * Omitted when not configured.
   */
  context?: string
  /**
   * OAuth providers to render buttons for. Only pass providers that are
   * actually configured — the plugin resolves this automatically when
   * injecting the component.
   */
  oauthProviders?: string[]
  /**
   * Where to redirect after a successful login.
   * @default '/admin'
   */
  redirectPath?: string
  /**
   * Whether to render the passkey login button.
   * @default true
   */
  showPasskey?: boolean
}

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg height={size} viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function PasskeyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m12 12 4-4" />
      <path d="m16 8 4 0" />
      <path d="m20 8 0 4" />
    </svg>
  )
}

export function AdminLoginButtons(props: AdminLoginButtonsProps) {
  const { context, oauthProviders = [], redirectPath = '/admin', showPasskey = true } = props

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const hasAnyOption = showPasskey || oauthProviders.length > 0
  if (!hasAnyOption) {
    return null
  }

  async function handlePasskeyLogin() {
    setIsLoading(true)
    setError(null)

    try {
      const optionsRes = await fetch('/api/auth/webauthn/authenticate-options', {
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!optionsRes.ok) {
        throw new Error('Failed to get passkey options')
      }

      const { challengeToken, options } = await optionsRes.json()
      const credential = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/auth/webauthn/authenticate-verify', {
        body: JSON.stringify({ challengeToken, response: credential }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!verifyRes.ok) {
        throw new Error('Passkey verification failed')
      }

      // Redirect into the admin on success
      window.location.href = redirectPath
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey login cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'Passkey login failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const oauthHref = (provider: string): string => {
    const params = new URLSearchParams({ returnUrl: redirectPath })
    if (context) {
      params.set('context', context)
    }
    return `/api/auth/oauth/${provider}?${params.toString()}`
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Divider */}
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: '1rem',
          marginBottom: '1rem',
          width: '100%',
        }}
      >
        <div style={{ background: 'var(--theme-elevation-150, #E5E7EB)', flex: 1, height: 1 }} />
        <span
          style={{
            color: 'var(--theme-elevation-500, #6B7280)',
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          OR
        </span>
        <div style={{ background: 'var(--theme-elevation-150, #E5E7EB)', flex: 1, height: 1 }} />
      </div>

      {/* OAuth provider buttons */}
      {oauthProviders.map((provider) => (
        <a
          className="btn btn--style-secondary btn--size-large"
          data-testid={`admin-oauth-${provider}`}
          href={oauthHref(provider)}
          key={provider}
          style={{
            alignItems: 'center',
            display: 'inline-flex',
            gap: '0.5rem',
            justifyContent: 'center',
            marginBottom: '0.5rem',
            marginTop: 0,
            textDecoration: 'none',
            width: '100%',
          }}
        >
          {provider === 'google' && <GoogleIcon />}
          Sign in with {providerLabel(provider)}
        </a>
      ))}

      {/* Passkey login */}
      {showPasskey && (
        <>
          {error && (
            <p
              data-testid="admin-passkey-error"
              style={{
                color: 'var(--theme-error-500, #e74c3c)',
                fontSize: '0.875rem',
                marginBottom: '0.5rem',
                textAlign: 'center',
              }}
            >
              {error}
            </p>
          )}
          <button
            className="btn btn--style-secondary btn--size-large"
            data-testid="admin-passkey-login"
            disabled={isLoading}
            onClick={handlePasskeyLogin}
            style={{
              alignItems: 'center',
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'inline-flex',
              gap: '0.5rem',
              justifyContent: 'center',
              marginTop: 0,
              opacity: isLoading ? 0.7 : 1,
              textDecoration: 'none',
              width: '100%',
            }}
            type="button"
          >
            <PasskeyIcon />
            {isLoading ? 'Signing in...' : 'Sign in with Passkey'}
          </button>
        </>
      )}
    </div>
  )
}

export default AdminLoginButtons
