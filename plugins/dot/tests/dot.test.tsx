import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { avatarSvg } from '../src/avatar'
import { activityOf, addGoal, answerGoal, briefingCron, everyMinutesCron, moodOf, newlyWaiting, parseGoals, parseProfile, stampChanged, parseRound, stampRound, nextRoundAt, clock, splitLinks } from '../src/dot'

const HOME = '/home/dev'
const DIR = `${HOME}/.claude-dot`
const STATE = JSON.stringify({ enabled: { dot: true } })
const PANE = { title: 'Vlad', isFocused: false, bodyColumns: 90, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

function disk(on: On, files: Record<string, string>, opened?: string[]) {
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.read', ($, e) => {
    if (e.path.endsWith('dracula-mods.json')) return { value: STATE }
    const text = files[e.path]
    return text === undefined ? { deny: 'missing' } : { value: text }
  })
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    opened?.push(e.id)
    return { value: { isPlaced: true } }
  })
  return files
}

const goalsOf = (files: Record<string, string>) => parseGoals(files[`${DIR}/goals.json`] ?? '[]')

describe('dot', () => {
  test('/dot <goal> queues it and writes the instructions the rounds follow', async ($, on) => {
    const files = disk(on, {})
    const res = await $.command.run({ command: 'dot', args: 'review the open PRs of the team' } as never)
    expect(JSON.stringify(res)).toContain('new goal')
    expect(goalsOf(files).map(g => [g.title, g.status])).toEqual([['review the open PRs of the team', 'queued']])
    expect(files[`${DIR}/work.md`]).toContain('You are Vlad')
    expect(files[`${DIR}/rules.md`]).toContain('Hand off to the user')
    expect(files[`${DIR}/memory.md`]).toBeDefined()
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`pane groups goals and answers a question on ${surface}`, async ($, on) => {
      const files = disk(on, {
        [`${DIR}/goals.json`]: JSON.stringify([
          { id: 'a', title: 'ship the fix', status: 'waiting', notes: ['tests green'], question: 'Can I push to staging?', createdAt: 1, updatedAt: 3 },
          { id: 'b', title: 'read the RFC', status: 'working', notes: ['halfway'], question: '', createdAt: 1, updatedAt: 2 },
          { id: 'c', title: 'old task', status: 'done', notes: [], question: '', createdAt: 1, updatedAt: 1 },
        ]),
      })
      await $.command.run({ command: 'dot', args: '' } as never)
      const pane = await $.ui.mount({ plugin: 'dot', surface, component: 'Pane', requestId: 'dot', props: PANE })
      expect(await pane.find({ text: 'Vlad' })).toBeDefined()
      expect(await pane.find({ text: 'Can I push to staging?' })).toBeDefined()
      expect(await pane.find({ text: 'Vlad needs your answer' })).toBeDefined()
      expect(await pane.find({ text: 'halfway' })).toBeDefined()
      expect(await pane.find({ text: 'Done, but Vlad left no reply' })).toBeDefined()
      expect(await pane.find({ text: 'read the RFC' })).toBeDefined()
      expect(await pane.find({ text: 'Vlad continues in the next round · ' + clock(nextRoundAt(30, Date.now())) })).toBeDefined()
      if (surface === 'desktop') expect((await pane.find({ type: 'Svg' }))?.props.source).toContain('<svg')
      expect(JSON.stringify(await pane.drawn()).length < 100_000).toBe(true)

      if (surface === 'desktop') {
        await pane.input({ key: 'answer-a-1', text: 'yes, staging only', kind: 'submit' })
        const answered = goalsOf(files).find(g => g.id === 'a')
        expect(answered?.status).toBe('queued')
        expect(answered?.notes.at(-1)).toBe('You: yes, staging only')
      }
    })
  }

  test('turning background work on schedules the work and briefing rounds', { options: { workEveryMinutes: 20, briefingTime: '08:30' } }, async ($, on) => {
    const files = disk(on, {})
    const calls: string[] = []
    on('tool.call', { tool: 'mcp__scheduled-tasks__update_scheduled_task' }, ($, e) => {
      const input = e as unknown as { taskId: string; cronExpression?: string; prompt?: string }
      calls.push(`update ${input.taskId} ${input.cronExpression} ${input.prompt}`)
      return { result: {} as never }
    })
    const res = await $.command.run({ command: 'dot', args: 'on' } as never)
    expect(JSON.stringify(res)).toContain('works in the background')
    expect(calls).toEqual([
      `update dot-work */20 * * * * Read ${DIR}/work.md and follow it exactly.`,
      `update dot-briefing 30 8 * * 1-5 Read ${DIR}/briefing.md and follow it exactly.`,
    ])
    expect(parseProfile(files[`${DIR}/profile.json`] ?? '').scheduled).toBe(true)
  })

  test('without the scheduling tools the setup goes to the prompt', async ($, on) => {
    disk(on, {})
    const filled: string[] = []
    on('tool.call', () => {
      throw new Error('unknown tool')
    })
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    await $.command.run({ command: 'dot', args: 'on' } as never)
    expect(filled[0]).toContain('taskId "dot-work"')
  })

  test('pause disables both rounds', async ($, on) => {
    const files = disk(on, { [`${DIR}/profile.json`]: JSON.stringify({ name: 'Vlad', emoji: '🧛', scheduled: true }) })
    const calls: string[] = []
    on('tool.call', { tool: 'mcp__scheduled-tasks__update_scheduled_task' }, ($, e) => {
      const input = e as unknown as { taskId: string; enabled?: boolean }
      calls.push(`${input.taskId} ${input.enabled}`)
      return { result: {} as never }
    })
    const clock = mock.clock(on)
    await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
    await clock.advance(5000)
    await $.command.run({ command: 'dot', args: 'pause' } as never)
    expect(calls).toEqual(['dot-work false', 'dot-briefing false'])
    expect(parseProfile(files[`${DIR}/profile.json`] ?? '').paused).toBe(true)
  })

  test('renaming rewrites the instructions with the new name', async ($, on) => {
    const files = disk(on, {})
    await $.command.run({ command: 'dot', args: 'name Renfield 🦇' } as never)
    expect(parseProfile(files[`${DIR}/profile.json`] ?? '')).toMatchObject({ name: 'Renfield', emoji: '🦇' })
    expect(files[`${DIR}/work.md`]).toContain('You are Renfield')
  })

  test('without the mods bar it shows one line that opens its pane', async ($, on) => {
    disk(on, { [`${DIR}/goals.json`]: JSON.stringify([{ id: 'a', title: 'x', status: 'waiting', notes: [], question: 'ok?', createdAt: 1, updatedAt: 1 }]) })
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>beneath</Text>
    })
    on('command.register', () => ({ value: undefined }) as never)
    const clock = mock.clock(on)
    await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
    await clock.advance(5000)
    const band = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect((await band.find({ type: 'Button', key: 'open-dot' }))?.props.label).toBe('Vlad · 1 waiting on you')
    expect(await band.find({ type: 'Svg' })).toBeUndefined()
    expect(await band.find({ text: 'beneath' })).toBeDefined()
  })

  test('the pane leads with the animated avatar', async ($, on) => {
    disk(on, { [`${DIR}/goals.json`]: JSON.stringify([{ id: 'a', title: 'x', status: 'waiting', notes: [], question: 'ok?', createdAt: 1, updatedAt: 1 }]) })
    await $.command.run({ command: 'dot', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'Pane', requestId: 'dot', props: PANE })
    const svg = await pane.find({ type: 'Svg' })
    expect(svg?.props.width).toBe(64)
    expect(String(svg?.props.source)).toContain('class="bang"')
    expect(await pane.find({ text: /Off. Turn it on/ })).toBeDefined()
  })

  test('shows when the round runs and when the next one comes', async ($, on) => {
    disk(on, {
      [`${DIR}/profile.json`]: JSON.stringify({ name: 'Vlad', scheduled: true, everyMinutes: 30 }),
      [`${DIR}/round.json`]: JSON.stringify({ state: 'running', goal: 'read the RFC', summary: '' }),
    })
    on('command.register', () => ({ value: undefined }) as never)
    const clock = mock.clock(on)
    await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
    await clock.advance(5000)
    const pane = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'Pane', requestId: 'dot', props: PANE })
    expect(await pane.find({ text: /Working on “read the RFC” · since \d\d:\d\d/ })).toBeDefined()
    expect(await pane.find({ type: 'Button', key: 'run-now' })).toBeUndefined()
  })

  test('a new message starts a round right away and links become chips', async ($, on) => {
    const files = disk(on, {
      [`${DIR}/profile.json`]: JSON.stringify({ name: 'Vlad', scheduled: true, everyMinutes: 30 }),
      [`${DIR}/goals.json`]: JSON.stringify([{ id: 'a', title: 'slack?', status: 'done', notes: ['Two pending (https://x.slack.com/archives/C1).'], question: '', createdAt: 1, updatedAt: 2 }]),
    })
    const runs: string[] = []
    on('tool.call', { tool: 'mcp__scheduled-tasks__run_scheduled_task' }, ($, e) => {
      runs.push((e as unknown as { taskId: string }).taskId)
      return { result: {} as never }
    })
    await $.command.run({ command: 'dot', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'Pane', requestId: 'dot', props: PANE })
    expect((await pane.find({ type: 'Markdown' }))?.props.text).toContain('https://x.slack.com/archives/C1')
    await pane.post({ submit: 'any email?' }, { in: 'composer' })
    expect(goalsOf(files).at(-1)?.title).toBe('any email?')
    expect(runs).toEqual(['dot-work'])
  })

  test('the full-width field types, sends on Enter and clears', async ($, on) => {
    const files = disk(on, { [`${DIR}/profile.json`]: JSON.stringify({ name: 'Vlad', scheduled: false, everyMinutes: 30 }) })
    await $.command.run({ command: 'dot', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'Pane', requestId: 'dot', props: PANE })
    expect((await pane.find({ type: 'Client' }))?.props.width).toBe('100%')
    await pane.pointer({ type: 'down', x: 1, y: 0, button: 'left' })
    for (const key of ['o', 'i', 'x', 'backspace']) await pane.key({ key, in: 'composer' })
    expect(await pane.find({ type: 'Text', text: /^oi/, in: 'composer' })).toBeDefined()
    await pane.key({ key: 'return', in: 'composer' })
    expect(goalsOf(files).at(-1)?.title).toBe('oi')
    expect(await pane.find({ type: 'Text', text: /^oi/, in: 'composer' })).toBeUndefined()
  })

  test('splitLinks names known hosts and keeps the text clean', () => {
    expect(splitLinks('See (https://mail.google.com/x) and https://meet.google.com/a, ok')).toEqual({
      body: 'See and, ok',
      links: [{ href: 'https://mail.google.com/x', label: 'Gmail' }, { href: 'https://meet.google.com/a', label: 'Meet' }],
    })
  })

  test('changing the round interval reschedules the work task', async ($, on) => {
    const files = disk(on, { [`${DIR}/profile.json`]: JSON.stringify({ name: 'Vlad', scheduled: true, everyMinutes: 30 }) })
    const calls: string[] = []
    on('tool.call', { tool: 'mcp__scheduled-tasks__update_scheduled_task' }, ($, e) => {
      const input = e as unknown as { taskId: string; cronExpression?: string }
      calls.push(`${input.taskId} ${input.cronExpression}`)
      return { result: {} as never }
    })
    await $.command.run({ command: 'dot', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'Pane', requestId: 'dot', props: PANE })
    await pane.press({ key: 'settings' })
    await pane.select({ key: 'every', value: '60' })
    expect(calls).toContain('dot-work 0 */1 * * *')
    expect(parseProfile(files[`${DIR}/profile.json`] ?? '').everyMinutes).toBe(60)
  })
})

