import { describe, expect, test } from 'claude-code/testing'

import {
  expandHome,
  isMerged,
  parseBranchList,
  parsePorcelain,
  parseRoots,
  parseStatusCount,
  prsByBranch,
  shortPath,
} from '../src/worktrees'

describe('worktrees', () => {
  test('parses porcelain blocks, including flags and detached worktrees', () => {
    const worktrees = parsePorcelain([
      'worktree /repo', 'HEAD abc', 'branch refs/heads/main', '',
      'worktree /repo/feature', 'HEAD def', 'detached', 'locked in use', 'prunable stale', '',
      'worktree /bare', 'bare', '',
    ].join('\n'))
    expect(worktrees).toEqual([
      { path: '/repo', head: 'abc', branch: 'main', isMain: true, isLocked: false, isPrunable: false },
      { path: '/repo/feature', head: 'def', branch: '', isMain: false, isLocked: true, isPrunable: true },
    ])
  })

  test('parses merged branch output', () => {
    expect(parseBranchList('  main\n* feature\n+ linked\n  (HEAD detached at deadbeef)\n')).toEqual(['main', 'feature', 'linked'])
  })

  test('chooses the best pull request and determines merged state', () => {
    const byBranch = prsByBranch([
      { number: 2, state: 'CLOSED', headRefName: 'feature', url: 'x' },
      { number: 3, state: 'MERGED', headRefName: 'feature', url: 'y' },
      { number: 1, state: 'OPEN', headRefName: 'feature', url: 'z' },
      { number: 4, state: 'OPEN', headRefName: 'feature', url: 'new' },
    ])
    expect(byBranch.feature?.number).toBe(4)
    expect(isMerged('feature', ['feature'], byBranch.feature)).toBe(false)
    expect(isMerged('merged', [], { number: 5, state: 'MERGED', headRefName: 'merged', url: 'x' })).toBe(true)
    expect(isMerged('old', ['old'], undefined)).toBe(true)
    expect(isMerged('', [''], undefined)).toBe(false)
  })

  test('expands, shortens, and parses root paths', () => {
    expect(expandHome('~', '/Users/me')).toBe('/Users/me')
    expect(expandHome('~/src', '/Users/me')).toBe('/Users/me/src')
    expect(shortPath('/Users/me/src', '/Users/me/')).toBe('~/src')
    expect(shortPath('/tmp', '/Users/me')).toBe('/tmp')
    expect(parseRoots(' ~/src/, /tmp:/Users/me/src, , ~/other ', '/Users/me')).toEqual(['/Users/me/src', '/tmp', '/Users/me/other'])
  })

  test('counts only nonblank porcelain status lines', () => {
    expect(parseStatusCount(' M one\n\n?? two\n   \n')).toBe(2)
  })
})
