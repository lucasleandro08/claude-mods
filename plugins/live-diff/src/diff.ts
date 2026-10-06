import type { DiffLine, Hunk } from '../types'

export function diffLines(before: string, after: string, firstLine = 1, contextLines = 2): DiffLine[] {
  const old = before === '' ? [] : before.split('\n')
  const next = after === '' ? [] : after.split('\n')

  let prefix = 0
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++

  let suffix = 0
  while (
    suffix < old.length - prefix &&
    suffix < next.length - prefix &&
    old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix++

  const headStart = Math.max(0, prefix - contextLines)
  const oldTail = old.length - suffix
  const newTail = next.length - suffix
  const tailCount = Math.min(contextLines, suffix)

  return [
    ...old.slice(headStart, prefix).map((text, i) => ({
      kind: 'ctx' as const, text, oldNo: firstLine + headStart + i, newNo: firstLine + headStart + i,
    })),
    ...old.slice(prefix, oldTail).map((text, i) => ({ kind: 'del' as const, text, oldNo: firstLine + prefix + i })),
    ...next.slice(prefix, newTail).map((text, i) => ({ kind: 'add' as const, text, newNo: firstLine + prefix + i })),
    ...old.slice(oldTail, oldTail + tailCount).map((text, i) => ({
      kind: 'ctx' as const, text, oldNo: firstLine + oldTail + i, newNo: firstLine + newTail + i,
    })),
  ]
}

export function lineOf(content: string, needle: string) {
  const at = content.indexOf(needle)
  return at < 0 ? 1 : content.slice(0, at).split('\n').length
}

export function hasChanges(hunk: Hunk) {
  return hunk.lines.some(line => line.kind !== 'ctx')
}

export function countLines(kind: 'add' | 'del', hunks: readonly Hunk[]) {
  return hunks.reduce((sum, h) => sum + h.lines.filter(l => l.kind === kind).length, 0)
}

export type FileSummary = { path: string; hunks: Hunk[]; added: number; removed: number; isNewFile: boolean }

export function summarizeFiles(hunks: readonly Hunk[]): FileSummary[] {
  return [...new Set(hunks.map(h => h.path))].map(path => {
    const own = hunks.filter(h => h.path === path).reverse()
    return { path, hunks: own, added: countLines('add', own), removed: countLines('del', own), isNewFile: own.some(h => h.isNewFile) }
  })
}
