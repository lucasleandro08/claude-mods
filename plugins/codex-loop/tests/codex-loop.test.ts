import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const STATE = JSON.stringify({ enabled: { 'codex-loop': true } })
const turnOn = (on: On) =>
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))

describe('/codex-loop', () => {
  test('submits the loop prompt for a PR url', async ($, on) => {
    turnOn(on)
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

  test('shows usage for a bad argument and submits nothing', async ($, on) => {
    turnOn(on)
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

test('answers that it is off while disabled', async $ => {
  const res = await $.command.run({ command: 'codex-loop', args: '42' } as never)
  expect(JSON.stringify(res)).toContain('/mods')
})
