import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModEntry, Notice } from '../types'
import { entries, installCommand, readInstalled } from '../src/catalog'
import { claudeCandidates, installArgs, readInstallResult } from '../src/install'
import { MARKETPLACE, parseState, serializeState, statePath, withToggle } from '../src/shared/toggle'
import { ModsChip } from '../ui/chip'
import { ModsPane } from '../ui/pane'

const PANE_ID = 'mod-manager'
const VERSION = '2.2.0'
const REFRESH_MS = 10_000

const mods = atom({ plugin: 'mod-manager', key: 'mods' } as const, [] as ModEntry[])
const lastError = atom({ plugin: 'mod-manager', key: 'lastError' } as const, '')
const installing = atom({ plugin: 'mod-manager', key: 'installing' } as const, [])
const notices = atom({ plugin: 'mod-manager', key: 'notices' } as const, {})
const marketplace = atom({ plugin: 'mod-manager', key: 'marketplace' } as const, MARKETPLACE)

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

async function install($: EngineInterface, claudePath: string, name: string) {
  await update($, installing, list => [...list, name])
  await setNotice($, name, { tone: 'info', text: 'Installing…' })
  try {
    const result = await runInstall($, claudePath, name)
    if (result) {
      await setNotice($, name, result)
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
  for (const name of names) {
    if (!(await install($, claudePath, name))) return
  }
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
    await openPane($)
    return { text: 'Mods pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (!showChip || e.props.hasSurvey) return rest

    const list = await read($, mods)
    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ModsChip ui={ui} on={list.filter(m => m.state === 'on').length} total={list.length || 8} onOpen={() => openPane($)} />
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
    />
  ))
}
