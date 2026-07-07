import { createHash, randomBytes, randomUUID } from 'crypto'
import { type JWTPayload, jwtVerify, SignJWT } from 'jose'

import { DEFAULT_ACCESS_TOKEN_LIFETIME, DEFAULT_MAGIC_LINK_VALIDITY } from '../types'

/**
 * Encodes the PAYLOAD_SECRET as a Uint8Array for use with jose.
 * Must match the secret Payload uses for HS256 JWT signing.
 */
function getSecret(): Uint8Array {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    throw new Error('PAYLOAD_SECRET environment variable is required')
  }
  return new TextEncoder().encode(secret)
}

/**
 * Claims embedded in access tokens issued by this plugin.
 * Compatible with Payload's native JWT format (id, collection, email).
 */
export interface AuthTokenClaims extends JWTPayload {
  applicationContext?: string
  collection: string
  email: string
  id: string
}

/**
 * Signs a new access token in Payload-compatible JWT format (HS256).
 * Used by the refresh/revalidate flow and custom login routes.
 */
export async function signAccessToken(
  claims: {
    applicationContext?: string
    collection?: string
    email: string
    id: string
  },
  lifetimeSeconds: number = DEFAULT_ACCESS_TOKEN_LIFETIME,
): Promise<string> {
  return new SignJWT({
    id: claims.id,
    applicationContext: claims.applicationContext,
    collection: claims.collection ?? 'users',
    email: claims.email,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .sign(getSecret())
}

/**
 * Verifies a Payload-compatible JWT and returns its claims.
 * Throws if the token is invalid, expired, or malformed.
 */
export async function verifyAccessToken(token: string): Promise<AuthTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as AuthTokenClaims
}

/**
 * Signs a short-lived JWT for magic link tokens.
 */
export async function signMagicLinkToken(
  claims: {
    applicationContext?: string
    email: string
  },
  validitySeconds: number = DEFAULT_MAGIC_LINK_VALIDITY,
): Promise<string> {
  return new SignJWT({
    applicationContext: claims.applicationContext,
    email: claims.email,
    purpose: 'magic-link',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${validitySeconds}s`)
    .sign(getSecret())
}

/**
 * Verifies a magic link token and returns its claims.
 */
export async function verifyMagicLinkToken(
  token: string,
): Promise<{ applicationContext?: string; email: string; jti: string }> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.purpose !== 'magic-link') {
    throw new Error('Invalid token purpose')
  }
  if (!payload.jti) {
    throw new Error('Magic link token missing jti')
  }
  return {
    applicationContext: payload.applicationContext as string | undefined,
    email: payload.email as string,
    jti: payload.jti,
  }
}

/**
 * Signs a short-lived JWT for WebAuthn challenge storage (5 minutes).
 * This avoids server-side session state for challenge verification.
 */
export async function signChallengeToken(challenge: string, userId?: string): Promise<string> {
  return new SignJWT({
    challenge,
    purpose: 'webauthn-challenge',
    userId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getSecret())
}

/**
 * Verifies a WebAuthn challenge token and returns the challenge string.
 */
export async function verifyChallengeToken(
  token: string,
): Promise<{ challenge: string; userId?: string }> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.purpose !== 'webauthn-challenge') {
    throw new Error('Invalid token purpose')
  }
  return {
    challenge: payload.challenge as string,
    userId: payload.userId as string | undefined,
  }
}

/**
 * Claims carried through the OAuth `state` round-trip.
 */
export interface OAuthStateClaims {
  appContext?: string
  provider: string
  returnUrl: string
}

/**
 * Signs the OAuth `state` param as a short-lived JWT so it can't be
 * tampered with in transit (e.g. to redirect to an attacker-controlled URL).
 */
export async function signOAuthState(claims: OAuthStateClaims): Promise<string> {
  return new SignJWT({
    appContext: claims.appContext,
    provider: claims.provider,
    purpose: 'oauth-state',
    returnUrl: claims.returnUrl,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getSecret())
}

/**
 * Verifies an OAuth `state` JWT and returns its claims.
 */
export async function verifyOAuthState(token: string): Promise<OAuthStateClaims> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.purpose !== 'oauth-state') {
    throw new Error('Invalid token purpose')
  }
  return {
    appContext: payload.appContext as string | undefined,
    provider: payload.provider as string,
    returnUrl: payload.returnUrl as string,
  }
}

/**
 * Generates a cryptographically secure random token (hex-encoded).
 * Used for refresh tokens.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Generates a device fingerprint from the User-Agent only.
 *
 * NOTE: The client IP is deliberately NOT part of the fingerprint. IP
 * addresses change for many legitimate reasons (dual-stack IPv4/IPv6,
 * mobile ↔ Wi-Fi switching, CGNAT, VPNs, rotating load-balancer egress IPs),
 * which would cause false "device mismatch" logouts for the same browser.
 * The high-entropy refresh token remains the actual security boundary; the
 * User-Agent fingerprint is only a weak secondary signal that detects the
 * refresh token being replayed from a clearly different client.
 */
export function generateDeviceFingerprint(userAgent: string): string {
  return createHash('sha256').update(userAgent).digest('hex')
}
