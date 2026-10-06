import { describe, expect, mock, test } from 'claude-code/testing'

const ON = { enabled: true }

describe('/codex-loop', () => {
  test('submits the loop prompt for a PR url', { options: ON }, async ($, on) => {
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    const clock = mock.clock(on)
    await $.command.run({ command: 'codex-loop', args: 'https://github.com/octo-org/octo-repo/pull/42' } as never)
    await clock.advance(1)
    expect(sent[0]).toContain('octo-org/octo-repo#42')
    expect(sent[0]).toContain('repos/octo-org/octo-repo/issues/42/comments')
    expect(sent[0]).toContain('content="-1"')
  })

  test('shows usage for a bad argument and submits nothing', { options: ON }, async ($, on) => {
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    const res = await $.command.run({ command: 'codex-loop', args: 'banana' } as never)
    expect(JSON.stringify(res)).toContain('Usage')
    expect(sent).toHaveLength(0)
  })
})

test('registers no command while disabled', async ($, on) => {
  const registered: string[] = []
  on('command.register', ($, e) => {
    registered.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  on('session.start', () => ({}) as never)
  await $.session.start({ source: 'startup' } as never).catch(() => undefined)
  expect(registered).toHaveLength(0)
})
