'use client'

/**
 * Admin panel UI field for managing WebAuthn passkeys on a user document.
 *
 * Injected into the users collection by the plugin (see `adminUI` options).
 * Users can list, register and delete their own passkeys; privileged users
 * (see the `webauthn.canManageUser` option) can view/delete passkeys of
 * other users, but registration is always restricted to the own profile.
 *
 * Styled exclusively with Payload admin CSS variables and utility classes,
 * so it blends into any admin theme without a bundled stylesheet.
 */

import { Pill, toast, useAuth, useDocumentInfo } from '@payloadcms/ui'
import { startRegistration } from '@simplewebauthn/browser'
import { useCallback, useEffect, useState } from 'react'

interface Passkey {
  createdAt: string
  deviceName: string
  id: string
  lastUsedAt: null | string
  transports: null | string[]
}

function formatDate(dateString: null | string | undefined): string {
  if (!dateString) {
    return '—'
  }
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function transportLabel(t: string): string {
  switch (t) {
    case 'ble':
      return 'Bluetooth'
    case 'hybrid':
      return 'Hybrid'
    case 'internal':
      return 'Internal'
    case 'nfc':
      return 'NFC'
    case 'usb':
      return 'USB'
    default:
      return t
  }
}

export function PasskeyManagementField() {
  const { id: targetUserId } = useDocumentInfo()
  const { user: currentUser } = useAuth()
  const [credentials, setCredentials] = useState<Passkey[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const isOwnProfile = Boolean(targetUserId) && String(targetUserId) === String(currentUser?.id)

  const fetchCredentials = useCallback(async () => {
    if (!targetUserId) {
      setCredentials([])
      return
    }
    setIsLoading(true)
    try {
      const url = new URL('/api/auth/webauthn/credentials', window.location.origin)
      url.searchParams.set('userId', String(targetUserId))
      const res = await fetch(url.toString())
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load passkeys')
      }
      const data = await res.json()
      setCredentials(data.credentials || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load passkeys')
    } finally {
      setIsLoading(false)
    }
  }, [targetUserId])

  useEffect(() => {
    void fetchCredentials()
  }, [fetchCredentials])

  async function handleAddPasskey() {
    if (!isOwnProfile) {
      toast.error('Passkeys can only be added to your own profile')
      return
    }

    if (!deviceName.trim()) {
      toast.error('Please enter a device name')
      return
    }

    setIsRegistering(true)
    try {
      const optionsRes = await fetch('/api/auth/webauthn/register-options', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!optionsRes.ok) {
        throw new Error('Failed to get registration options')
      }

      const { challengeToken, options } = await optionsRes.json()
      const credential = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
        body: JSON.stringify({
          challengeToken,
          deviceName: deviceName.trim(),
          response: credential,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!verifyRes.ok) {
        const data = await verifyRes.json()
        throw new Error(data.error || 'Registration failed')
      }

      toast.success('Passkey added successfully')
      setDeviceName('')
      setShowAddForm(false)
      await fetchCredentials()
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        toast.error('Passkey registration was cancelled')
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to add passkey')
      }
    } finally {
      setIsRegistering(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete the passkey "${name}"?`)) {
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/auth/webauthn/credentials/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete passkey')
      }

      toast.success('Passkey deleted')
      await fetchCredentials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete passkey')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="payload-auth-passkey-management">
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <h3
          style={{
            color: 'var(--theme-text)',
            fontSize: '1rem',
            fontWeight: 600,
            margin: 0,
          }}
        >
          Passkeys
        </h3>
        {!showAddForm && isOwnProfile && (
          <button
            className="btn btn--style-primary btn--size-small"
            disabled={isLoading || isRegistering}
            onClick={() => setShowAddForm(true)}
            type="button"
          >
            Add Passkey
          </button>
        )}
      </div>

      {showAddForm && isOwnProfile && (
        <div
          style={{
            background: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '4px',
            marginBottom: '1rem',
            padding: '1rem',
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="passkey-device-name"
              style={{
                color: 'var(--theme-text)',
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              Device Name
            </label>
            <input
              disabled={isRegistering}
              id="passkey-device-name"
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. MacBook Pro, iPhone 15"
              style={{
                background: 'var(--theme-input-bg)',
                border: '1px solid var(--theme-elevation-150)',
                borderRadius: '4px',
                color: 'var(--theme-text)',
                fontSize: '0.875rem',
                padding: '0.5rem 0.75rem',
                width: '100%',
              }}
              type="text"
              value={deviceName}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn--style-primary btn--size-small"
              disabled={isRegistering}
              onClick={handleAddPasskey}
              type="button"
            >
              {isRegistering ? 'Registering…' : 'Register Passkey'}
            </button>
            <button
              className="btn btn--style-secondary btn--size-small"
              disabled={isRegistering}
              onClick={() => {
                setShowAddForm(false)
                setDeviceName('')
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && credentials.length === 0 ?
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.875rem' }}>
          Loading passkeys…
        </p>
      : credentials.length === 0 ?
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.875rem' }}>
          No passkeys registered yet. Add one to sign in without a password.
        </p>
      : <div
          style={{
            border: '1px solid var(--theme-elevation-100)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {credentials.map((cred, index) => (
            <div
              key={cred.id}
              style={{
                alignItems: 'center',
                background:
                  index % 2 === 0 ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-50)',
                borderBottom:
                  index < credentials.length - 1 ? '1px solid var(--theme-elevation-100)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: 'var(--theme-text)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  {cred.deviceName || 'Unnamed Device'}
                </div>
                <div
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  {cred.transports?.map((t) => (
                    <Pill key={t} pillStyle="light">
                      {transportLabel(t)}
                    </Pill>
                  ))}
                  <span
                    style={{
                      color: 'var(--theme-elevation-600)',
                      fontSize: '0.75rem',
                    }}
                  >
                    Added {formatDate(cred.createdAt)}
                    {cred.lastUsedAt ? ` · Last used ${formatDate(cred.lastUsedAt)}` : ''}
                  </span>
                </div>
              </div>
              <button
                className="btn btn--style-danger btn--size-small"
                disabled={isLoading}
                onClick={() => handleDelete(cred.id, cred.deviceName || 'Unnamed Device')}
                style={{ marginLeft: '0.75rem', whiteSpace: 'nowrap' }}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      }
    </div>
  )
}

export default PasskeyManagementField
