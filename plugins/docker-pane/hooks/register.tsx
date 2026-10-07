import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { isHealthy, isStale, lastHeadMove, logsCommand, parseDockerPs, recreateCommand, type ContainerRow } from '../src/containers'
import { binaryCandidates } from '../src/shared/bin'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'
import { barIsLive, sameChip, type Chip, type ChipPress } from '../src/shared/chip'
import { DockerChip, dockerChip } from '../ui/chip'
import { DockerPane, PaneError, type Action } from '../ui/pane'

const MOD = 'docker-pane'
const CHECK_MS = 5000
const active = atom({ plugin: 'docker-pane', key: 'active' } as const, false)
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

const chip = atom({ plugin: 'docker-pane', key: 'chip' } as const, null)

async function barOwnsChips($: EngineInterface) {
  const { value } = await $.state.get({ plugin: 'mod-manager', key: 'bar' })
  return barIsLive(value, Date.now())
}

async function setChip($: EngineInterface, next: Chip | null) {
  await update($, chip, prev => (sameChip(prev, next) ? prev : next))
}

const PANE_ID = 'docker-pane'
const OPEN_POLL_MS = 10_000

const containers = atom({ plugin: 'docker-pane', key: 'containers' } as const, [])
const repoRoot = atom({ plugin: 'docker-pane', key: 'repoRoot' } as const, '')
const headMovedAt = atom({ plugin: 'docker-pane', key: 'headMovedAt' } as const, 0)
const isOpen = atom({ plugin: 'docker-pane', key: 'isOpen' } as const, false)
const isLoading = atom({ plugin: 'docker-pane', key: 'isLoading' } as const, false)
const lastError = atom({ plugin: 'docker-pane', key: 'error' } as const, '')
const updatedAt = atom({ plugin: 'docker-pane', key: 'updatedAt' } as const, 0)
const busy = atom({ plugin: 'docker-pane', key: 'busy' } as const, '')
const hideStopped = atom({ plugin: 'docker-pane', key: 'hideStopped' } as const, false)
let polledAt = 0

type Settings = { dockerPath: string; pollMs: number }

function readSettings(options: PluginOptions): Settings {
  return {
    dockerPath: String(options.dockerPath ?? ''),
    pollMs: Math.max(10, Number(options.pollSeconds ?? 60)) * 1000,
  }
}

async function docker($: EngineInterface, settings: Settings, args: readonly string[], timeoutMs = 15_000) {
  for (const bin of binaryCandidates('docker', await $.env.get('HOME'), settings.dockerPath)) {
    try {
      return await $.process.run([bin, ...args], { timeoutMs })
    } catch {
      continue
    }
  }
  throw new Error('docker not found; set its path in /config')
}

async function loadRepo($: EngineInterface) {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { timeoutMs: 5000 }).catch(() => undefined)
  const root = top?.exitCode === 0 ? top.stdout.trim() : ''
  await update($, repoRoot, prev => (prev === root ? prev : root))
  if (root === '') return
  const reflog = await $.process.run(['git', 'reflog', '-n', '50', '--format=%ct %gs'], { timeoutMs: 5000 }).catch(() => undefined)
  const moved = reflog?.exitCode === 0 ? lastHeadMove(reflog.stdout) : 0
  await update($, headMovedAt, prev => (prev === moved ? prev : moved))
}

async function load($: EngineInterface, settings: Settings) {
  if (await read($, isLoading)) return
  await update($, isLoading, () => true)
  polledAt = Date.now()
  try {
    await loadRepo($)
    const ran = await docker($, settings, ['ps', '-a', '--no-trunc', '--format', '{{json .}}'])
    if (ran.exitCode !== 0) throw new Error(ran.stderr.trim().split('\n')[0] || 'docker ps failed')
    await update($, containers, () => parseDockerPs(ran.stdout))
    await update($, lastError, () => '')
    await update($, updatedAt, () => Date.now())
  } catch (err) {
    await update($, containers, () => [])
    await update($, lastError, () => (err instanceof Error ? err.message : String(err)))
  } finally {
    await update($, isLoading, () => false)
  }
}

async function tick($: EngineInterface, settings: Settings) {
  if (!(await isActive($))) return
  const every = (await read($, isOpen)) ? OPEN_POLL_MS : settings.pollMs
  if (Date.now() - polledAt >= every) await load($, settings)
}

