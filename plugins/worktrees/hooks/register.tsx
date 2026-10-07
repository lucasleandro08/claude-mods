import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { RepoRow, WorktreeRow } from '../types'
import { isMerged, parseBranchList, parsePorcelain, parseRoots, parseStatusCount, prsByBranch, type PullRequest } from '../src/worktrees'
import { binaryCandidates } from '../src/shared/bin'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'
import { WorktreesChip } from '../ui/chip'
import { canRemove, PaneError, WorktreesPane } from '../ui/pane'

const MOD = 'worktrees'
const CHECK_MS = 5000
const active = atom({ plugin: 'worktrees', key: 'active' } as const, false)
let checkedAt = 0

async function isActive($: EngineInterface) {
  if (Date.now() - checkedAt > CHECK_MS) {
    checkedAt = Date.now()
    const home = await $.env.get('HOME').catch(() => undefined)
    const text = await $.fs.read(statePath(home)).catch(() => '')
    const on = isOn(parseState(text), MOD)
    await update($, active, prev => (prev === on ? prev : on))
  }
  return read($, active)
}

const PANE_ID = 'worktrees'
const BATCH = 8

const repos = atom({ plugin: 'worktrees', key: 'repos' } as const, [])
const isOpen = atom({ plugin: 'worktrees', key: 'isOpen' } as const, false)
const isLoading = atom({ plugin: 'worktrees', key: 'isLoading' } as const, false)
const lastError = atom({ plugin: 'worktrees', key: 'error' } as const, '')
const updatedAt = atom({ plugin: 'worktrees', key: 'updatedAt' } as const, 0)
const busy = atom({ plugin: 'worktrees', key: 'busy' } as const, '')
let polledAt = 0

type Settings = { roots: string; ghPath: string; pollMs: number }

function readSettings(options: PluginOptions): Settings {
  return {
    roots: String(options.roots ?? ''),
    ghPath: String(options.ghPath ?? ''),
    pollMs: Math.max(1, Number(options.pollMinutes ?? 5)) * 60_000,
  }
}

async function git($: EngineInterface, cwd: string, args: readonly string[]) {
  return $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 15_000 }).catch(() => undefined)
}

async function gitText($: EngineInterface, cwd: string, args: readonly string[]) {
  const ran = await git($, cwd, args)
  return ran?.exitCode === 0 ? ran.stdout : undefined
}

async function myPullRequests($: EngineInterface, settings: Settings, cwd: string): Promise<PullRequest[]> {
  const args = ['pr', 'list', '--author', '@me', '--state', 'all', '--limit', '100', '--json', 'number,state,headRefName,url']
  for (const bin of binaryCandidates('gh', await $.env.get('HOME'), settings.ghPath)) {
    try {
      const ran = await $.process.run([bin, ...args], { cwd, timeoutMs: 20_000 })
      return ran.exitCode === 0 ? (JSON.parse(ran.stdout) as PullRequest[]) : []
    } catch {
      continue
    }
  }
  return []
}

async function candidates($: EngineInterface, settings: Settings, home: string) {
  const dirs = [await $.session.cwd()]
  for (const root of parseRoots(settings.roots, home)) {
    const entries = await $.fs.list(root).catch(() => [])
    for (const entry of entries) {
      if (entry.kind === 'dir' && !entry.name.startsWith('.')) dirs.push(`${root}/${entry.name}`)
    }
  }
  return [...new Set(dirs)]
}

