/** How closely a name answers the search: 0 the same, 1 starts with it, 2 anything else. */
export function nameMatch(names: readonly string[], q: string): 0 | 1 | 2 {
  const query = fold(q)
  if (!query) return 2
  let best: 0 | 1 | 2 = 2
  for (const name of names) {
    const folded = fold(name)
    if (folded === query) return 0
    if (folded.startsWith(query)) best = 1
  }
  return best
}

/**
 * Puts the items whose name is the search first, then those whose name starts with it, and
 * otherwise keeps the order they came in (heat, installs): searching「Claude」finds Claude
 * before every app that only mentions it.
 */
export function namesFirst<T>(items: readonly T[], q: string, namesOf: (item: T) => readonly string[]): T[] {
  return items
    .map((item, index) => ({ item, index, match: nameMatch(namesOf(item), q) }))
    .sort((a, b) => a.match - b.match || a.index - b.index)
    .map(({ item }) => item)
}

function fold(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim()
}
