import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'Pods', isFocused: false, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const PROD = 'arn:aws:eks:eu-west-1:000000000000:cluster/prod-eu'
const STAGING = 'staging'

const out = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: exitCode ? 'boom' : '', isStdoutTruncated: false, isStderrTruncated: false },
})

function pod(name: string, ready: boolean, waiting?: string, restarts = 0, containers = ['app']) {
  return {
    metadata: { name, creationTimestamp: new Date(Date.now() - 3 * 3600_000).toISOString() },
    spec: { containers: containers.map(c => ({ name: c })) },
    status: { phase: 'Running', containerStatuses: [{ ready, restartCount: restarts, state: waiting ? { waiting: { reason: waiting } } : {} }] },
  }
}

function fakeKubectl(calls: string[]) {
  return (argv: readonly string[]) => {
    const args = argv.slice(1).join(' ')
    calls.push(args)
    if (args === 'config get-contexts -o name') return out(`${PROD}\n${STAGING}\n`)
    if (args === 'config current-context') return out(`${PROD}\n`)
    if (args.includes('get namespaces')) return out('app default kube-system')
    if (args.includes('get pods')) {
      const many = Array.from({ length: 40 }, (_, i) => pod(`web-${String(i).padStart(2, '0')}`, true))
      return out(JSON.stringify({ items: [pod('api-1', true, undefined, 0, ['app', 'sidecar']), pod('worker-1', false, 'CrashLoopBackOff', 7), ...many] }))
    }
    return out('', 1)
  }
}

function setup(on: On, calls: string[], isPlaced = true) {
  on('process.run', ($, e) => fakeKubectl(calls)(e.argv))
  on('env.get', () => ({ value: undefined }))
  on('env.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'waiting' } }))
}

describe('kube-pane', () => {
  for (const surface of SURFACES) {
    test(`lists pods of the default namespace, unhealthy first, on ${surface}`, async ($, on) => {
      const calls: string[] = []
      setup(on, calls)
      await $.command.run({ command: 'pods', args: '' } as never)

      const pane = await $.ui.mount({ plugin: 'kube-pane', surface, component: 'Pane', requestId: 'kube-pane', props: PANE })
      expect(calls).toContain(`--context ${PROD} -n default get pods -o json`)
      expect(await pane.find({ text: 'CrashLoopBackOff' })).toBeDefined()
      expect(await pane.find({ text: /1 unhealthy/ })).toBeDefined()
      expect(await pane.find({ text: /page 1\/2/ })).toBeDefined()
    })

    test(`context chip is red on production and keeps the band beneath on ${surface}`, async ($, on) => {
      setup(on, [], false)
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      await $.command.run({ command: 'pods', args: '' } as never)

      const band = await $.ui.mount({ plugin: 'kube-pane', surface, component: 'AbovePrompt', props: BAND })
      expect(await band.find({ type: 'Button', text: 'prod-eu' })).toBeDefined()
      expect(await band.find({ text: 'PROD' })).toBeDefined()
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }

  test('switching context rewrites Claude kubectl commands and never touches the kubeconfig', async ($, on) => {
    const calls: string[] = []
    const ran: string[] = []
    setup(on, calls)
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      ran.push(e.command)
      return { result: {} as never }
    })
    await $.command.run({ command: 'pods', args: '' } as never)

    const pane = await $.ui.mount({ plugin: 'kube-pane', surface: 'desktop', component: 'Pane', requestId: 'kube-pane', props: PANE })
    await pane.select({ key: 'context', value: STAGING })
    await $.tool.call({ tool: 'Bash', command: 'kubectl -n app get pods | grep api' })
    await $.tool.call({ tool: 'Bash', command: 'kubectl --context x get pods' })

    expect(ran[0]).toBe(`kubectl --context '${STAGING}' -n app get pods | grep api`)
    expect(ran[1]).toBe('kubectl --context x get pods')
    expect(calls.some(c => c.includes('use-context'))).toBe(false)
  })

  test('pages, filters and opens a shell in the chosen container', async ($, on) => {
    const terminal: string[] = []
    setup(on, [])
    on('tool.call', { tool: 'mcp__terminal__run_in_terminal' }, ($, e) => {
      terminal.push(String(e.command))
      return { result: {} as never }
    })
    await $.command.run({ command: 'pods', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'kube-pane', surface: 'desktop', component: 'Pane', requestId: 'kube-pane', props: PANE })
    await pane.select({ key: 'context', value: STAGING })

    expect(await pane.find({ text: 'web-39' })).toBeUndefined()
    await pane.press({ key: 'page-next' })
    expect(await pane.find({ text: 'web-39' })).toBeDefined()

    await pane.input({ key: 'filter', text: 'api', kind: 'change' })
    expect(await pane.find({ text: 'web-00' })).toBeUndefined()
    await pane.press({ key: 'container-api-1-sidecar' })
    await pane.press({ key: 'shell-api-1' })
    expect(terminal[0]).toBe(
      `kubectl --context '${STAGING}' -n 'default' exec -it 'api-1' -c 'sidecar' -- sh -c 'command -v bash >/dev/null && exec bash || exec sh'`,
    )
  })

  for (const [label, answer, opens] of [['opens on confirm', 'Open shell', true], ['stays closed on cancel', 'Cancel', false]] as const) {
    test(`production shell ${label}`, async ($, on) => {
      const terminal: string[] = []
      setup(on, [])
      on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
        const questions = (e as unknown as { questions: { question: string }[] }).questions
        return { result: { questions, answers: { [questions[0]?.question ?? '']: answer } } } as never
      })
      on('tool.call', { tool: 'mcp__terminal__run_in_terminal' }, ($, e) => {
        terminal.push(String(e.command))
        return { result: {} as never }
      })
      await $.command.run({ command: 'pods', args: '' } as never)
      const pane = await $.ui.mount({ plugin: 'kube-pane', surface: 'desktop', component: 'Pane', requestId: 'kube-pane', props: PANE })
      await pane.press({ key: 'shell-worker-1' })
      expect(terminal.length).toBe(opens ? 1 : 0)
    })
  }

  test('default namespace is configurable', { options: { defaultNamespace: 'app' } }, async ($, on) => {
    const calls: string[] = []
    setup(on, calls)
    await $.command.run({ command: 'pods', args: '' } as never)
    expect(calls).toContain(`--context ${PROD} -n app get pods -o json`)
  })
})
