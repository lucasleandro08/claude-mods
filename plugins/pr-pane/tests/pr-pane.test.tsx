import { describe, expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'PRs', isFocused: false, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

function fakeGh(argv: readonly string[]) {
  const args = argv.slice(1).join(' ')
  if (args.startsWith('search prs')) {
    return out(JSON.stringify([
      { number: 1, title: 'Fix thing', url: 'https://github.com/o/a/pull/1', isDraft: false, repository: { nameWithOwner: 'o/a' } },
      { number: 2, title: 'Broken build', url: 'https://github.com/o/b/pull/2', isDraft: false, repository: { nameWithOwner: 'o/b' } },
    ]))
  }
  if (args.startsWith('pr view 1')) return out(JSON.stringify({ headRefOid: 'aaa', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS', state: null }] }))
  if (args.startsWith('pr view 2')) return out(JSON.stringify({ headRefOid: 'bbb', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE', state: null }] }))
  if (args.includes('issues/1/reactions')) return out('["+1"]')
  if (args.includes('issues/2/reactions')) return out('[]')
  if (args.includes('pulls/1/reviews')) return out('0')
  if (args.includes('pulls/2/reviews')) return out('2')
  if (args.includes('compare/staging...aaa')) return out('behind\n')
  if (args.includes('compare/staging...bbb')) return out('', 1)
  return out('', 1)
}

describe('pr-pane', () => {
  for (const surface of SURFACES) {
    test(`lists PRs with CI, Codex and integration branch on ${surface}`, async ($, on) => {
      on('process.run', ($, e) => fakeGh(e.argv))
      on('env.get', () => ({ value: undefined }))
      on('ui.open', () => ({ value: { isPlaced: true } }))
      await $.command.run({ command: 'prs', args: '' } as never)

      const pane = await $.ui.mount({ plugin: 'pr-pane', surface, component: 'Pane', requestId: 'pr-pane', props: PANE })
      await pane.press({ key: 'refresh' })
      expect(await pane.find({ text: '✓ CI' })).toBeDefined()
      expect(await pane.find({ text: '✗ CI' })).toBeDefined()
      expect(await pane.find({ text: '👍 Codex' })).toBeDefined()
      expect(await pane.find({ text: /⚠ Codex 2/ })).toBeDefined()
      expect(await pane.find({ text: '✓ staging' })).toBeDefined()
    })

    test(`band chip flags failing CI and keeps the band beneath on ${surface}`, async ($, on) => {
      on('process.run', ($, e) => fakeGh(e.argv))
      on('env.get', () => ({ value: undefined }))
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      on('ui.open', () => ({ value: { isPlaced: false, reason: 'waiting' } }))
      await $.command.run({ command: 'prs', args: '' } as never)
      const pane = await $.ui.mount({ plugin: 'pr-pane', surface, component: 'Pane', requestId: 'pr-pane', props: PANE })
      await pane.press({ key: 'refresh' })

      const band = await $.ui.mount({ plugin: 'pr-pane', surface, component: 'AbovePrompt', props: BAND })
      expect(await band.find({ type: 'Button', key: 'open-prs' })).toBeDefined()
      expect(await band.find({ text: /✗ 1 CI/ })).toBeDefined()
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }
})
