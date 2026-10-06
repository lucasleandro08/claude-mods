import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModEntry } from '../types'
import { enabledKey, entries } from '../src/catalog'
import { ModsChip } from '../ui/chip'
import { ModsPane } from '../ui/pane'

const PANE_ID = 'mod-manager'

const revision = atom({ plugin: 'mod-manager', key: 'revision' } as const, 0)
const lastError = atom({ plugin: 'mod-manager', key: 'lastError' } as const, '')

async function loadMods($: EngineInterface) {
  await read($, revision)
  return entries(await $.config.list())
}

async function toggle($: EngineInterface, mod: ModEntry) {
  const result = await $.config.set({ key: enabledKey(mod.name), value: mod.state !== 'on' })
  await update($, lastError, () => (result.deny === undefined ? '' : `${mod.title}: ${result.deny}`))
  await update($, revision, n => n + 1)
}

async function openPane($: EngineInterface) {
  await update($, revision, n => n + 1)
  await $.ui.open({ id: PANE_ID, title: 'Mods' })
}

export const register: Register = (on, options) => {
  const showChip = options.showChip !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Turn the claude-mods on and off' })
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
    <ModsPane ui={$.ui.resolve(e)} mods={await loadMods($)} error={await read($, lastError)} onToggle={mod => toggle($, mod)} />
  ))
}
