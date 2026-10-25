import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { notLaunched, reply } from '@/modules/circles/api'
import { circlesLaunched, getSuggestionCandidates, shownCircleIds } from '@/modules/circles/public'
import { followedAmong } from '@/modules/profiles/data'
import { rankSuggestions, type SuggestedPerson } from '@/modules/profiles/rules'

// Per reader: the people they follow are left out.
export const dynamic = 'force-dynamic'

/**
 * GET /api/circles/people → { people }: 「值得关注的人」for the reader (docs/specs/circles.md rule
 * 21), at most twelve, never themselves or anyone they follow. Visitors get the same list,
 * without those two.
 */
export async function GET(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  const [session, candidates] = await Promise.all([auth.api.getSession({ headers: request.headers }), shownCircleIds().then(getSuggestionCandidates)])
  const userId = session?.user.id ?? null
  const exclude = new Set<string>(userId ? [userId] : [])
  if (userId && candidates.length > 0) {
    const { payload } = await getDb()
    const followed = await followedAmong(
      payload,
      userId,
      candidates.map((candidate) => candidate.userId),
    )
    for (const id of followed) exclude.add(id)
  }
  const people: SuggestedPerson[] = rankSuggestions(candidates, { exclude }).map((candidate) => ({
    name: candidate.name,
    tone: candidate.tone,
    handle: candidate.handle,
    circle: candidate.circle,
    followers: candidate.followers,
  }))
  return reply({ people })
}
