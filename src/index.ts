/**
 * @trieb.work/payload-auth-pwless — Passwordless authentication for Payload CMS.
 *
 * WebAuthn/passkeys · magic link email login · OAuth (Google, Facebook) ·
 * refresh-token sessions in HttpOnly cookies.
 *
 * @example
 * ```ts
 * import { authPlugin } from '@trieb.work/payload-auth-pwless'
 *
 * export default buildConfig({
 *   plugins: [
 *     authPlugin({
 *       serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
 *       rpName: 'My App',
 *     }),
 *   ],
 * })
 * ```
 */
export { buildSessionsCollection } from './collections/Sessions'
export { buildWebAuthnCredentialsCollection } from './collections/WebAuthnCredentials'
export { authPlugin } from './plugin'
export {
  AUTH_STRATEGY_NAME,
  DEFAULT_ACCESS_TOKEN_LIFETIME,
  DEFAULT_MAGIC_LINK_VALIDITY,
  DEFAULT_SESSION_LIFETIME,
  DEFAULT_SESSIONS_COLLECTION_SLUG,
  DEFAULT_USERS_COLLECTION_SLUG,
  DEFAULT_WEBAUTHN_COLLECTION_SLUG,
  resolveOptions,
} from './types'
export type {
  AgentLoginConfig,
  ApplicationContextConfig,
  MagicLinkAllowUserArgs,
  MagicLinkConfig,
  MagicLinkEmailArgs,
  MagicLinkEmailConfig,
  OAuthConfig,
  OAuthProviderCredentials,
  PayloadAuthPluginConfig,
  ResolvedAuthPluginOptions,
  ResolvedTokenConfig,
  SessionCleanupConfig,
  SocialAccount,
  TokenConfig,
  WebAuthnConfig,
} from './types'
export { buildDefaultMagicLinkEmail } from './utilities/emailTemplates'
export {
  buildAuthCookieHeader,
  buildClearCookieHeader,
  cleanupExpiredSessions,
  createSession,
  invalidateAllUserSessions,
  invalidateSession,
} from './utilities/session'
export {
  generateDeviceFingerprint,
  generateSecureToken,
  signAccessToken,
  signMagicLinkToken,
  verifyAccessToken,
  verifyMagicLinkToken,
} from './utilities/tokens'
