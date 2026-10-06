import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { describePreview, lines, protectedBranches, testFiles, type Preview } from '../src/preview'

type Settings = { target: string; protectedList: string[] }

function readSettings(options: PluginOptions): Settings {
  const target = String(options.targetBranch ?? 'staging').trim() || 'staging'
  return { target, protectedList: protectedBranches(String(options.protectedBranches ?? 'main,master'), target) }
}

async function git($: EngineInterface, args: readonly string[], timeoutMs = 60_000) {
  const ran = await $.process.run(['git', ...args], { timeoutMs })
  return { ok: ran.exitCode === 0, out: ran.stdout.trim(), err: ran.stderr.trim() }
}

async function preview($: EngineInterface, settings: Settings): Promise<Preview | { error: string }> {
  const top = await git($, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { error: 'Not inside a git repository.' }

  const branch = (await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])).out
  if (settings.protectedList.includes(branch)) return { error: `Current branch is ${branch}; switch to the feature branch first.` }

  const fetched = await git($, ['fetch', 'origin', settings.target])
  if (!fetched.ok) return { error: `This repo has no origin/${settings.target} (${fetched.err.split('\n')[0]}).` }

  const base = `origin/${settings.target}`
  const files = lines((await git($, ['diff', '--name-only', `${base}...HEAD`])).out)
  return {
    repo: top.out,
    branch,
    target: settings.target,
    commits: lines((await git($, ['log', '--oneline', '--no-decorate', `${base}..HEAD`])).out),
    files,
    tests: testFiles(files),
    isDirty: (await git($, ['status', '--porcelain', '--untracked-files=no'])).out !== '',
  }
}

async function mergeAndPush($: EngineInterface, settings: Settings) {
  const p = await preview($, settings)
  if ('error' in p) return p.error
  if (p.isDirty) return 'Uncommitted changes in the working tree; commit or stash them before /promote go.'
  if (p.commits.length === 0) return `Nothing to merge: ${p.target} already has ${p.branch}.`

  const tmp = (await $.process.run(['mktemp', '-d', '-t', 'promote-branch'])).stdout.trim()
  const added = await git($, ['worktree', 'add', '--detach', tmp, `origin/${p.target}`])
  if (!added.ok) return `Could not create a temporary worktree: ${added.err}`

  try {
    const merged = await git($, ['-C', tmp, 'merge', '--no-ff', '--no-edit', p.branch], 120_000)
    if (!merged.ok) {
      const conflicts = (await git($, ['-C', tmp, 'diff', '--name-only', '--diff-filter=U'])).out
      await git($, ['-C', tmp, 'merge', '--abort'])
      return `Merge conflict, nothing pushed. Conflicting files:\n${conflicts || merged.err}`
    }

    const pushed = await git($, ['-C', tmp, 'push', 'origin', `HEAD:${p.target}`], 180_000)
    if (!pushed.ok) return `Merged locally but the push failed, nothing pushed:\n${pushed.err}`

    const sha = (await git($, ['-C', tmp, 'rev-parse', '--short', 'HEAD'])).out
    return [
      `Pushed ${p.branch} → ${p.target} (${sha}), ${p.commits.length} commit(s).`,
      p.tests.length > 0 ? `Test files touched: ${p.tests.join(', ')}` : 'No test files touched.',
    ].join('\n')
  } finally {
    await git($, ['worktree', 'remove', '--force', tmp])
  }
}

export const register: Register = (on, options) => {
  if (options.enabled !== true) return

  const settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'promote',
      description: `Preview merging the current branch into ${settings.target}; \`/promote go\` merges and pushes`,
    })
    return next(e)
  })

  on('command.run', { command: 'promote' }, async ($, e) => {
    if (e.args.trim() === 'go') return { text: await mergeAndPush($, settings) }

    const p = await preview($, settings)
    return { text: 'error' in p ? p.error : describePreview(p) }
  })
}