describe('dot pane on start', () => {
  test('opens beside the chat when a session starts', async ($, on) => {
    const opened: string[] = []
    disk(on, {}, opened)
    on('command.register', () => ({ value: undefined }) as never)
    const clock = mock.clock(on)
    await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
    await clock.advance(1000)
    expect(opened).toContain('dot')
  })

  test('stays closed when the option is off', { options: { openOnStart: false } }, async ($, on) => {
    const opened: string[] = []
    disk(on, {}, opened)
    on('command.register', () => ({ value: undefined }) as never)
    const clock = mock.clock(on)
    await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
    await clock.advance(6000)
    expect(opened).toEqual([])
  })
})

describe('dot avatar', () => {
  test('each mood draws its own face and effects', () => {
    expect(avatarSvg('working')).toContain('class="ring"')
    expect(avatarSvg('waiting')).toContain('class="bang"')
    expect(avatarSvg('paused')).toContain('class="zz"')
    expect(avatarSvg('idle')).toContain('class="bat"')
    expect(avatarSvg('idle').length < 131_072).toBe(true)
  })

  test('mood and activity follow the goals', () => {
    const profile = { name: 'Vlad', emoji: '🧛', paused: false, scheduled: true, everyMinutes: 30, briefing: '09:00' }
    const g = (status: 'queued' | 'working' | 'waiting' | 'done', notes: string[] = []) => ({ id: status, title: `t-${status}`, status, notes, question: '', createdAt: 1, updatedAt: 1 })
    expect(moodOf(profile, [])).toBe('idle')
    expect(moodOf(profile, [g('working')])).toBe('working')
    expect(moodOf(profile, [g('working'), g('waiting')])).toBe('waiting')
    expect(moodOf({ ...profile, paused: true }, [g('working')])).toBe('paused')
    expect(activityOf(profile, [g('working', ['read 2 files'])])).toEqual({ status: 'working', detail: 't-working · read 2 files' })
    expect(activityOf(profile, [g('queued')])).toEqual({ status: 'up next', detail: 't-queued' })
  })
})

