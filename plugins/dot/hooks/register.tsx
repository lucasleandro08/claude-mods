import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Goal, Profile } from '../types'
import {
  addGoal, allowRules, answerGoal, BRIEFING_TASK, briefingCron, briefingPrompt, DEFAULT_PROFILE, DEFAULT_RULES, dotPaths, everyMinutesCron,
  IDLE_ROUND, newlyWaiting, parseGoals, parseRound, stampChanged, stampRound, parseProfile, removeGoal, serialize, setStatus, taskPointer, WORK_TASK, workPrompt,
} from '../src/dot'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'
import { barIsLive, sameChip, type Chip, type ChipPress } from '../src/shared/chip'
import { DRACULA } from '../src/shared/theme'
import { dotChip } from '../ui/chip'
import { DotPane, PaneError } from '../ui/pane'

const MOD = 'dot'
const CHECK_MS = 5000
const active = atom({ plugin: 'dot', key: 'active' } as const, false)
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


const chip = atom({ plugin: 'dot', key: 'chip' } as const, null)

async function barOwnsChips($: EngineInterface) {
  const { value } = await $.state.get({ plugin: 'mod-manager', key: 'bar' })
  return barIsLive(value, Date.now())
}

async function setChip($: EngineInterface, next: Chip | null) {
  await update($, chip, prev => (sameChip(prev, next) ? prev : next))
}

const PANE_ID = 'dot'
const USAGE = 'Usage: /dot · /dot <goal> · /dot pause | resume | run | on · /dot name <name> [emoji]'

const profile = atom({ plugin: 'dot', key: 'profile' } as const, DEFAULT_PROFILE)
const goals = atom({ plugin: 'dot', key: 'goals' } as const, [])
const round = atom({ plugin: 'dot', key: 'round' } as const, IDLE_ROUND)
const isOpen = atom({ plugin: 'dot', key: 'isOpen' } as const, false)
const notice = atom({ plugin: 'dot', key: 'notice' } as const, null)
const showSettings = atom({ plugin: 'dot', key: 'showSettings' } as const, false)
type Settings = { everyMinutes: number; briefing: string; openOnStart: boolean }

function readSettings(options: PluginOptions): Settings {
  return {
    everyMinutes: Math.max(5, Number(options.workEveryMinutes ?? 30) || 30),
    briefing: String(options.briefingTime ?? '09:00'),
    openOnStart: options.openOnStart !== false,
  }
}

async function paths($: EngineInterface) {
  return dotPaths((await $.env.get('HOME')) ?? '')
}

async function readText($: EngineInterface, path: string) {
  return $.fs.read(path).catch(() => undefined)
}

async function ensureFiles($: EngineInterface, settings?: Settings) {
  const p = await paths($)
  const stored = await readText($, p.profile)
  const current = stored === undefined && settings
    ? { ...parseProfile(''), everyMinutes: settings.everyMinutes, briefing: briefingCron(settings.briefing) ? settings.briefing : '' }
    : parseProfile(stored ?? '')
  if ((await readText($, p.profile)) === undefined) await $.fs.write(p.profile, serialize(current))
  if ((await readText($, p.goals)) === undefined) await $.fs.write(p.goals, serialize([]))
  if ((await readText($, p.memory)) === undefined) await $.fs.write(p.memory, '# Memory\n')
  if ((await readText($, p.rules)) === undefined) await $.fs.write(p.rules, DEFAULT_RULES)
  await $.fs.write(p.work, `${workPrompt(current.name, p)}\n`)
  await $.fs.write(p.briefing, `${briefingPrompt(current.name, p)}\n`)
  return p
}

async function publishChip($: EngineInterface) {
  await setChip($, (await read($, active)) ? dotChip(await read($, profile), await read($, goals)) : null)
}

async function sync($: EngineInterface) {
  if (!(await isActive($))) return publishChip($)
  const p = await paths($)
  const nextProfile = parseProfile((await readText($, p.profile)) ?? '')
  const before = await read($, goals)
  const stamped = stampChanged(before, parseGoals((await readText($, p.goals)) ?? '[]'), Date.now())
  const nextGoals = stamped.goals
  if (stamped.changed) await $.fs.write(p.goals, serialize(nextGoals))
  await update($, profile, prev => (JSON.stringify(prev) === JSON.stringify(nextProfile) ? prev : nextProfile))
  await update($, goals, prev => (JSON.stringify(prev) === JSON.stringify(nextGoals) ? prev : nextGoals))
  const stampedRound = stampRound(await read($, round), parseRound((await readText($, p.round)) ?? ''), Date.now())
  if (stampedRound.changed) await $.fs.write(p.round, serialize(stampedRound.round))
  await update($, round, prev => (JSON.stringify(prev) === JSON.stringify(stampedRound.round) ? prev : stampedRound.round))
  await publishChip($)
  for (const goal of newlyWaiting(before, nextGoals)) if (before.length > 0) $.ui.toast(`${nextProfile.emoji} ${nextProfile.name}: ${goal.question || goal.title}`, { timeoutMs: 10_000 })
}

