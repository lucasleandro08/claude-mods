import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { BuildRow, Project } from '../types'
import { awsFlags, BUILD_QUERY, chipState, isSettled, logsCommand, parseProjects, pushedProjects, toBuildRows } from '../src/builds'
import { binaryCandidates } from '../src/shared/bin'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'
import { DeployChip } from '../ui/chip'
import { DeploysPane, PaneError } from '../ui/pane'

const MOD = 'deploy-watch'
const CHECK_MS = 5000
const active = atom({ plugin: 'deploy-watch', key: 'active' } as const, false)
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

const PANE_ID = 'deploy-watch'
const BUSY_POLL_MS = 15_000
const BUILDS_KEPT = 5

const builds = atom({ plugin: 'deploy-watch', key: 'builds' } as const, {})
const pushes = atom({ plugin: 'deploy-watch', key: 'pushes' } as const, {})
const errors = atom({ plugin: 'deploy-watch', key: 'errors' } as const, {})
const isOpen = atom({ plugin: 'deploy-watch', key: 'isOpen' } as const, false)
const updatedAt = atom({ plugin: 'deploy-watch', key: 'updatedAt' } as const, 0)
let polledAt = 0
const warned = new Set<string>()

type Settings = {
  projects: Project[]
  profile: string
  region: string
  awsPath: string
  pollMs: number
  missingMs: number
  production: RegExp
}

function readSettings(options: PluginOptions): Settings {
  return {
    projects: parseProjects(String(options.projects ?? '')),
    profile: String(options.awsProfile ?? ''),
    region: String(options.region ?? ''),
    awsPath: String(options.awsPath ?? ''),
    pollMs: Math.max(15, Number(options.pollSeconds ?? 60)) * 1000,
    missingMs: Math.max(1, Number(options.missingBuildMinutes ?? 3)) * 60_000,
    production: new RegExp(String(options.productionPattern ?? 'prod'), 'i'),
  }
}

async function aws($: EngineInterface, settings: Settings, args: readonly string[]) {
  const argv = [...args, ...awsFlags(settings.profile, settings.region)]
  for (const bin of binaryCandidates('aws', await $.env.get('HOME'), settings.awsPath)) {
    try {
      return await $.process.run([bin, ...argv], { timeoutMs: 30_000, env: { AWS_PAGER: '' } })
    } catch {
      continue
    }
  }
  throw new Error('aws CLI not found; set its path in /config')
}

function firstLine(text: string, fallback: string) {
  return text.trim().split('\n')[0] || fallback
}

async function loadProject($: EngineInterface, settings: Settings, project: Project) {
  try {
    const listed = await aws($, settings, ['codebuild', 'list-builds-for-project', '--project-name', project.name, '--max-items', String(BUILDS_KEPT), '--query', 'ids', '--output', 'json'])
    if (listed.exitCode !== 0) throw new Error(firstLine(listed.stderr, 'list-builds-for-project failed'))
    const ids = (JSON.parse(listed.stdout || '[]') as string[]).slice(0, BUILDS_KEPT)
    let rows: BuildRow[] = []
    if (ids.length > 0) {
      const got = await aws($, settings, ['codebuild', 'batch-get-builds', '--ids', ...ids, '--query', BUILD_QUERY, '--output', 'json'])
      if (got.exitCode !== 0) throw new Error(firstLine(got.stderr, 'batch-get-builds failed'))
      rows = toBuildRows(got.stdout)
    }
    await update($, builds, prev => ({ ...prev, [project.name]: rows }))
    await update($, errors, prev => ({ ...prev, [project.name]: '' }))
  } catch (err) {
    await update($, errors, prev => ({ ...prev, [project.name]: err instanceof Error ? err.message : String(err) }))
  }
}

async function settlePushes($: EngineInterface, settings: Settings) {
  const all = await read($, builds)
  const pending = await read($, pushes)
  for (const project of settings.projects) {
    const pushedAt = pending[project.name] ?? 0
    if (pushedAt === 0) continue
    const rows = all[project.name] ?? []
    if (rows.some(b => b.startedAt >= pushedAt - 30_000)) {
      await update($, pushes, prev => ({ ...prev, [project.name]: 0 }))
      continue
    }
    const state = chipState(rows, pushedAt, await $.clock.now(), settings.missingMs)
    const key = `${project.name}:${pushedAt}`
    if (state.kind === 'missing' && !warned.has(key)) {
      warned.add(key)
      $.ui.toast(`deploy-watch: ${project.name} has no build yet, ${state.label}. Start it from the Deploys pane.`, { timeoutMs: 10_000 })
    }
  }
}

