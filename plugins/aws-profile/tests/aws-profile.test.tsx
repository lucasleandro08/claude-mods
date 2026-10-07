import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { classify, loginCommand, pickProfiles } from '../src/sessions'

const STATE = JSON.stringify({ enabled: { 'aws-profile': true } })
const turnOn = (on: On) =>
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))

const SURFACES = ['terminal', 'desktop'] as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const EXPIRED = 'Error when retrieving token from sso: Token has expired and refresh failed'

const out = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

function fakeAws(on: On, valid: Set<string>, env: string | undefined = undefined) {
  on('env.get', ($, e) => ({ value: e.name === 'AWS_PROFILE' ? env : undefined }))
  on('process.run', ($, e) => {
    const args = e.argv.slice(1).join(' ')
    if (args === 'configure list-profiles') return out(0, 'dev\nprod-admin\n')
    const name = e.argv[e.argv.indexOf('--profile') + 1] ?? ''
    return valid.has(name) ? out(0, 'identity') : out(255, '', EXPIRED)
  })
}

function base(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
}

async function start($: Engine, on: On) {
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  const clock = mock.clock(on)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never).catch(() => undefined)
  await clock.advance(5000)
  return clock
}

describe('aws-profile', () => {
  for (const surface of SURFACES) {
    test(`shows each profile login and keeps the band beneath on ${surface}`, async ($, on) => {
      turnOn(on)
      fakeAws(on, new Set(['dev']), 'dev')
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      await start($, on)

      const band = await $.ui.mount({ plugin: 'aws-profile', surface, component: 'AbovePrompt', props: BAND })
      expect(await band.find({ text: /● dev/ })).toBeDefined()
      expect((await band.find({ type: 'Button', key: 'login-prod-admin' }))?.props.label).toBe('prod-admin ✗ login')
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }

  test('Login opens aws sso login in the Terminal and rechecks until it works', async ($, on) => {
    turnOn(on)
    const valid = new Set(['dev'])
    const terminal: string[] = []
    fakeAws(on, valid)
    base(on)
    on('tool.call', { tool: 'mcp__terminal__run_in_terminal' }, ($, e) => {
      terminal.push(String(e.command))
      return { result: {} as never }
    })
    const clock = await start($, on)

    const band = await $.ui.mount({ plugin: 'aws-profile', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await band.press({ key: 'login-prod-admin' })
    expect(terminal).toEqual(['aws sso login --profile prod-admin'])
    expect(await band.find({ text: /prod-admin ⟳/ })).toBeDefined()

    valid.add('prod-admin')
    await clock.advance(5000)
    expect(await band.find({ type: 'Button', key: 'login-prod-admin' })).toBeUndefined()
    expect(await band.find({ text: /prod-admin/ })).toBeDefined()
  })

  test('only shows the configured profiles', { options: { profiles: 'dev' } }, async ($, on) => {
    turnOn(on)
    const calls: string[] = []
    on('env.get', () => ({ value: undefined }))
    on('process.run', ($, e) => {
      calls.push(e.argv.slice(1).join(' '))
      return out(0, 'identity')
    })
    await start($, on)
    expect(calls).toEqual(['sts get-caller-identity --profile dev --output text'])
  })

  test('falls back to AWS_PROFILE when the CLI is missing', async ($, on) => {
    turnOn(on)
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => {
      throw new Error('ENOENT')
    })
    base(on)
    await start($, on)
    const band = await $.ui.mount({ plugin: 'aws-profile', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect(await band.find({ text: 'no AWS_PROFILE' })).toBeDefined()
  })
})

describe('sessions', () => {
  test('picks profiles from the option, the CLI and AWS_PROFILE', () => {
    expect(pickProfiles('a\nb\n', '', '')).toEqual(['a', 'b'])
    expect(pickProfiles('a\nb\n', 'b, c', 'a')).toEqual(['b', 'c', 'a'])
    expect(pickProfiles('', '', 'x')).toEqual(['x'])
  })

  test('tells an expired login from other failures', () => {
    expect(classify(0, '')).toBe('valid')
    expect(classify(255, EXPIRED)).toBe('expired')
    expect(classify(255, 'The config profile (x) could not be found')).toBe('error')
  })

  test('quotes odd profile names', () => {
    expect(loginCommand('prod-admin')).toBe('aws sso login --profile prod-admin')
    expect(loginCommand("a b'c")).toBe(`aws sso login --profile 'a b'\\''c'`)
  })
})

test('does nothing while disabled', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'aws-profile', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
  expect((await band.findAll({})).length).toBe(1)
})