describe('dot state', () => {
  test('goals move through the queue', () => {
    const queued = addGoal([], '  write the doc ', 1000)
    expect(queued[0]).toMatchObject({ title: 'write the doc', status: 'queued' })
    expect(addGoal(queued, '   ', 2000)).toBe(queued)
    const waiting = queued.map(g => ({ ...g, status: 'waiting' as const, question: 'Which format?' }))
    expect(newlyWaiting(queued, waiting).length).toBe(1)
    expect(newlyWaiting(waiting, waiting).length).toBe(0)
    expect(answerGoal(waiting, waiting[0]?.id ?? '', 'markdown', 3000)[0]).toMatchObject({ status: 'queued', question: '' })
  })

  test('changed goals get stamped, untouched ones keep their time', () => {
    const before = addGoal([], 'a', 1000)
    const id = before[0]?.id ?? ''
    const edited = before.map(g => ({ ...g, status: 'done' as const, notes: ['found it'] }))
    expect(stampChanged(before, edited, 5000).goals[0]?.updatedAt).toBe(5000)
    expect(stampChanged(before, before, 5000).changed).toBe(false)
    const created = [...before, { id: 'new', title: 'b', status: 'done' as const, notes: [], question: '', createdAt: 0, updatedAt: 0 }]
    expect(stampChanged(before, created, 7000).goals.find(g => g.id === 'new')?.createdAt).toBe(7000)
    expect(id).not.toBe('')
  })

  test('round stamps and the next round time', () => {
    const idle = parseRound('')
    const running = stampRound(idle, { state: 'running', goal: 'g', summary: '', at: 0 }, 9000)
    expect(running.round.at).toBe(9000)
    expect(stampRound(running.round, running.round, 12_000).changed).toBe(false)
    const at = new Date(2026, 9, 9, 13, 41).getTime()
    expect(clock(nextRoundAt(30, at))).toBe('14:00')
    expect(clock(nextRoundAt(15, at))).toBe('13:45')
    expect(clock(nextRoundAt(120, at))).toBe('14:00')
  })

  test('bad files fall back to safe defaults', () => {
    expect(parseGoals('not json')).toEqual([])
    expect(parseGoals('[{"id":1}]')).toEqual([])
    expect(parseProfile('')).toMatchObject({ name: 'Vlad', paused: false })
  })

  test('schedules', () => {
    expect(everyMinutesCron(30)).toBe('*/30 * * * *')
    expect(everyMinutesCron(2)).toBe('*/5 * * * *')
    expect(everyMinutesCron(120)).toBe('0 */2 * * *')
    expect(briefingCron('09:00')).toBe('0 9 * * 1-5')
    expect(briefingCron('')).toBeUndefined()
    expect(briefingCron('25:00')).toBeUndefined()
  })
})

test('does nothing while disabled', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'dot', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
  const res = await $.command.run({ command: 'dot', args: 'x' } as never)
  expect(JSON.stringify(res)).toContain('/mods')
})
