import type { CollectionBeforeChangeHook, Where } from 'payload'

/**
 * 资料核对 (docs/specs/apps.md「后台」): a published app's pricing and platforms are checked again
 * every 90 days. Publishing counts as a check (the site owner reads the draft before publishing
 * it), so it fills in the date; after that the owner sets it on each check. An app without a
 * date counts from when it was listed. No server imports: the admin notice uses this file too.
 */

export const recheckAfterDays = 90

const dayMs = 24 * 60 * 60 * 1000

/** Published apps last checked before this (or never checked and listed before it) are due. */
export function recheckCutoff(now: Date): Date {
  return new Date(now.getTime() - recheckAfterDays * dayMs)
}

/** The apps due for a check, as a Payload query: the notice counts them and links to the list of them. */
export function recheckDue(now: Date): Where {
  const cutoff = recheckCutoff(now).toISOString()
  return {
    and: [
      { status: { equals: 'published' } },
      {
        or: [
          { checkedAt: { less_than: cutoff } },
          { and: [{ checkedAt: { exists: false } }, { listedAt: { less_than: cutoff } }] },
        ],
      },
    ],
  }
}

/** A query the way the admin list and the REST API read it from the address: where[and][0][status][equals]=published&… */
export function whereQuery(where: Where): string {
  const pairs: string[] = []
  const add = (key: string, value: unknown) => {
    if (value !== null && typeof value === 'object') {
      for (const [inner, innerValue] of Object.entries(value)) add(`${key}[${inner}]`, innerValue)
    } else {
      pairs.push(`${key}=${encodeURIComponent(String(value))}`)
    }
  }
  add('where', where)
  return pairs.join('&')
}

type CheckFields = { status?: string | null; checkedAt?: string | null }

/** The date to keep on save: publishing fills in `now`, unless this save sets the date itself. */
export function checkedAtOnSave(data: CheckFields, original: CheckFields | undefined, now: Date): string | null | undefined {
  const publishing = data.status === 'published' && original?.status !== 'published'
  const setHere = Boolean(data.checkedAt) && data.checkedAt !== original?.checkedAt
  return publishing && !setHere ? now.toISOString() : data.checkedAt
}

export const checkOnPublish: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const checkedAt = checkedAtOnSave(data, originalDoc, new Date())
  return checkedAt === data.checkedAt ? data : { ...data, checkedAt }
}
