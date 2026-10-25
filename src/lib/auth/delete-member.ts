import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { eq } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { appReviewReports } from '@/modules/apps/schema'
import { circlePostReports } from '@/modules/circles/schema'
import { articleReports } from '@/modules/recommend/schema'

/**
 * What a member leaves behind outside the tables that cascade from `auth_users`
 * (docs/specs/foundation.md「账号页与删除账号」): the apps they submitted and the Skills they sent
 * in, which hold their contact email, and the reports they made, about an app (with an optional
 * way to reach them), someone's review, someone's post in a circle or someone's article; and
 * their articles, with the pictures they uploaded (docs/specs/recommend.md「导出与删除账号」).
 * Removed whatever their status; listed apps and Skills themselves stay. Saves, their own reviews (with translations and
 * the reports on them), their circles, posts (with the reactions and reports on them) and
 * reactions, and sign-in records go with the account through their foreign keys.
 */
export async function deleteMemberData(payload: Payload, userId: string): Promise<void> {
  for (const collection of ['app-submissions', 'skill-submissions'] as const) {
    await payload.delete({ collection, where: { submitterId: { equals: userId } }, overrideAccess: true })
  }
  // Their articles' own pictures and reports go with them (the collection's hooks); then any picture they never used.
  await payload.delete({ collection: 'articles', where: { author: { equals: userId } }, overrideAccess: true })
  await payload.delete({ collection: 'article-images', where: { uploader: { equals: userId } }, overrideAccess: true })
  // Reporters are stored as `u:<member id>` (src/app/api/app-reports/new, src/app/api/reviews/report, src/app/api/circles/report, src/app/api/recommend/report).
  const reporter = `u:${userId}`
  await payload.delete({ collection: 'app-reports', where: { reporter: { equals: reporter } }, overrideAccess: true })
  const { drizzle } = payload.db as unknown as PostgresAdapter
  await drizzle.delete(appReviewReports).where(eq(appReviewReports.reporter, reporter))
  await drizzle.delete(circlePostReports).where(eq(circlePostReports.reporter, reporter))
  await drizzle.delete(articleReports).where(eq(articleReports.reporter, reporter))
}
