import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hunk } from '../types'
import { diffLines, hasChanges, lineOf } from '../src/diff'
import { DiffChip } from '../ui/chip'
import { DiffPane, PaneError } from '../ui/pane'

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
}

export const register: Register = (on, options) => {
  if (options.enabled !== true) return

  const contextLines = Number(options.contextLines ?? 2)
  const maxEdits = Number(options.maxEdits ?? 100)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'diff', description: 'Open the live diff pane' })
    await $.command.register({ name: 'diff-clear', description: 'Clear the live diff pane' })

    return next(e)
  })

  on('command.run', { command: 'diff' }, async $ => {
    await openPane($)
    return { text: 'Diff pane opened.' }
  })

  on('command.run', { command: 'diff-clear' }, async $ => {
    await update($, hunks, () => [])
    return { text: 'Diff pane cleared.' }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
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
