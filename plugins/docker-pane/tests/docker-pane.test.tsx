import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const STATE = JSON.stringify({ enabled: { 'docker-pane': true } })
const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'Docker', isFocused: false, bodyColumns: 110, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const DAY = 86_400_000

const out = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: exitCode ? 'boom' : '', isStdoutTruncated: false, isStderrTruncated: false },
})

function created(msAgo: number) {
  const d = new Date(Date.now() - msAgo)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)} +0000 UTC`
}

function container(name: string, service: string, state: string, status: string, msAgo: number, ports = '') {
  const labels = `com.docker.compose.project=shop,com.docker.compose.service=${service},com.docker.compose.project.working_dir=/code/shop,com.docker.compose.project.config_files=/code/shop/compose.yml`
  return JSON.stringify({ ID: `id-${name}`, Names: name, Image: 'img', State: state, Status: status, Ports: ports, CreatedAt: created(msAgo), Labels: labels })
}

const PS = [
  container('shop-web-1', 'web', 'running', 'Up 2 hours', 3 * DAY, '0.0.0.0:8080->80/tcp, [::]:8080->80/tcp'),
  container('shop-db-1', 'db', 'running', 'Up 2 hours (unhealthy)', 600_000),
  container('shop-redis-1', 'redis', 'exited', 'Exited (0) 3 hours ago', 600_000),
].join('\n')

function setup(on: On, calls: string[]) {
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))
  on('env.get', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    calls.push(args)
    if (args === 'git rev-parse --show-toplevel') return out('/code/shop\n')
    if (args.startsWith('git reflog')) return out(`${Math.floor((Date.now() - DAY) / 1000)} checkout: moving from main to feature\n`)
    if (args.endsWith('ps -a --no-trunc --format {{json .}}')) return out(PS)
    return out('')
  })
}

describe('docker-pane', () => {
  for (const surface of SURFACES) {
    test(`chip counts containers and keeps the band beneath on ${surface}`, async ($, on) => {
      setup(on, [])
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      await $.command.run({ command: 'docker', args: '' } as never)

      const band = await $.ui.mount({ plugin: 'docker-pane', surface, component: 'AbovePrompt', props: BAND })
      expect((await band.find({ type: 'Button', key: 'open-docker' }))?.props.label).toBe('Docker · 2 up')
      expect(await band.find({ text: /1 unhealthy/ })).toBeDefined()
      expect(await band.find({ text: /1 older than checkout/ })).toBeDefined()
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })

    test(`pane groups by project and flags stale containers on ${surface}`, async ($, on) => {
      setup(on, [])
      await $.command.run({ command: 'docker', args: '' } as never)

      const pane = await $.ui.mount({ plugin: 'docker-pane', surface, component: 'Pane', requestId: 'docker-pane', props: PANE })
      expect(await pane.find({ text: 'shop' })).toBeDefined()
      expect(await pane.find({ text: '8080→80' })).toBeDefined()
      expect(await pane.find({ text: 'unhealthy' })).toBeDefined()
      expect(await pane.find({ text: /created before your last checkout/ })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'start-id-shop-redis-1' })).toBeDefined()
    })
  }

  test('acts on containers by name, never by port', async ($, on) => {
    const calls: string[] = []
    const terminal: string[] = []
    setup(on, calls)
    on('tool.call', { tool: 'mcp__terminal__run_in_terminal' }, ($, e) => {
      terminal.push(String(e.command))
      return { result: {} as never }
    })
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      const questions = (e as unknown as { questions: { question: string }[] }).questions
      return { result: { questions, answers: { [questions[0]?.question ?? '']: 'Recreate' } } } as never
    })
    await $.command.run({ command: 'docker', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'docker-pane', surface: 'desktop', component: 'Pane', requestId: 'docker-pane', props: PANE })

    await pane.press({ key: 'restart-id-shop-web-1' })
    await pane.press({ key: 'start-id-shop-redis-1' })
    expect(calls).toContain('docker restart shop-web-1')
    expect(calls).toContain('docker start shop-redis-1')
    expect(calls.some(c => /lsof|kill/.test(c))).toBe(false)

    await pane.press({ key: 'logs-id-shop-db-1' })
    await pane.press({ key: 'recreate-id-shop-web-1' })
    expect(terminal).toEqual([
      'docker logs -f --tail 200 shop-db-1',
      'docker compose -p shop -f /code/shop/compose.yml up -d --force-recreate web',
    ])
  })

  test('shows Docker off when the daemon is down', async ($, on) => {
    on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))
    on('env.get', () => ({ value: undefined }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', ($, e) => (e.argv.includes('ps') ? out('', 1) : out('')))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>beneath</Text>
    })
    await $.command.run({ command: 'docker', args: '' } as never)
    const band = await $.ui.mount({ plugin: 'docker-pane', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect((await band.find({ type: 'Button', key: 'open-docker' }))?.props.label).toBe('Docker off')
  })
})

test('does nothing while disabled', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'docker-pane', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
})
