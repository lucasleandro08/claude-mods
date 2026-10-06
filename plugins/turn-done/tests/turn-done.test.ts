import { describe, expect, test } from 'claude-code/testing'

const ON = { enabled: true }

describe('turn-done', () => {
  for (const [label, durationMs, isAborted, expected] of [
    ['long', 75_000, false, 1],
    ['short', 10_000, false, 0],
    ['aborted', 90_000, true, 0],
  ] as const) {
    test(`${label} turn → ${expected} toast`, { options: ON }, async ($, on) => {
      const toasts: string[] = []
      const sounds: string[] = []
      on('turn.complete', ($, e) => ({ text: e.answer }))
      on('ui.toast', ($, e) => {
        toasts.push(JSON.stringify(e))
        return { value: undefined }
      })
      on('audio.play', ($, e) => {
        sounds.push(JSON.stringify(e))
        return { value: undefined }
      })

      await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs, isAborted, reason: 'answer' } as never)

      expect(toasts).toHaveLength(expected)
      expect(sounds).toHaveLength(expected)
      if (expected === 1) expect(toasts[0]).toContain('1m 15s')
    })
  }

  test('sound can be turned off', { options: { ...ON, playSound: false } }, async ($, on) => {
    const sounds: string[] = []
    on('turn.complete', ($, e) => ({ text: e.answer }))
    on('ui.toast', () => ({ value: undefined }))
    on('audio.play', ($, e) => {
      sounds.push(JSON.stringify(e))
      return { value: undefined }
    })
    await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 90_000, isAborted: false, reason: 'answer' } as never)
    expect(sounds).toHaveLength(0)
  })
})

test('does nothing while disabled', async ($, on) => {
  const toasts: string[] = []
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.toast', ($, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 90_000, isAborted: false, reason: 'answer' } as never)
  expect(toasts).toHaveLength(0)
})
