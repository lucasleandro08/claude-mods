import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { BranchState, PrRow } from '../types'
import { codexState, isContained, summarizeChecks, type Check, type SearchItem } from '../src/github'
import { binaryCandidates } from '../src/shared/bin'
import { PrChip } from '../ui/chip'
import { PrPane } from '../ui/pane'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'

const MOD = 'pr-pane'
const CHECK_MS = 5000
const active = atom({ plugin: 'pr-pane', key: 'active' } as const, false)
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

const PANE_ID = 'pr-pane'
const CONCURRENCY = 4

const rows = atom({ plugin: 'pr-pane', key: 'rows' } as const, [])
const isOpen = atom({ plugin: 'pr-pane', key: 'isOpen' } as const, false)
const isLoading = atom({ plugin: 'pr-pane', key: 'isLoading' } as const, false)
const updatedAt = atom({ plugin: 'pr-pane', key: 'updatedAt' } as const, 0)
const lastError = atom({ plugin: 'pr-pane', key: 'error' } as const, '')

type Settings = { integrationBranch: string; codexBot: string; refreshMs: number; limit: number; ghPath: string }

function readSettings(options: PluginOptions): Settings {
  return {
    integrationBranch: String(options.integrationBranch ?? 'staging').trim(),
    codexBot: String(options.codexBotLogin ?? 'chatgpt-codex-connector[bot]'),
    refreshMs: Math.max(1, Number(options.refreshMinutes ?? 5)) * 60_000,
    limit: Math.max(1, Number(options.limit ?? 50)),
    ghPath: String(options.ghPath ?? ''),
  }
}

async function gh($: EngineInterface, settings: Settings, args: readonly string[]) {
  for (const bin of binaryCandidates('gh', await $.env.get('HOME'), settings.ghPath)) {
    try {
      return await $.process.run([bin, ...args], { timeoutMs: 20_000 })
    } catch {
      continue
    }
  }
  throw new Error('gh not found; install the GitHub CLI or set its path in /config')
}

async function ghJson<T>($: EngineInterface, settings: Settings, args: readonly string[]): Promise<T | undefined> {
  const ran = await gh($, settings, args)
  return ran.exitCode === 0 ? (JSON.parse(ran.stdout) as T) : undefined
}

async function integrationState($: EngineInterface, settings: Settings, repo: string, sha: string | undefined): Promise<BranchState> {
  if (settings.integrationBranch === '' || !sha) return 'n/a'
  const compared = await gh($, settings, ['api', `repos/${repo}/compare/${settings.integrationBranch}...${sha}`, '--jq', '.status'])
  if (compared.exitCode !== 0) return 'n/a'
  return isContained(compared.stdout) ? 'in' : 'out'
}

async function loadRow($: EngineInterface, settings: Settings, item: SearchItem): Promise<PrRow> {
  const repo = item.repository.nameWithOwner
  const n = String(item.number)
  const bot = `select(.user.login == "${settings.codexBot}")`

  const [view, reactions, reviews] = await Promise.all([
    ghJson<{ headRefOid: string; statusCheckRollup: Check[] }>($, settings, ['pr', 'view', n, '-R', repo, '--json', 'headRefOid,statusCheckRollup']),
    ghJson<string[]>($, settings, ['api', `repos/${repo}/issues/${n}/reactions`, '--jq', `[.[] | ${bot} | .content]`]),
    ghJson<number>($, settings, ['api', `repos/${repo}/pulls/${n}/reviews`, '--jq', `[.[] | ${bot}] | length`]),
  ])

  return {
    repo,
    number: item.number,
    title: item.title,
    url: item.url,
    isDraft: item.isDraft,
    checks: summarizeChecks(view?.statusCheckRollup ?? []),
    codex: codexState(reactions ?? [], reviews ?? 0),
    codexReviews: reviews ?? 0,
    integration: await integrationState($, settings, repo, view?.headRefOid),
  }
}

async function refresh($: EngineInterface, settings: Settings) {
  if (await read($, isLoading)) return
  await update($, isLoading, () => true)
  try {
    const found = await ghJson<SearchItem[]>($, settings, [
      'search', 'prs', '--author', '@me', '--state', 'open', '--limit', String(settings.limit),
      '--json', 'number,title,url,isDraft,repository',
    ])
    if (found === undefined) throw new Error('gh search prs failed; run `gh auth status`')

    const loaded: PrRow[] = []
    for (let i = 0; i < found.length; i += CONCURRENCY) {
      loaded.push(...(await Promise.all(found.slice(i, i + CONCURRENCY).map(item => loadRow($, settings, item)))))
    }
    await update($, rows, () => loaded)
    await update($, lastError, () => '')
    await update($, updatedAt, () => Date.now())
  } catch (err) {
    await update($, lastError, () => (err instanceof Error ? err.message : String(err)))
  } finally {
    await update($, isLoading, () => false)
  }
}

async function openPane($: EngineInterface, settings: Settings) {
  const opened = await $.ui.open({ id: PANE_ID, title: 'PRs' })
  if (opened.isPlaced) await update($, isOpen, () => true)
  void refresh($, settings)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    void isActive($)
    $.clock.every(CHECK_MS, () => void isActive($))
    await $.command.register({ name: 'prs', description: 'Open the pull requests pane' })
    void isActive($).then(enabled => (enabled ? refresh($, settings) : undefined))
    $.clock.every(settings.refreshMs, () => void isActive($).then(enabled => (enabled ? refresh($, settings) : undefined)))

    return next(e)
  })

  on('command.run', { command: 'prs' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await openPane($, settings)
    return { text: 'PRs pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    if (e.id === PANE_ID) await update($, isOpen, () => false)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active))) return next(e)
    const rest = await next(e)
    const list = await read($, rows)
    if (e.props.hasSurvey || (await read($, isOpen))) return rest

    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <PrChip ui={ui} rows={list} onOpen={() => openPane($, settings)} />
        {rest}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (!(await read($, active))) {
      return <ui.Box padding={1}><ui.Text color="#6272a4">{OFF_TEXT}</ui.Text></ui.Box>
    }
    return <PrPane
      ui={ui}
      rows={await read($, rows)}
      isLoading={await read($, isLoading)}
      error={await read($, lastError)}
      updatedAt={await read($, updatedAt)}
      integrationBranch={settings.integrationBranch}
      onRefresh={() => refresh($, settings)}
    />
  })
}
