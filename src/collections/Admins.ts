import type { CollectionConfig } from 'payload'

/**
 * Back-office accounts for the Payload admin at /admin — the site owner only.
 * Site members sign in with Better Auth instead (src/lib/auth).
 * The first admin is created on the first visit to /admin.
 */
export const Admins: CollectionConfig = {
  slug: 'admins',
  labels: {
    singular: { en: 'Admin', zh: '管理员' },
    plural: { en: 'Admins', zh: '管理员' },
  },
  admin: {
    useAsTitle: 'email',
    group: { en: 'Settings', zh: '设置' },
  },
  auth: {
    tokenExpiration: 60 * 60 * 8, // 8 hours
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000, // 15 minutes
  },
  access: {
    // Only a signed-in admin can see or add admins. (The very first admin is created through /admin.)
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: { en: 'Name', zh: '名字' },
    },
  ],
}
