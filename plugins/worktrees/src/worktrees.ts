import type { PullRequest, Worktree } from '../types'

export type { PullRequest, Worktree }

export function parsePorcelain(stdout: string): Worktree[] {
  return stdout.split(/\n\s*\n/).flatMap((block, index) => {
    const lines = block.split('\n')
    const path = lines.find(line => line.startsWith('worktree '))?.slice(9)
    if (!path || lines.some(line => line === 'bare')) return []
    const branchLine = lines.find(line => line.startsWith('branch '))
    return [{
      path,
      head: lines.find(line => line.startsWith('HEAD '))?.slice(5) ?? '',
      branch: branchLine?.startsWith('branch refs/heads/') ? branchLine.slice(18) : '',
      isMain: index === 0,
      isLocked: lines.some(line => line.startsWith('locked')),
      isPrunable: lines.some(line => line.startsWith('prunable')),
    }]
  })
}

export function parseBranchList(stdout: string): string[] {
  return stdout.split('\n')
    .map(line => line.replace(/^[*+]\s+|^\s+/, '').trim())
    .filter(line => line !== '' && !line.startsWith('(HEAD detached'))
}

export function prsByBranch(prs: PullRequest[]): Record<string, PullRequest> {
  const result: Record<string, PullRequest> = {}
  const rank = { OPEN: 2, MERGED: 1, CLOSED: 0 }
  for (const pr of prs) {
    const current = result[pr.headRefName]
    if (!current || rank[pr.state] > rank[current.state] || (rank[pr.state] === rank[current.state] && pr.number > current.number)) result[pr.headRefName] = pr
  }
  return result
}

export function isMerged(branch: string, mergedBranches: string[], pr: PullRequest | undefined): boolean {
  return branch !== '' && (pr?.state === 'MERGED' || (pr?.state !== 'OPEN' && mergedBranches.includes(branch)))
}

export function expandHome(path: string, home: string): string {
  if (path === '~') return home
  return path.startsWith('~/') ? `${home}${path.slice(1)}` : path
}

export function shortPath(path: string, home: string): string {
  const base = home.replace(/\/+$/, '')
  if (path === base) return '~'
  return path.startsWith(`${base}/`) ? `~${path.slice(base.length)}` : path
}

export function parseRoots(option: string, home: string): string[] {
  const roots = new Set<string>()
  for (const value of option.split(/[,:]/)) {
    const expanded = expandHome(value.trim(), home)
    const root = expanded.replace(/\/+$/, '') || (expanded.startsWith('/') ? '/' : '')
    if (root !== '') roots.add(root)
  }
  return [...roots]
}

export function parseStatusCount(porcelain: string): number {
  return porcelain.split('\n').filter(line => line.trim() !== '').length
}