async function openPane($: EngineInterface, settings: Settings) {
  const opened = await $.ui.open({ id: PANE_ID, title: 'Docker' })
  if (opened.isPlaced) await update($, isOpen, () => true)
  await load($, settings)
}

async function inTerminal($: EngineInterface, command: string, title: string) {
  try {
    await $.tool.call({ tool: 'mcp__terminal__run_in_terminal', command, title: title.slice(0, 40) })
  } catch (err) {
    $.ui.toast(`Could not open the terminal: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function confirmRecreate($: EngineInterface, row: ContainerRow) {
  try {
    const answer = await $.ui.ask(`Recreate ${row.service} of ${row.project}? The container is replaced; named volumes stay.`, {
      header: 'Recreate',
      options: ['Recreate', 'Cancel'],
    })
    return answer === 'Recreate'
  } catch {
    return false
  }
}

async function act($: EngineInterface, settings: Settings, row: ContainerRow, action: Action) {
  if (action === 'logs') return inTerminal($, logsCommand(row), `logs ${row.name}`)
  if (action === 'recreate') {
    const command = recreateCommand(row)
    if (command !== undefined && (await confirmRecreate($, row))) await inTerminal($, command, `recreate ${row.service}`)
    return
  }
  await update($, busy, () => row.name)
  try {
    const ran = await docker($, settings, [action, row.name], 90_000)
    if (ran.exitCode !== 0) $.ui.toast(`docker ${action} ${row.name}: ${ran.stderr.trim().split('\n')[0] || 'failed'}`)
  } catch (err) {
    $.ui.toast(err instanceof Error ? err.message : String(err))
  } finally {
    await update($, busy, () => '')
  }
  await load($, settings)
}

async function publishChip($: EngineInterface) {
  if (!(await read($, active))) return setChip($, null)
  const rows = await read($, containers)
  const root = await read($, repoRoot)
  const moved = await read($, headMovedAt)
  const up = rows.filter(r => r.state === 'running')
  const stale = up.filter(r => isStale(r, root, moved)).length
  await setChip($, dockerChip(up.length, stale, up.filter(r => !isHealthy(r)).length, (await read($, lastError)) !== ''))
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('state.set', async ($, e, next) => {
    const ran = await next(e)
    if (e.plugin === 'mod-manager' && e.key === 'press') {
      const pressed = e.value as ChipPress | null
      if (pressed?.plugin === MOD && (await isActive($))) await openPane($, settings)
    }
    return ran
  })

  on('session.start', async ($, e, next) => {
    polledAt = 0
    await $.command.register({ name: 'docker', description: 'Open the Docker containers pane' })
    $.clock.every(CHECK_MS, () => void tick($, settings).catch(() => undefined))
    $.clock.every(CHECK_MS, () => void publishChip($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'docker' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await openPane($, settings)
    return { text: 'Docker pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    if (e.id === PANE_ID) await update($, isOpen, () => false)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const ran = await next(e)
    if (/\bdocker\b|\bsail\b|\bgit\s+(checkout|switch|pull|merge|rebase|reset)\b/.test(e.command)) polledAt = 0
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active)) || (await barOwnsChips($))) return next(e)
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const rows = await read($, containers)
    const root = await read($, repoRoot)
    const moved = await read($, headMovedAt)
    const up = rows.filter(r => r.state === 'running')
    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <DockerChip
          ui={ui}
          running={up.length}
          unhealthy={up.filter(r => !isHealthy(r)).length}
          stale={up.filter(r => isStale(r, root, moved)).length}
          isDown={(await read($, lastError)) !== ''}
          onOpen={() => openPane($, settings)}
        />
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
        <DockerPane
          ui={ui}
          width={e.props.bodyColumns}
          containers={await read($, containers)}
          repoRoot={await read($, repoRoot)}
          headMovedAt={await read($, headMovedAt)}
          isLoading={await read($, isLoading)}
          error={await read($, lastError)}
          updatedAt={await read($, updatedAt)}
          busy={await read($, busy)}
          hideStopped={await read($, hideStopped)}
          now={Date.now()}
          onRefresh={() => load($, settings)}
          onToggleStopped={() => update($, hideStopped, prev => !prev)}
          onAction={(row, action) => act($, settings, row, action)}
        />
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      $.ui.log(`docker-pane render failed: ${message}`)
      return <PaneError ui={ui} message={message} onRefresh={() => load($, settings)} />
    }
  })
}
