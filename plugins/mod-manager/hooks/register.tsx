import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModEntry, Notice } from '../types'
import { enabledKey, entries, installCommand } from '../src/catalog'
import { claudeCandidates, installArgs, readInstallResult } from '../src/install'
import { ModsChip } from '../ui/chip'
import { ModsPane } from '../ui/pane'

const PANE_ID = 'mod-manager'

const revision = atom({ plugin: 'mod-manager', key: 'revision' } as const, 0)
const lastError = atom({ plugin: 'mod-manager', key: 'lastError' } as const, '')
const installing = atom({ plugin: 'mod-manager', key: 'installing' } as const, [])
const notices = atom({ plugin: 'mod-manager', key: 'notices' } as const, {})

async function loadMods($: EngineInterface) {
  await read($, revision)
  return entries(await $.config.list())
}

async function setNotice($: EngineInterface, name: string, notice: Notice) {
  await update($, notices, prev => ({ ...prev, [name]: notice }))
}

async function toggle($: EngineInterface, mod: ModEntry) {
  const result = await $.config.set({ key: enabledKey(mod.name), value: mod.state !== 'on' })
  await update($, lastError, () => (result.deny === undefined ? '' : `${mod.title}: ${result.deny}`))
  await update($, revision, n => n + 1)
}

async function runInstall($: EngineInterface, claudePath: string, name: string) {
  for (const bin of claudeCandidates(await $.env.get('HOME'), claudePath)) {
    try {
      const ran = await $.process.run([bin, ...installArgs(name)], { timeoutMs: 120_000 })
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
    const filled = await $.prompt.fill({ text: installCommand(name), mode: 'replace' })
    await setNotice($, name, {
      tone: 'info',
      text: filled.isFilled
        ? 'claude CLI not found: the install command is in your prompt, press Enter.'
        : `claude CLI not found: run ${installCommand(name)} or set its path in /config.`,
    })
    return false
  } finally {
    await update($, installing, list => list.filter(n => n !== name))
    await update($, revision, n => n + 1)
  }
}

async function installAll($: EngineInterface, claudePath: string, names: readonly string[]) {
  for (const name of names) {
    const ok = await install($, claudePath, name)
    if (!ok) return
  }
}

async function openPane($: EngineInterface) {
  await update($, revision, n => n + 1)
  await $.ui.open({ id: PANE_ID, title: 'Mods' })
}

export const register: Register = (on, options) => {
  const showChip = options.showChip !== false
  const claudePath = String(options.claudePath ?? '')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Install the claude-mods and turn them on and off' })
    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await openPane($)
    return { text: 'Mods pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (!showChip || e.props.hasSurvey) return rest

    const mods = await loadMods($)
    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ModsChip ui={ui} on={mods.filter(m => m.state === 'on').length} total={mods.length} onOpen={() => openPane($)} />
        {rest}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => (
    <ModsPane
      ui={$.ui.resolve(e)}
      mods={await loadMods($)}
      error={await read($, lastError)}
      installing={await read($, installing)}
      notices={await read($, notices)}
      onToggle={mod => toggle($, mod)}
      onInstall={mod => install($, claudePath, mod.name)}
      onInstallAll={names => installAll($, claudePath, names)}
    />
  ))
}
