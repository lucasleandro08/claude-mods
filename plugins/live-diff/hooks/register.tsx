import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hunk } from '../types'
import { diffLines, hasChanges, lineOf } from '../src/diff'
import { DiffChip, diffChip } from '../ui/chip'
import { DiffPane, PaneError } from '../ui/pane'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'
import { barIsLive, sameChip, type Chip, type ChipPress } from '../src/shared/chip'

const MOD = 'live-diff'
const CHECK_MS = 5000
const active = atom({ plugin: 'live-diff', key: 'active' } as const, false)
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

const chip = atom({ plugin: 'live-diff', key: 'chip' } as const, null)

async function barOwnsChips($: EngineInterface) {
  const { value } = await $.state.get({ plugin: 'mod-manager', key: 'bar' })
  return barIsLive(value, Date.now())
}

async function setChip($: EngineInterface, next: Chip | null) {
  await update($, chip, prev => (sameChip(prev, next) ? prev : next))
}

const PANE_ID = 'live-diff'

const hunks = atom({ plugin: 'live-diff', key: 'hunks' } as const, [])
const selected = atom({ plugin: 'live-diff', key: 'selected' } as const, null)

async function readOrUndefined($: EngineInterface, path: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE_ID, title: 'Diff' })
}

async function record($: EngineInterface, hunk: Hunk, maxEdits: number) {
  if (!hasChanges(hunk)) return
  await update($, hunks, list => [hunk, ...list].slice(0, maxEdits))
  await publishChip($)
}

async function publishChip($: EngineInterface) {
  await setChip($, (await read($, active)) ? diffChip((await read($, hunks)).length) : null)
}

export const register: Register = (on, options) => {
  const contextLines = Number(options.contextLines ?? 2)
  const maxEdits = Number(options.maxEdits ?? 100)

  on('state.set', async ($, e, next) => {
    const ran = await next(e)
    if (e.plugin === 'mod-manager' && e.key === 'press') {
      const pressed = e.value as ChipPress | null
      if (pressed?.plugin === MOD && (await isActive($))) await openPane($)
    }
    return ran
  })

  on('session.start', async ($, e, next) => {
    void isActive($)
    $.clock.every(CHECK_MS, () => void isActive($))
    await $.command.register({ name: 'diff', description: 'Open the live diff pane' })
    await $.command.register({ name: 'diff-clear', description: 'Clear the live diff pane' })

    $.clock.every(CHECK_MS, () => void publishChip($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'diff' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await openPane($)
    return { text: 'Diff pane opened.' }
  })

  on('command.run', { command: 'diff-clear' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await update($, hunks, () => [])
    return { text: 'Diff pane cleared.' }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const before = await readOrUndefined($, e.file_path)
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    await record($, {
      id: e.tool_use_id,
      path: e.file_path,
      tool: 'Edit',
      isNewFile: false,
      lines: diffLines(e.old_string, e.new_string, before ? lineOf(before, e.old_string) : 1, contextLines),
    }, maxEdits)
    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const before = await readOrUndefined($, e.file_path)
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    await record($, {
      id: e.tool_use_id,
      path: e.file_path,
      tool: 'Write',
      isNewFile: before === undefined,
      lines: diffLines(before ?? '', e.content, 1, contextLines),
    }, maxEdits)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active)) || (await barOwnsChips($))) return next(e)
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const ui = $.ui.resolve(e)
    const count = (await read($, hunks)).length

    return (
      <ui.Box flexDirection="column">
        <DiffChip ui={ui} count={count} onOpen={() => openPane($)} />
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
        <DiffPane
          ui={ui}
          width={e.props.bodyColumns}
          hunks={await read($, hunks)}
          selected={await read($, selected)}
          onPick={path => update($, selected, () => path)}
          onClear={() => update($, hunks, () => [])}
        />
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      $.ui.log(`live-diff render failed: ${message}`)
      return <PaneError ui={ui} message={message} />
    }
  })
}