async function changeGoals($: EngineInterface, change: (list: Goal[], now: number) => Goal[]) {
  const p = await ensureFiles($)
  const next = change(parseGoals((await readText($, p.goals)) ?? '[]'), Date.now())
  await $.fs.write(p.goals, serialize(next))
  await update($, goals, () => next)
}

async function changeProfile($: EngineInterface, change: (current: Profile) => Profile) {
  const p = await ensureFiles($)
  const next = change(parseProfile((await readText($, p.profile)) ?? ''))
  await $.fs.write(p.profile, serialize(next))
  await update($, profile, () => next)
  await ensureFiles($)
}

async function say($: EngineInterface, tone: 'ok' | 'error' | 'info', text: string) {
  await update($, notice, () => ({ tone, text }))
}

// The scheduled-tasks tools belong to the desktop app; a refused or failed call resolves with isError instead of throwing
async function callTool($: EngineInterface, tool: string, input: Record<string, unknown>) {
  try {
    const ran = (await $.tool.call({ tool, ...input } as never)) as { isError?: boolean; deny?: string } | undefined
    return ran?.isError !== true && ran?.deny === undefined
  } catch {
    return false
  }
}

async function upsertTask($: EngineInterface, taskId: string, title: string, cron: string, promptPath: string) {
  const fields = { taskId, title, cronExpression: cron, prompt: taskPointer(promptPath), notifyOnCompletion: false }
  if (await callTool($, 'mcp__scheduled-tasks__update_scheduled_task', { ...fields, enabled: true })) return true
  return callTool($, 'mcp__scheduled-tasks__create_scheduled_task', { ...fields, description: `${title} (dot mod)` })
}

async function schedule($: EngineInterface, settings: Settings) {
  const p = await ensureFiles($, settings)
  const me = parseProfile((await readText($, p.profile)) ?? '')
  await update($, profile, () => me)
  const workCron = everyMinutesCron(me.everyMinutes)
  const morning = briefingCron(me.briefing)
  const worked = await upsertTask($, WORK_TASK, `${me.name} · work`, workCron, p.work)
  const briefed = morning === undefined || (await upsertTask($, BRIEFING_TASK, `${me.name} · briefing`, morning, p.briefing))
  if (worked && briefed) {
    await changeProfile($, current => ({ ...current, scheduled: true, paused: false }))
    return say($, 'ok', `${me.name} now works in the background, every ${me.everyMinutes} min.`)
  }
  const ask = [
    `Set up the background work of my dot ${me.name} with the scheduled-tasks tools (create, or update if it exists):`,
    `- taskId "${WORK_TASK}", cron "${workCron}", prompt "${taskPointer(p.work)}"`,
    morning ? `- taskId "${BRIEFING_TASK}", cron "${morning}", prompt "${taskPointer(p.briefing)}"` : '',
    `Then set "scheduled": true in ${p.profile}, and add ${allowRules().map(rule => `"${rule}"`).join(', ')} to permissions.allow in my user settings so rounds never wait for an approval.`,
  ].filter(Boolean).join('\n')
  const filled = await $.prompt.fill({ text: ask, mode: 'replace' }).catch(() => ({ isFilled: false }))
  await say($, filled.isFilled ? 'info' : 'error', filled.isFilled ? 'The setup request is in your prompt. Press Enter to finish it.' : "The scheduling tools aren't reachable from here. Run /dot on in a session of the desktop app.")
}

async function setEvery($: EngineInterface, minutes: number) {
  await changeProfile($, current => ({ ...current, everyMinutes: minutes }))
  const me = await read($, profile)
  if (!me.scheduled) return say($, 'info', `Rounds set to every ${minutes} min. Turn on background work to start them.`)
  const ok = await upsertTask($, WORK_TASK, `${me.name} · work`, everyMinutesCron(minutes), (await paths($)).work)
  await say($, ok ? 'ok' : 'error', ok ? `Rounds now run every ${minutes} min.` : "Couldn't change the schedule. Try again from a desktop app session.")
}

async function setBriefing($: EngineInterface, time: string) {
  const value = time === 'off' ? '' : time
  await changeProfile($, current => ({ ...current, briefing: value }))
  const me = await read($, profile)
  if (!me.scheduled) return
  const cron = briefingCron(value)
  const ok = cron === undefined
    ? await callTool($, 'mcp__scheduled-tasks__update_scheduled_task', { taskId: BRIEFING_TASK, enabled: false })
    : await upsertTask($, BRIEFING_TASK, `${me.name} · briefing`, cron, (await paths($)).briefing)
  await say($, ok ? 'ok' : 'error', ok ? (cron ? `Weekday briefing at ${value}.` : 'Briefing turned off.') : "Couldn't change the briefing. Try again from a desktop app session.")
}

async function togglePause($: EngineInterface) {
  const paused = !(await read($, profile)).paused
  await changeProfile($, current => ({ ...current, paused }))
  for (const taskId of [WORK_TASK, BRIEFING_TASK]) await callTool($, 'mcp__scheduled-tasks__update_scheduled_task', { taskId, enabled: !paused })
  await say($, 'info', paused ? 'Paused. No rounds run until you resume.' : 'Resumed. The next round picks up the queue.')
}

