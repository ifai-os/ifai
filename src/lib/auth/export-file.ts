/**
 * The file「下载我的数据」saves (docs/specs/foundation.md「导出我的数据」), named after the day it
 * was made: the reader's own day on the account page, the UTC day in the export route's header.
 * No server imports: the account page's button uses this file too.
 */
export function exportFileName(day: string): string {
  return `ifai-data-${day}.json`
}
