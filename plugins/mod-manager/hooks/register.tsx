import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModEntry, Notice } from '../types'
import { entries, installCommand, readInstalled } from '../src/catalog'
import { claudeCandidates, installArgs, readInstallResult } from '../src/install'
import { MARKETPLACE, parseState, serializeState, statePath, withToggle } from '../src/shared/toggle'
import { ModsBar, modsChip, type BarEntry } from '../ui/chip'
import type { Chip } from '../src/shared/chip'
import { ModsPane } from '../ui/pane'

const PANE_ID = 'mod-manager'
const VERSION = '2.6.2'
const REFRESH_MS = 10_000
const BAR_BEAT_MS = 10_000

const mods = atom({ plugin: 'mod-manager', key: 'mods' } as const, [] as ModEntry[])
const lastError = atom({ plugin: 'mod-manager', key: 'lastError' } as const, '')
const installing = atom({ plugin: 'mod-manager', key: 'installing' } as const, [])
const notices = atom({ plugin: 'mod-manager', key: 'notices' } as const, {})
const marketplace = atom({ plugin: 'mod-manager', key: 'marketplace' } as const, MARKETPLACE)
// A heartbeat, not a flag: if the manager goes away, the other mods see it stale and draw their own chips again
const bar = atom({ plugin: 'mod-manager', key: 'bar' } as const, 0)
const press = atom({ plugin: 'mod-manager', key: 'press' } as const, null)

// Refs must be literals, so each mod's chip is read by name; a mod that is not loaded reads undefined
async function readChips($: EngineInterface): Promise<BarEntry[]> {
  const found: [string, Chip | null | undefined][] = [
    ['live-diff', (await $.state.get({ plugin: 'live-diff', key: 'chip' })).value],
    ['kube-pane', (await $.state.get({ plugin: 'kube-pane', key: 'chip' })).value],
    ['pr-pane', (await $.state.get({ plugin: 'pr-pane', key: 'chip' })).value],
    ['aws-profile', (await $.state.get({ plugin: 'aws-profile', key: 'chip' })).value],
    ['docker-pane', (await $.state.get({ plugin: 'docker-pane', key: 'chip' })).value],
    ['deploy-watch', (await $.state.get({ plugin: 'deploy-watch', key: 'chip' })).value],
    ['worktrees', (await $.state.get({ plugin: 'worktrees', key: 'chip' })).value],
    ['dot', (await $.state.get({ plugin: 'dot', key: 'chip' })).value],
  ]
  return found.flatMap(([plugin, chip]) => (chip ? [{ plugin, chip }] : []))
}

async function pressChip($: EngineInterface, plugin: string, action: string) {
  if (plugin === 'mod-manager') return openPane($)
  await update($, press, () => ({ plugin, action, at: Date.now() }))
}

async function stateFile($: EngineInterface) {
  return statePath(await $.env.get('HOME').catch(() => undefined))
}

async function readState($: EngineInterface) {
  return parseState(await $.fs.read(await stateFile($)).catch(() => ''))
}