async function loadRepo($: EngineInterface, settings: Settings, dir: string, seen: Set<string>): Promise<RepoRow | undefined> {
  const listed = await gitText($, dir, ['worktree', 'list', '--porcelain'])
  const all = parsePorcelain(listed ?? '')
  const main = all[0]
  if (!main || all.length < 2 || seen.has(main.path)) return undefined
  seen.add(main.path)

  const remoteHead = (await gitText($, main.path, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.trim() || 'origin/main'
  const [mergedText, baseHead, prs] = await Promise.all([
    gitText($, main.path, ['branch', '--merged', remoteHead]),
    gitText($, main.path, ['rev-parse', remoteHead]),
    myPullRequests($, settings, main.path),
  ])
  const byBranch = prsByBranch(prs)
  const extra = all.slice(1)
  // A branch with no commits of its own is "merged" too: only trust it when the worktree moved past the base
  const merged = parseBranchList(mergedText ?? '').filter(branch => extra.some(w => w.branch === branch && w.head !== baseHead?.trim()))

  const worktrees: WorktreeRow[] = await Promise.all(
    extra.map(async worktree => {
      const status = worktree.isPrunable ? '' : await gitText($, worktree.path, ['status', '--porcelain'])
      const pr = byBranch[worktree.branch]
      return { ...worktree, changes: parseStatusCount(status ?? ''), pr, isMerged: isMerged(worktree.branch, merged, pr) }
    }),
  )
  return { main: main.path, branch: main.branch, worktrees }
}

async function load($: EngineInterface, settings: Settings) {
  if (await read($, isLoading)) return
  await update($, isLoading, () => true)
  polledAt = Date.now()
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const dirs = await candidates($, settings, home)
    const seen = new Set<string>()
    const found: RepoRow[] = []
    for (let i = 0; i < dirs.length; i += BATCH) {
      const batch = await Promise.all(dirs.slice(i, i + BATCH).map(dir => loadRepo($, settings, dir, seen)))
      found.push(...batch.filter((repo): repo is RepoRow => repo !== undefined))
    }
    await update($, repos, () => found.sort((a, b) => a.main.localeCompare(b.main)))
    await update($, lastError, () => '')
    await update($, updatedAt, () => Date.now())
  } catch (err) {
    await update($, lastError, () => (err instanceof Error ? err.message : String(err)))
  } finally {
    await update($, isLoading, () => false)
  }
}

async function tick($: EngineInterface, settings: Settings) {
  if (!(await isActive($))) return
  if (Date.now() - polledAt >= settings.pollMs) await load($, settings)
}

async function openPane($: EngineInterface, settings: Settings) {
  const opened = await $.ui.open({ id: PANE_ID, title: 'Worktrees' })
  if (opened.isPlaced) await update($, isOpen, () => true)
  await load($, settings)
}

function quote(path: string) {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replace(/'/g, `'\\''`)}'`
}

async function openTerminal($: EngineInterface, row: WorktreeRow) {
  try {
    await $.tool.call({ tool: 'mcp__terminal__run_in_terminal', command: `cd ${quote(row.path)}`, title: (row.branch || row.path).slice(0, 40) })
  } catch (err) {
    $.ui.toast(`Could not open the terminal: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function confirmRemove($: EngineInterface, rows: WorktreeRow[]) {
  const what = rows.length === 1 ? `the worktree of ${rows[0]?.branch}` : `${rows.length} merged worktrees`
  try {
    const answer = await $.ui.ask(`Remove ${what}? Branches stay; only clean worktrees are removed.`, {
      header: 'Worktrees',
      options: ['Remove', 'Cancel'],
    })
    return answer === 'Remove'
  } catch {
    return false
  }
}

async function remove($: EngineInterface, settings: Settings, repo: RepoRow, rows: WorktreeRow[]) {
  const cwd = await $.session.cwd()
  const targets = rows.filter(row => canRemove(row, cwd))
  if (targets.length === 0 || !(await confirmRemove($, targets))) return
  const failed: string[] = []
  for (const row of targets) {
    await update($, busy, () => row.path)
    const ran = await git($, repo.main, ['worktree', 'remove', row.path])
    if (ran?.exitCode !== 0) failed.push(`${row.branch}: ${ran?.stderr.trim().split('\n')[0] ?? 'git failed'}`)
  }
  await update($, busy, () => '')
  $.ui.toast(failed.length === 0 ? `Removed ${targets.length} worktree${targets.length === 1 ? '' : 's'}.` : `Not removed: ${failed.join('; ')}`)
  await load($, settings)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    polledAt = 0
    await $.command.register({ name: 'worktrees', description: 'Open the git worktrees pane' })
    $.clock.every(CHECK_MS, () => void tick($, settings).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'worktrees' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await openPane($, settings)
    return { text: 'Worktrees pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    if (e.id === PANE_ID) await update($, isOpen, () => false)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const ran = await next(e)
    if (/\bgit\s+(?:-C\s+\S+\s+)?worktree\b|\bgh\s+pr\s+(merge|create|close)\b/.test(e.command)) polledAt = 0
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active))) return next(e)
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const all = await read($, repos)
    const total = all.reduce((n, repo) => n + repo.worktrees.length, 0)
    if (total === 0) return rest
    const cwd = await $.session.cwd()
    const merged = all.reduce((n, repo) => n + repo.worktrees.filter(row => canRemove(row, cwd)).length, 0)
    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <WorktreesChip ui={ui} total={total} merged={merged} onOpen={() => openPane($, settings)} />
        {rest}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (!(await read($, active))) {
      return <ui.Box padding={1}><ui.Text color="#6272a4">{OFF_TEXT}</ui.Text></ui.Box>
    }
    try {
      return (
        <WorktreesPane
          ui={ui}
          width={e.props.bodyColumns}
          home={(await $.env.get('HOME')) ?? ''}
          cwd={await $.session.cwd()}
          repos={await read($, repos)}
          isLoading={await read($, isLoading)}
          error={await read($, lastError)}
          updatedAt={await read($, updatedAt)}
          busy={await read($, busy)}
          onRefresh={() => load($, settings)}
          onTerminal={row => openTerminal($, row)}
          onRemove={(repo, rows) => remove($, settings, repo, rows)}
        />
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      $.ui.log(`worktrees render failed: ${message}`)
      return <PaneError ui={ui} message={message} onRefresh={() => load($, settings)} />
    }
  })
}
