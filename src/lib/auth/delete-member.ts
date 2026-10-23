import type { Payload } from 'payload'

/**
 * What a member leaves behind outside the tables that cascade from `auth_users`
 * (docs/specs/foundation.md「账号页与删除账号」): the apps they submitted and the Skills they sent
 * in, which hold their contact email. Removed whatever their status; listed apps and Skills
 * themselves stay. Saves, reviews (with their translations and reports) and sign-in records go
 * with the account through their foreign keys.
 */
export async function deleteMemberData(payload: Payload, userId: string): Promise<void> {
  for (const collection of ['app-submissions', 'skill-submissions'] as const) {
    await payload.delete({ collection, where: { submitterId: { equals: userId } }, overrideAccess: true })
  }
}