async function refreshMods($: EngineInterface) {
  const settings = await $.settings.read().catch(() => ({}))
  const envDirs = await $.env.get('CLAUDE_CODE_PLUGIN_DIRS').catch(() => undefined)
  const home = await $.env.get('HOME').catch(() => undefined)
  const known = await $.fs.read(`${home ?? ''}/.claude/plugins/known_marketplaces.json`).catch(() => '')
  const installedJson = await $.fs.read(`${home ?? ''}/.claude/plugins/installed_plugins.json`).catch(() => '')
  const installed = readInstalled(settings, envDirs, known, installedJson)
  await update($, marketplace, prev => (prev === installed.marketplaces[0] ? prev : (installed.marketplaces[0] ?? MARKETPLACE)))
  const next = entries(installed, await readState($))
  await update($, mods, prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  return next
}

async function setNotice($: EngineInterface, name: string, notice: Notice) {
  await update($, notices, prev => ({ ...prev, [name]: notice }))
}

async function toggle($: EngineInterface, mod: ModEntry) {
  try {
    const next = withToggle(await readState($), mod.name, mod.state !== 'on')
    await $.fs.write(await stateFile($), serializeState(next))
    await update($, lastError, () => '')
  } catch (err) {
    await update($, lastError, () => `${mod.title}: ${err instanceof Error ? err.message : String(err)}`)
  }
  await refreshMods($)
}

async function runInstall($: EngineInterface, claudePath: string, name: string) {
  for (const bin of claudeCandidates(await $.env.get('HOME').catch(() => undefined), claudePath)) {
    try {
      const ran = await $.process.run([bin, ...installArgs(name, await read($, marketplace))], { timeoutMs: 120_000 })
      return readInstallResult(ran.exitCode, ran.stdout, ran.stderr)
    } catch {
      continue
    }
  }
  return undefined
}

// /reload-plugins picks up new installs and code edits in this session; it cannot run inside the hook a turn waits on
function reloadPlugins($: EngineInterface) {
  const byHand = async () => {
    const filled = await $.prompt.fill({ text: '/reload-plugins', mode: 'replace' }).catch(() => ({ isFilled: false }))
    if (!filled.isFilled) $.ui.toast('Run /reload-plugins to load the change.')
  }
  $.clock.after(0, () => {
    void $.command.run({ command: 'reload-plugins', args: '' } as never)
      .then(ran => (/(isn['’]t|not) available|unknown/i.test(String((ran as { text?: string }).text ?? '')) ? byHand() : undefined))
      .catch(byHand)
  })
}

async function install($: EngineInterface, claudePath: string, name: string, reload = true) {
  await update($, installing, list => [...list, name])
  await setNotice($, name, { tone: 'info', text: 'Installing…' })
  try {
    const result = await runInstall($, claudePath, name)
    if (result) {
      await setNotice($, name, result)
      if (result.tone === 'ok' && reload) reloadPlugins($)
      return result.tone === 'ok'
    }
    const command = installCommand(name, await read($, marketplace))
    const filled = await $.prompt.fill({ text: command, mode: 'replace' })
    await setNotice($, name, {
      tone: 'info',
      text: filled.isFilled
        ? 'claude CLI not found: the install command is in your prompt, press Enter.'
        : `claude CLI not found: run ${command} or set its path in /config.`,
    })
    return false
  } finally {
    await update($, installing, list => list.filter(n => n !== name))
    await refreshMods($)
  }
}

async function installAll($: EngineInterface, claudePath: string, names: readonly string[]) {
  let installed = 0
  for (const name of names) {
    if (!(await install($, claudePath, name, false))) break
    installed++
  }
  if (installed > 0) reloadPlugins($)
}

async function openPane($: EngineInterface) {
  await refreshMods($)
  await $.ui.open({ id: PANE_ID, title: 'Mods' })
}

async function start($: EngineInterface, openOnStart: boolean) {
  const current = await refreshMods($)
  if (openOnStart && !current.some(m => m.state === 'on')) await $.ui.open({ id: PANE_ID, title: 'Mods' })
}

export const register: Register = (on, options) => {
  const showChip = options.showChip !== false
  const claudePath = String(options.claudePath ?? '')
  const openOnStart = options.openOnStart !== false

  on('session.start', async ($, e, next) => {
    const beat = () => (showChip ? update($, bar, () => Date.now()) : undefined)
    await beat()
    $.clock.every(BAR_BEAT_MS, () => void beat())
    await $.command.register({ name: 'mods', description: 'Install the Dracula mods and turn them on and off' })
    void start($, openOnStart).catch(() => undefined)
    $.clock.every(REFRESH_MS, () => void refreshMods($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'mods' }, async ($, e) => {
    if (e.args.trim() === 'status') {
      const list = await refreshMods($)
      return {
        text: [
          `mod-manager ${VERSION}, marketplace "${await read($, marketplace)}"`,
          ...list.map(m => `${m.state.padEnd(8)} ${m.name}`),
        ].join('\n'),
      }
    }
    if (e.args.trim() === 'reload') {
      reloadPlugins($)
      return { text: 'Reloading plugins…' }
    }
    await openPane($)
    return { text: 'Mods pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (!showChip || e.props.hasSurvey) return rest

    const list = await read($, mods)
    const own = { plugin: 'mod-manager', chip: modsChip(list.filter(m => m.state === 'on').length, list.length) }
    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ModsBar ui={ui} entries={[own, ...(await readChips($))]} onPress={(plugin, action) => pressChip($, plugin, action)} />
        {rest}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => (
    <ModsPane
      ui={$.ui.resolve(e)}
      mods={await read($, mods)}
      version={VERSION}
      error={await read($, lastError)}
      installing={await read($, installing)}
      notices={await read($, notices)}
      onToggle={mod => toggle($, mod)}
      onInstall={mod => install($, claudePath, mod.name)}
      onInstallAll={names => installAll($, claudePath, names)}
      onReload={() => reloadPlugins($)}
    />
  ))
}