async function poll($: EngineInterface, settings: Settings) {
  polledAt = await $.clock.now()
  await Promise.all(settings.projects.map(project => loadProject($, settings, project)))
  const now = await $.clock.now()
  await update($, updatedAt, () => now)
  await settlePushes($, settings)
}

async function isBusy($: EngineInterface, settings: Settings) {
  const all = await read($, builds)
  const pending = await read($, pushes)
  return settings.projects.some(p => !isSettled(all[p.name] ?? [], pending[p.name] ?? 0))
}

async function tick($: EngineInterface, settings: Settings) {
  if (settings.projects.length === 0 || !(await isActive($))) return
  const every = (await isBusy($, settings)) ? BUSY_POLL_MS : settings.pollMs
  if ((await $.clock.now()) - polledAt >= every) await poll($, settings)
}

async function openPane($: EngineInterface, settings: Settings) {
  const opened = await $.ui.open({ id: PANE_ID, title: 'Deploys' })
  if (opened.isPlaced) await update($, isOpen, () => true)
  await poll($, settings)
}

async function confirmStart($: EngineInterface, settings: Settings, project: Project) {
  const target = project.branch === '' ? 'its default source' : `branch ${project.branch}`
  const warning = settings.production.test(project.name) ? ' This looks like PRODUCTION.' : ''
  try {
    const answer = await $.ui.ask(`Start a CodeBuild build of ${project.name} from ${target}?${warning}`, {
      header: 'Start build',
      options: ['Start build', 'Cancel'],
    })
    return answer === 'Start build'
  } catch {
    return false
  }
}

async function startBuild($: EngineInterface, settings: Settings, project: Project) {
  if (!(await confirmStart($, settings, project))) return
  const args = ['codebuild', 'start-build', '--project-name', project.name, ...(project.branch ? ['--source-version', project.branch] : []), '--query', 'build.buildNumber', '--output', 'text']
  try {
    const ran = await aws($, settings, args)
    if (ran.exitCode !== 0) throw new Error(firstLine(ran.stderr, 'start-build failed'))
    $.ui.toast(`deploy-watch: started ${project.name} #${ran.stdout.trim()}`)
    const now = await $.clock.now()
    await update($, pushes, prev => ({ ...prev, [project.name]: now }))
  } catch (err) {
    await update($, errors, prev => ({ ...prev, [project.name]: err instanceof Error ? err.message : String(err) }))
  }
  await poll($, settings)
}

async function openLogs($: EngineInterface, settings: Settings, build: BuildRow) {
  try {
    await $.tool.call({ tool: 'mcp__terminal__run_in_terminal', command: logsCommand(build, settings.profile, settings.region), title: `build #${build.number}` })
  } catch (err) {
    $.ui.toast(`Could not open the terminal: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    polledAt = 0
    await $.command.register({ name: 'deploys', description: 'Open the CodeBuild deploys pane' })
    $.clock.every(CHECK_MS, () => void tick($, settings).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'deploys' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await openPane($, settings)
    return { text: settings.projects.length === 0 ? 'Deploys pane opened. Set the projects in /config.' : 'Deploys pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    if (e.id === PANE_ID) await update($, isOpen, () => false)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const ran = await next(e)
    const pushed = pushedProjects(e.command, settings.projects)
    if (pushed.length > 0) {
      const now = await $.clock.now()
      await update($, pushes, prev => ({ ...prev, ...Object.fromEntries(pushed.map(name => [name, now])) }))
      polledAt = 0
    }
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active)) || settings.projects.length === 0) return next(e)
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const all = await read($, builds)
    const pending = await read($, pushes)
    const now = await $.clock.now()
    const states = settings.projects.map(p => ({ name: p.name, state: chipState(all[p.name] ?? [], pending[p.name] ?? 0, now, settings.missingMs) }))
    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <DeployChip ui={ui} projects={states} onOpen={() => openPane($, settings)} />
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
        <DeploysPane
          ui={ui}
          projects={settings.projects}
          builds={await read($, builds)}
          pushes={await read($, pushes)}
          errors={await read($, errors)}
          updatedAt={await read($, updatedAt)}
          now={await $.clock.now()}
          missingMs={settings.missingMs}
          onRefresh={() => poll($, settings)}
          onStart={project => startBuild($, settings, project)}
          onLogs={build => openLogs($, settings, build)}
        />
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      $.ui.log(`deploy-watch render failed: ${message}`)
      return <PaneError ui={ui} message={message} onRefresh={() => poll($, settings)} />
    }
  })
}
