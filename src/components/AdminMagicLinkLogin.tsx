'use client'

/**
 * Magic link login form for the Payload admin panel.
 *
 * Injected into `admin.components.beforeLogin` by the plugin (see the
 * `adminUI` options). Handles both requesting a magic link and verifying a
 * `?token=` from the magic link URL, then redirects into the admin.
 *
 * Styled exclusively with Payload admin CSS variables and utility classes.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useState } from 'react'

export interface AdminMagicLinkLoginProps {
  /**
   * Application context sent with the magic link request
   * (`applicationContext` body field). Omitted when not configured.
   */
  context?: string
  /**
   * Placeholder for the email input.
   * @default 'name@example.com'
   */
  emailPlaceholder?: string
  /**
   * Where to redirect after successful verification.
   * @default '/admin'
   */
  redirectPath?: string
}

export function AdminMagicLinkLogin(props: AdminMagicLinkLoginProps) {
  const { context, emailPlaceholder = 'name@example.com', redirectPath = '/admin' } = props

  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  // Handle magic link token verification from URL
  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      return
    }

    const controller = new AbortController()
    setIsVerifying(true)

    fetch('/api/auth/magic-link/verify', {
      body: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string }
          throw new Error(body.error || 'Verification failed')
        }
        // Success — cookie is set by the response, redirect into the admin
        router.push(redirectPath)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
        setIsVerifying(false)
      })

    return () => controller.abort()
  }, [searchParams, router, redirectPath])

  if (isVerifying) {
    return (
      <div data-testid="admin-login-verifying" style={{ padding: '2rem 0', textAlign: 'center' }}>
        <div
          style={{
            animation: 'payload-auth-spin 0.8s linear infinite',
            border: '2px solid var(--theme-elevation-150, #e2e2e2)',
            borderRadius: '50%',
            borderTopColor: 'var(--theme-elevation-800, #333)',
            height: '1.5rem',
            margin: '0 auto 1rem',
            width: '1.5rem',
          }}
        />
        <p>Verifying your login...</p>
        <style>{`@keyframes payload-auth-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      return
    }

    setIsSending(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/magic-link/request', {
        body: JSON.stringify({
          email,
          ...(context ? { applicationContext: context } : {}),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error || 'Request failed')
      }

      setIsSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSending(false)
    }
  }

  if (isSent) {
    return (
      <div data-testid="admin-magic-link-sent" style={{ textAlign: 'center' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Login link sent</p>
        <p style={{ color: 'var(--theme-elevation-500, #6B7280)', fontSize: '0.875rem' }}>
          A login link has been sent to <strong>{email}</strong>. Please check your inbox.
        </p>
        <button
          className="btn btn--style-secondary btn--size-medium"
          data-testid="admin-back-to-email"
          onClick={() => {
            setIsSent(false)
            setEmail('')
          }}
          style={{ cursor: 'pointer', marginTop: '1rem' }}
          type="button"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div data-testid="admin-login-form">
      <p style={{ fontWeight: 500, marginBottom: '1rem' }}>
        Sign in with your email. You will receive a login link by email.
      </p>
      {error && (
        <p
          data-testid="admin-login-error"
          style={{
            color: 'var(--theme-error-500, #e74c3c)',
            fontSize: '0.875rem',
            marginBottom: '0.5rem',
          }}
        >
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label
            className="field-label"
            htmlFor="admin-email"
            style={{ display: 'block', marginBottom: '0.25rem' }}
          >
            Email
          </label>
          <input
            className="field-type email"
            data-testid="admin-login-email"
            id="admin-email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder={emailPlaceholder}
            required
            style={{
              border: '1px solid var(--theme-elevation-150, #e2e2e2)',
              borderRadius: '0.25rem',
              fontSize: '1rem',
              padding: '0.5rem 0.75rem',
              width: '100%',
            }}
            type="email"
            value={email}
          />
        </div>
        <button
          className="btn btn--style-primary btn--size-large"
          data-testid="admin-login-submit"
          disabled={isSending || !email}
          style={{ cursor: 'pointer', width: '100%' }}
          type="submit"
        >
          {isSending ? 'Sending...' : 'Send login link'}
        </button>
      </form>
    </div>
  )
}

export default AdminMagicLinkLogin
