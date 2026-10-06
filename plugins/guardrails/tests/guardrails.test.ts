import { describe, expect, test } from 'claude-code/testing'

const ON = { enabled: true }

const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

type Ran = { deny?: string; isError?: boolean; text?: string }
const blocked = (ran: Ran) => ran.deny !== undefined || ran.isError === true
const reason = (ran: Ran) => ran.deny ?? ran.text ?? ''

describe('guardrails', () => {
  test('blocks commands that rewrite the kubeconfig', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    for (const command of ['aws eks update-kubeconfig --name prod', 'kubectl config use-context staging']) {
      const ran = await $.tool.call({ tool: 'Bash', command })
      expect(blocked(ran)).toBe(true)
      expect(reason(ran)).toContain('kubeconfig')
    }
  })

  test('blocks printing the environment and secret variables', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    for (const command of ['env', 'printenv | grep X', 'printenv NPM_TOKEN', 'echo $NPM_TOKEN', 'echo "${GITHUB_TOKEN}"']) {
      expect(blocked(await $.tool.call({ tool: 'Bash', command }))).toBe(true)
    }
  })

  test('lets harmless commands through', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'fine' } as never }))
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => ok())
    for (const command of ['echo $HOME', 'git status', 'env FOO=1 node x.js', 'kubectl get pods', 'kill 1234', 'kubectl config current-context']) {
      expect(blocked(await $.tool.call({ tool: 'Bash', command }))).toBe(false)
    }
  })

  test('blocks killing a port published by a container', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => ok('postgres-dev\t0.0.0.0:5432->5432/tcp\nother\t'))
    const ran = await $.tool.call({ tool: 'Bash', command: 'lsof -ti :5432 | xargs kill -9' })
    expect(blocked(ran)).toBe(true)
    expect(reason(ran)).toContain('postgres-dev')
  })

  test('blocks pkill docker', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    expect(blocked(await $.tool.call({ tool: 'Bash', command: 'pkill -f docker' }))).toBe(true)
  })

  test('denies a production write when not approved', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'dismissed' }))
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => ok('prod-eu\n'))
    const ran = await $.tool.call({ tool: 'Bash', command: 'kubectl -n app delete pod x' })
    expect(blocked(ran)).toBe(true)
    expect(reason(ran)).toContain('prod-eu')
  })

  test('uses the session context from kube-pane', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'dismissed' }))
    on('env.get', () => ({ value: 'prod-us' }))
    on('process.run', () => ok('staging\n'))
    const ran = await $.tool.call({ tool: 'Bash', command: 'kubectl -n app scale deploy x --replicas=0' })
    expect(reason(ran)).toContain('prod-us')
  })

  test('does not ask for non-production writes', { options: ON }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'deleted' } as never }))
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => ok('staging\n'))
    expect(blocked(await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod x' }))).toBe(false)
  })

  test('rules can be switched off in /config', { options: { ...ON, blockSecretPrinting: false } }, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
    expect(blocked(await $.tool.call({ tool: 'Bash', command: 'printenv' }))).toBe(false)
  })
})

test('does nothing while disabled', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
  expect(blocked(await $.tool.call({ tool: 'Bash', command: 'printenv' }))).toBe(false)
})
