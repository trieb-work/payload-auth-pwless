import type { Field } from 'payload'

import type { ResolvedAuthPluginOptions } from '../types'

/**
 * Builds the fields injected into the users collection by the plugin.
 * These are added to the existing fields without removing anything.
 *
 * Note: With `disableLocalStrategy: true`, Payload no longer adds the email
 * field automatically. We must define it ourselves so users can still be
 * identified and contacted by email.
 */
export function buildUserFields(options: ResolvedAuthPluginOptions): Field[] {
  const contextNames = Object.keys(options.contexts)

  const fields: Field[] = [
    {
      name: 'email',
      type: 'email',
      hooks: {
        beforeChange: [({ value }) => (value ? (value as string).toLowerCase().trim() : value)],
      },
      index: true,
      label: 'Email',
      required: true,
      unique: true,
    },
  ]

  if (options.enableOnboarding) {
    fields.push(
      {
        name: 'firstName',
        type: 'text',
        admin: {
          description: 'First name of the user',
        },
      },
      {
        name: 'lastName',
        type: 'text',
        admin: {
          description: 'Last name of the user',
        },
      },
      {
        name: 'onboardingComplete',
        type: 'checkbox',
        admin: {
          description: 'Whether the user has completed the onboarding process',
          position: 'sidebar',
        },
        defaultValue: false,
      },
    )
  }

  if (contextNames.length > 0) {
    fields.push({
      name: 'applicationContext',
      type: 'select',
      admin: {
        description: 'The application context this user belongs to',
        position: 'sidebar',
      },
      defaultValue: options.defaultContext,
      options: contextNames.map((ctx) => ({ label: ctx, value: ctx })),
      saveToJWT: true,
    })
  }

  if (options.enableOAuth) {
    fields.push({
      name: 'socialAccounts',
      type: 'array',
      admin: {
        description: 'Linked social login accounts. Managed automatically.',
        readOnly: true,
      },
      fields: [
        {
          name: 'provider',
          type: 'text',
          admin: { readOnly: true },
          index: true,
          required: true,
        },
        {
          name: 'providerId',
          type: 'text',
          admin: { readOnly: true },
          index: true,
          required: true,
        },
        {
          name: 'email',
          type: 'email',
          admin: { readOnly: true },
        },
      ],
    })
  }

  fields.push(
    {
      name: 'lastLoginAt',
      type: 'date',
      admin: {
        description: 'Timestamp of the last successful login',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'lastLoginIp',
      type: 'text',
      admin: {
        description: 'IP address of the last login',
        position: 'sidebar',
        readOnly: true,
      },
    },
  )

  // Passkey management UI in the admin panel (list / add / delete passkeys)
  if (options.enableWebAuthn && options.adminUI.enabled && options.adminUI.passkeyManagementField) {
    fields.push({
      name: 'passkeyManagement',
      type: 'ui',
      admin: {
        components: {
          Field: {
            path: '@trieb.work/payload-auth-pwless/client#PasskeyManagementField',
          },
        },
      },
      label: 'Passkeys',
    })
  }

  return fields
}