async function runNow($: EngineInterface) {
  const me = await read($, profile)
  if (!me.scheduled) return say($, 'error', 'Background work is off. Turn it on first.')
  const ran = await callTool($, 'mcp__scheduled-tasks__run_scheduled_task', { taskId: WORK_TASK })
  await say($, ran ? 'ok' : 'error', ran
    ? 'A round started. Progress shows up here as it works.'
    : `A round is already running or waiting for your approval. Open the "${me.name} · work" session in the sidebar.`)
}

// A new message or reply starts a round at once instead of waiting for the schedule; a round already running picks it up
async function startSoon($: EngineInterface) {
  const me = await read($, profile)
  if (!me.scheduled || me.paused || (await read($, round)).state === 'running') return
  await callTool($, 'mcp__scheduled-tasks__run_scheduled_task', { taskId: WORK_TASK })
}

async function openPane($: EngineInterface) {
  await ensureFiles($)
  const opened = await $.ui.open({ id: PANE_ID, title: (await read($, profile)).name })
  if (opened.isPlaced) await update($, isOpen, () => true)
  await sync($)
}

async function press($: EngineInterface, pressed: ChipPress | null) {
  if (pressed?.plugin === MOD && (await isActive($))) await openPane($)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('state.set', async ($, e, next) => {
    const ran = await next(e)
    if (e.plugin === 'mod-manager' && e.key === 'press') await press($, e.value as ChipPress | null)
    return ran
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dot', description: 'Your always-on assistant: /dot, /dot <goal>, /dot pause|resume|run|on' })
    $.clock.every(CHECK_MS, () => void sync($).catch(() => undefined))
    if (settings.openOnStart) $.clock.after(1000, () => void isActive($).then(enabled => (enabled ? openPane($) : undefined)).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'dot' }, async ($, e) => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    const args = e.args.trim()
    const [verb = '', ...rest] = args.split(/\s+/)
    const me = await read($, profile)

    if (args === '') {
      await openPane($)
      return { text: `${me.emoji} ${me.name} opened.` }
    }
    if (verb === 'pause' || verb === 'resume') {
      if (me.paused === (verb === 'pause')) return { text: `${me.name} is already ${me.paused ? 'paused' : 'running'}.` }
      await togglePause($)
      return { text: `${me.name} ${verb === 'pause' ? 'paused' : 'resumed'}.` }
    }
    if (verb === 'run') {
      await runNow($)
      return { text: (await read($, notice))?.text ?? '' }
    }
    if (verb === 'on') {
      await schedule($, settings)
      return { text: (await read($, notice))?.text ?? '' }
    }
    if (verb === 'name') {
      const [name, emoji] = rest
      if (!name) return { text: USAGE }
      await changeProfile($, current => ({ ...current, name, emoji: emoji ?? current.emoji }))
      return { text: `Renamed to ${emoji ?? me.emoji} ${name}.` }
    }
    await changeGoals($, (list, now) => addGoal(list, args, now))
    await startSoon($)
    return { text: `${me.emoji} ${me.name} is on it: ${args}` }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID) await update($, isOpen, () => false)
    return next(e)
  })

  // Only a tile in the mods bar (or one line without it); the dot itself lives in its own pane
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active)) || (await barOwnsChips($))) return next(e)
    const rest = await next(e)
    const own = await read($, chip)
    if (e.props.hasSurvey || !own) return rest

    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ui.Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
          <ui.Text color={DRACULA.purple}>{own.icon}</ui.Text>
          <ui.Button key="open-dot" label={`${(await read($, profile)).name} · ${own.parts[0]?.text ?? ''}`} dimColor onPress={() => openPane($)} />
        </ui.Box>
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
        <DotPane
          ui={ui}
          profile={await read($, profile)}
          goals={await read($, goals)}
          round={await read($, round)}
          now={Date.now()}
          notice={await read($, notice)}
          dotDir={(await paths($)).dir}
          showSettings={await read($, showSettings)}
          onToggleSettings={() => update($, showSettings, open => !open)}
          onAdd={async title => {
            await changeGoals($, (list, now) => addGoal(list, title, now))
            await startSoon($)
          }}
          onAnswer={async (id, answer) => {
            await changeGoals($, (list, now) => answerGoal(list, id, answer, now))
            await startSoon($)
          }}
          onDone={id => changeGoals($, (list, now) => setStatus(list, id, 'done', now))}
          onRemove={id => changeGoals($, list => removeGoal(list, id))}
          onPause={() => togglePause($)}
          onRunNow={() => runNow($)}
          onSchedule={() => schedule($, settings)}
          onEvery={minutes => setEvery($, minutes)}
          onBriefing={time => setBriefing($, time)}
        />
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      $.ui.log(`dot render failed: ${message}`)
      return <PaneError ui={ui} message={message} />
    }
  })
}
