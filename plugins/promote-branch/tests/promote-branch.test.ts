import { describe, expect, test } from 'claude-code/testing'

const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

function fakeGit(calls: string[], opts: { branch?: string; dirty?: string; mergeFails?: boolean } = {}) {
  return (argv: readonly string[]) => {
    const args = argv.join(' ')
    calls.push(args)
    if (args === 'mktemp -d -t promote-branch') return out('/tmp/wt\n')
    if (args.endsWith('--show-toplevel')) return out('/repo\n')
    if (args.endsWith('--abbrev-ref HEAD')) return out(`${opts.branch ?? 'feat/x'}\n`)
    if (args.includes('log --oneline')) return out('abc123 feat: thing\n')
    if (args.includes('diff --name-only origin/staging...HEAD')) return out('app/a.ts\napp/__tests__/a.test.ts\n')
    if (args.includes('status --porcelain')) return out(opts.dirty ?? '')
    if (args.includes(' merge --no-ff') && opts.mergeFails) return out('', 1)
    if (args.includes('--diff-filter=U')) return out('app/a.ts\n')
    if (args.includes('rev-parse --short')) return out('def456\n')
    return out('')
  }
}

describe('/promote', () => {
  test('previews without pushing', async ($, on) => {
    const calls: string[] = []
    on('process.run', ($, e) => fakeGit(calls)(e.argv))
    const res = await $.command.run({ command: 'promote', args: '' } as never)
    expect(JSON.stringify(res)).toContain('abc123 feat: thing')
    expect(JSON.stringify(res)).toContain('a.test.ts')
    expect(calls.some(c => c.includes('push'))).toBe(false)
  })

  test('go merges in a temp worktree and pushes to the target branch', async ($, on) => {
    const calls: string[] = []
    on('process.run', ($, e) => fakeGit(calls)(e.argv))
    const res = await $.command.run({ command: 'promote', args: 'go' } as never)
    expect(JSON.stringify(res)).toContain('def456')
    expect(calls).toContain('git -C /tmp/wt merge --no-ff --no-edit feat/x')
    expect(calls).toContain('git -C /tmp/wt push origin HEAD:staging')
    expect(calls).toContain('git worktree remove --force /tmp/wt')
  })

  test('go refuses a dirty tree and a protected branch', async ($, on) => {
    const calls: string[] = []
    on('process.run', ($, e) => fakeGit(calls, { dirty: ' M app/a.ts' })(e.argv))
    expect(JSON.stringify(await $.command.run({ command: 'promote', args: 'go' } as never))).toContain('Uncommitted')
    expect(calls.some(c => c.includes('push'))).toBe(false)
  })

  test('go aborts on conflict without pushing', async ($, on) => {
    const calls: string[] = []
    on('process.run', ($, e) => fakeGit(calls, { mergeFails: true })(e.argv))
    const res = await $.command.run({ command: 'promote', args: 'go' } as never)
    expect(JSON.stringify(res)).toContain('Merge conflict')
    expect(calls.some(c => c.includes('push'))).toBe(false)
    expect(calls).toContain('git -C /tmp/wt merge --abort')
    expect(calls).toContain('git worktree remove --force /tmp/wt')
  })

  test('refuses to run from main', async ($, on) => {
    const calls: string[] = []
    on('process.run', ($, e) => fakeGit(calls, { branch: 'main' })(e.argv))
    expect(JSON.stringify(await $.command.run({ command: 'promote', args: 'go' } as never))).toContain('Current branch is main')
  })
})

test('target branch is configurable', { options: { targetBranch: 'homolog' } }, async ($, on) => {
  const calls: string[] = []
  on('process.run', ($, e) => fakeGit(calls)(e.argv))
  await $.command.run({ command: 'promote', args: 'go' } as never)
  expect(calls).toContain('git -C /tmp/wt push origin HEAD:homolog')
})
