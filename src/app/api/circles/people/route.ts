import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { notLaunched, reply } from '@/modules/circles/api'
import { currentMembers } from '@/modules/circles/people'
import { circlesLaunched, getSuggestionCandidates, shownCircleIds } from '@/modules/circles/public'
import { blockedAmong } from '@/modules/profiles/blocks'
import { followedAmong } from '@/modules/profiles/data'
import { rankSuggestions, type SuggestedPerson } from '@/modules/profiles/rules'

// Per reader: the people they follow or blocked, or who blocked them, are left out.
export const dynamic = 'force-dynamic'

/**
 * GET /api/circles/people → { people }: 「值得关注的人」for the reader (docs/specs/circles.md rule
 * 21), at most twelve, never themselves, anyone they follow, nor anyone they blocked or who
 * blocked them (rule 23). Visitors get the same list, without those. The list is worked out every ten minutes; names and addresses are read
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
    const ids = candidates.map((candidate) => candidate.userId)
    const [followed, blocked] = await Promise.all([followedAmong(payload, userId, ids), blockedAmong(payload, userId, ids)])
    for (const id of [...followed, ...blocked]) exclude.add(id)
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
