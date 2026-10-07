import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { chipState, parseProjects, parseTime, pushedProjects, toBuildRows } from '../src/builds'

const STATE = JSON.stringify({ enabled: { 'deploy-watch': true } })
const OPTIONS = { projects: 'app-staging=staging', awsProfile: 'ops', region: 'us-east-1' }
const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'Deploys', isFocused: false, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const out = (stdout: string, exitCode = 0, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

type Fake = { builds: object[]; calls: string[] }

function build(number: number, status: string, minutesAgo: number) {
  const start = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const end = status === 'IN_PROGRESS' ? null : new Date(Date.now() - (minutesAgo - 4) * 60_000).toISOString()
  return { id: `app-staging:${number}`, number, status, phase: status === 'IN_PROGRESS' ? 'BUILD' : 'COMPLETED', source: 'staging', resolved: `abc${number}def0123`, start, end, group: '/aws/codebuild/app-staging', stream: `s${number}` }
}

function setup(on: On, fake: Fake) {
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))
  on('env.get', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  on('process.run', ($, e) => {
    const args = e.argv.slice(1).join(' ')
    fake.calls.push(args)
    if (args.includes('list-builds-for-project')) return out(JSON.stringify(fake.builds.map(b => (b as { id: string }).id)))
    if (args.includes('batch-get-builds')) return out(JSON.stringify(fake.builds))
    if (args.includes('start-build')) return out('43\n')
    return out('', 1, 'unexpected')
  })
}

async function start($: Engine, on: On) {
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: Date.now() })
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
  await clock.advance(5000)
  return clock
}

describe('deploy-watch', () => {
  for (const surface of SURFACES) {
    test(`chip shows the last build and keeps the band beneath on ${surface}`, { options: OPTIONS }, async ($, on) => {
      const fake: Fake = { builds: [build(42, 'SUCCEEDED', 20)], calls: [] }
      setup(on, fake)
      await start($, on)

      const band = await $.ui.mount({ plugin: 'deploy-watch', surface, component: 'AbovePrompt', props: BAND })
      expect(await band.find({ type: 'Button', key: 'open-deploys' })).toBeDefined()
      expect(await band.find({ text: /✓ #42 16m ago/ })).toBeDefined()
      expect(await band.find({ text: 'beneath' })).toBeDefined()
      expect(fake.calls[0]).toContain('--profile ops --region us-east-1')
    })
  }

  test('warns when a push to the branch starts no build', { options: { ...OPTIONS, missingBuildMinutes: 1 } }, async ($, on) => {
    const fake: Fake = { builds: [build(42, 'SUCCEEDED', 20)], calls: [] }
    const toasts: string[] = []
    setup(on, fake)
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    const clock = await start($, on)

    await $.tool.call({ tool: 'Bash', command: 'git push origin staging' })
    const band = await $.ui.mount({ plugin: 'deploy-watch', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect(await band.find({ text: /waiting for build/ })).toBeDefined()

    await clock.advance(125_000)
    expect(await band.find({ text: /no build 2m after push/ })).toBeDefined()
    expect(toasts.some(t => t.includes('app-staging has no build yet'))).toBe(true)
  })

  test('pane lists builds, opens logs and starts a build after confirming', { options: OPTIONS }, async ($, on) => {
    const fake: Fake = { builds: [build(42, 'IN_PROGRESS', 2), build(41, 'FAILED', 60)], calls: [] }
    const terminal: string[] = []
    setup(on, fake)
    on('tool.call', { tool: 'mcp__terminal__run_in_terminal' }, ($, e) => {
      terminal.push(String(e.command))
      return { result: {} as never }
    })
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      const questions = (e as unknown as { questions: { question: string }[] }).questions
      return { result: { questions, answers: { [questions[0]?.question ?? '']: 'Start build' } } } as never
    })
    on('ui.toast', () => ({ value: undefined }))
    mock.clock(on, { now: Date.now() })
    await $.command.run({ command: 'deploys', args: '' } as never)

    const pane = await $.ui.mount({ plugin: 'deploy-watch', surface: 'desktop', component: 'Pane', requestId: 'deploy-watch', props: PANE })
    expect(await pane.find({ text: 'in progress' })).toBeDefined()
    expect(await pane.find({ text: 'failed' })).toBeDefined()

    await pane.press({ key: 'logs-app-staging:41' })
    expect(terminal).toEqual(['aws logs tail /aws/codebuild/app-staging --log-stream-names s41 --follow --profile ops --region us-east-1'])

    await pane.press({ key: 'start-app-staging' })
    expect(fake.calls).toContain('codebuild start-build --project-name app-staging --source-version staging --query build.buildNumber --output text --profile ops --region us-east-1')
  })

  test('batch-get-builds asks only for the fields it shows', { options: OPTIONS }, async ($, on) => {
    const fake: Fake = { builds: [build(42, 'SUCCEEDED', 20)], calls: [] }
    setup(on, fake)
    await start($, on)
    const query = fake.calls.find(c => c.includes('batch-get-builds')) ?? ''
    expect(query).toContain('--query builds[].{id:id')
    expect(query.includes('environment')).toBe(false)
  })
})

describe('builds', () => {
  test('parses projects with and without a branch', () => {
    expect(parseProjects(' a=staging, b ,')).toEqual([{ name: 'a', branch: 'staging' }, { name: 'b', branch: '' }])
  })

  test('parses CLI times with microseconds and epochs', () => {
    expect(parseTime('2026-10-07T10:00:00.123456-03:00')).toBe(Date.parse('2026-10-07T13:00:00.123Z'))
    expect(parseTime(1_780_000_000)).toBe(1_780_000_000_000)
    expect(parseTime(null)).toBe(0)
  })

  test('detects pushes to a project branch', () => {
    const projects = [{ name: 'app', branch: 'staging' }, { name: 'other', branch: 'main' }]
    expect(pushedProjects('git push origin staging', projects)).toEqual(['app'])
    expect(pushedProjects('git push origin HEAD:staging && echo ok', projects)).toEqual(['app'])
    expect(pushedProjects('git -C /x push origin feature/staging-fix', projects)).toEqual([])
    expect(pushedProjects('git push', projects)).toEqual([])
    expect(pushedProjects('echo staging', projects)).toEqual([])
  })

  test('chip state follows the latest build and the pending push', () => {
    const now = Date.now()
    const rows = toBuildRows(JSON.stringify([build(41, 'FAILED', 60), build(42, 'IN_PROGRESS', 2)]))
    expect(rows[0]?.number).toBe(42)
    expect(chipState(rows, 0, now, 60_000).kind).toBe('running')
    expect(chipState(rows.slice(1), 0, now, 60_000).kind).toBe('failed')
    expect(chipState(rows, now - 120_000, now, 60_000).kind).toBe('running')
    expect(chipState(rows.slice(1), now - 120_000, now, 60_000).kind).toBe('missing')
    expect(chipState([], 0, now, 60_000).kind).toBe('idle')
  })
})

test('does nothing while disabled', { options: OPTIONS }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'deploy-watch', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
})
