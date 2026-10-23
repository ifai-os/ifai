/** A row of the「文件」tab: a folder or a file, with how deep it sits. */
export type FileRow =
  | { kind: 'dir'; path: string; name: string; depth: number }
  | { kind: 'file'; path: string; name: string; depth: number; size: number }

/**
 * The version's file list as a tree, read top to bottom: in each folder SKILL.md first, then
 * sub-folders, then the other files, each group by name.
 */
export function fileTree(files: { path: string; size?: number | null }[]): FileRow[] {
  type Dir = { dirs: Map<string, Dir>; files: { name: string; path: string; size: number }[] }
  const root: Dir = { dirs: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    const name = parts.pop()
    if (!name) continue
    let dir = root
    for (const part of parts) {
      let next = dir.dirs.get(part)
      if (!next) {
        next = { dirs: new Map(), files: [] }
        dir.dirs.set(part, next)
      }
      dir = next
    }
    dir.files.push({ name, path: file.path, size: file.size ?? 0 })
  }

  const rows: FileRow[] = []
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const walk = (dir: Dir, prefix: string, depth: number) => {
    const files = [...dir.files].sort((a, b) => byName(a.name, b.name))
    const skillMd = depth === 0 ? files.filter((file) => file.name === 'SKILL.md') : []
    for (const file of skillMd) rows.push({ kind: 'file', depth, ...file })
    for (const name of [...dir.dirs.keys()].sort(byName)) {
      const path = `${prefix}${name}`
      rows.push({ kind: 'dir', path, name, depth })
      walk(dir.dirs.get(name)!, `${path}/`, depth + 1)
    }
    for (const file of files) if (!skillMd.includes(file)) rows.push({ kind: 'file', depth, ...file })
  }
  walk(root, '', 0)
  return rows
}

/** Text files are shown; images and anything else only by name and size. */
export function isTextPath(path: string): boolean {
  return !/\.(png|jpe?g|gif|webp|ico|bmp|svgz|pdf|zip|gz|tgz|woff2?|ttf|otf|mp3|mp4|wav|mov)$/i.test(path)
}

/**
 * The language a text is mostly written in, for the `lang` around text shown as the author wrote
 * it (SKILL.md, files): Hangul → ko, kana → ja, other Han → zh, otherwise en.
 */
export function guessLang(text: string): 'en' | 'zh' | 'ja' | 'ko' {
  const sample = text.slice(0, 4000)
  const count = (pattern: RegExp) => sample.match(pattern)?.length ?? 0
  const hangul = count(/\p{Script=Hangul}/gu)
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)
  const han = count(/\p{Script=Han}/gu)
  const latin = count(/\p{Script=Latin}/gu)
  const cjk = Math.max(hangul, kana, han)
  // A few CJK characters in an English file (a name, an example) do not make it a CJK file.
  if (cjk === 0 || cjk * 4 < latin) return 'en'
  if (hangul >= kana && hangul >= han) return 'ko'
  if (kana > 0 && kana * 10 >= han) return 'ja'
  return 'zh'
}
