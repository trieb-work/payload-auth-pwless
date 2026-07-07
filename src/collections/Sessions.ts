import type { CollectionConfig } from 'payload'

import { asCollectionSlug } from '../utilities/collectionSlug'

/**
 * Custom session store for refresh tokens. Payload's native JWT auth is
 * stateless and limited to short-lived access tokens. This collection
 * enables long-lived sessions via refresh tokens stored in HttpOnly cookies.
 */
export function buildSessionsCollection(args: {
  sessionsSlug: string
  usersSlug: string
}): CollectionConfig {
  const { sessionsSlug, usersSlug } = args

  return {
    slug: sessionsSlug,
    access: {
      create: () => false, // Only created programmatically
      delete: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        return { user: { equals: user.id } }
      },
      read: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        return { user: { equals: user.id } }
      },
      update: () => false, // Only updated programmatically
    },
    admin: {
      description: 'Refresh token sessions for long-lived authentication',
      hidden: true,
    },
    fields: [
      {
        name: 'user',
        type: 'relationship',
        index: true,
        relationTo: asCollectionSlug(usersSlug),
        required: true,
      },
      {
        name: 'refreshToken',
        type: 'text',
        admin: { readOnly: true },
        index: true,
        required: true,
        unique: true,
      },
      {
        name: 'expiresAt',
        type: 'date',
        admin: { readOnly: true },
        index: true,
        required: true,
      },
      {
        name: 'magicLinkTokenId',
        type: 'text',
        admin: { readOnly: true },
        index: true,
        unique: true,
      },
      {
        name: 'deviceFingerprint',
        type: 'text',
        admin: { readOnly: true },
      },
      {
        name: 'userAgent',
        type: 'textarea',
        admin: { readOnly: true },
      },
      {
        name: 'lastUsedAt',
        type: 'date',
        admin: { readOnly: true },
      },
    ],
    timestamps: true,
  }
}
