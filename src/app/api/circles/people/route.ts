import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { notLaunched, reply } from '@/modules/circles/api'
import { currentMembers } from '@/modules/circles/people'
import { circlesLaunched, getSuggestionCandidates, shownCircleIds } from '@/modules/circles/public'
import { followedAmong } from '@/modules/profiles/data'
import { rankSuggestions, type SuggestedPerson } from '@/modules/profiles/rules'

// Per reader: the people they follow are left out.
export const dynamic = 'force-dynamic'

/**
 * GET /api/circles/people → { people }: 「值得关注的人」for the reader (docs/specs/circles.md rule
 * 21), at most twelve, never themselves or anyone they follow. Visitors get the same list,
 * without those two. The list is worked out every ten minutes; names and addresses are read
 * as they are now, and members who deleted their account in between are left out.
 */
export async function GET(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  const [session, candidates] = await Promise.all([auth.api.getSession({ headers: request.headers }), shownCircleIds().then(getSuggestionCandidates)])
  if (candidates.length === 0) return reply({ people: [] })
  const userId = session?.user.id ?? null
  const exclude = new Set<string>(userId ? [userId] : [])
  const { payload } = await getDb()
  if (userId) {
    const followed = await followedAmong(
      payload,
      userId,
      candidates.map((candidate) => candidate.userId),
    )
    for (const id of followed) exclude.add(id)
  }
  const ranked = rankSuggestions(candidates, { exclude })
  const current = await currentMembers(
    payload,
    ranked.map((candidate) => candidate.userId),
  )
  const people: SuggestedPerson[] = ranked.flatMap((candidate) => {
    const member = current.get(candidate.userId)
    if (!member) return []
    return [{ name: member.name, tone: candidate.tone, handle: member.handle, circle: candidate.circle, followers: candidate.followers }]
  })
  return reply({ people })
}
