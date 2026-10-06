import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const STATE = JSON.stringify({ enabled: { 'live-diff': true } })
const turnOn = (on: On) =>
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))

const SURFACES = ['terminal', 'desktop'] as const

const PANE = {
  title: 'Diff',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 3,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 3 },
  view: {},
}

describe('live-diff', () => {
  for (const surface of SURFACES) {
    test(`shows an Edit as removed and added lines on ${surface}`, async ($, on) => {
    turnOn(on)
      on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))

      await $.tool.call({
        tool: 'Edit',
        file_path: '/repo/src/app.ts',
        old_string: 'const a = 1\nconst b = 2',
        new_string: 'const a = 1\nconst b = 3',
      })

      const ui = await $.ui.mount({ plugin: 'live-diff', surface, component: 'Pane', requestId: 'live-diff', props: PANE })

      expect(await ui.find({ text: /app\.ts/ })).toBeDefined()
      expect(await ui.find({ text: /- const b = 2/ })).toBeDefined()
      expect(await ui.find({ text: /\+ const b = 3/ })).toBeDefined()
      expect(await ui.find({ text: /\+1 / })).toBeDefined()

      await ui.press({ key: 'clear' })
      expect(await ui.find({ text: /No edits yet/ })).toBeDefined()
    })

    test(`ignores a denied Edit on ${surface}`, async ($, on) => {
    turnOn(on)
      on('tool.call', { tool: 'Edit' }, () => ({ deny: 'no' }))

      await $.tool.call({ tool: 'Edit', file_path: '/repo/x.ts', old_string: 'a', new_string: 'b' })

      const ui = await $.ui.mount({ plugin: 'live-diff', surface, component: 'Pane', requestId: 'live-diff', props: PANE })
      expect(await ui.find({ text: /No edits yet/ })).toBeDefined()
    })
  }
})

describe('file navigation', () => {
  for (const surface of SURFACES) {
    test(`picking a file shows only its edits on ${surface}`, async ($, on) => {
    turnOn(on)
      on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))
      await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'alpha', new_string: 'ALPHA' })
      await $.tool.call({ tool: 'Edit', file_path: '/repo/b.ts', old_string: 'beta', new_string: 'BETA' })

      const ui = await $.ui.mount({ plugin: 'live-diff', surface, component: 'Pane', requestId: 'live-diff', props: PANE })
      expect(await ui.find({ text: /\+ ALPHA/ })).toBeDefined()
      expect(await ui.find({ text: /\+ BETA/ })).toBeDefined()

      await ui.press({ key: 'pick-/repo/b.ts' })
      expect(await ui.find({ text: /\+ ALPHA/ })).toBeUndefined()
      expect(await ui.find({ text: /\+ BETA/ })).toBeDefined()

      await ui.press({ key: 'pick-all' })
      expect(await ui.find({ text: /\+ ALPHA/ })).toBeDefined()
    })
  }
})

describe('reopen button', () => {
  for (const surface of SURFACES) {
    test(`keeps the band beneath and adds Diff on ${surface}`, async ($, on) => {
    turnOn(on)
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>usage band</Text>
      })
      on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))
      await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })

      const band = await $.ui.mount({ plugin: 'live-diff', surface, component: 'AbovePrompt', props: BAND })
      expect(await band.find({ type: 'Button', key: 'open-diff' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: 'usage band' })).toBeDefined()
    })
  }
})

describe('diff chip', () => {
  for (const surface of SURFACES) {
    test(`stays visible with no edits on ${surface}`, async ($, on) => {
    turnOn(on)
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      await $.command.run({ command: 'diff-clear', args: '' } as never)
      const band = await $.ui.mount({ plugin: 'live-diff', surface, component: 'AbovePrompt', props: BAND })
      const chip = await band.find({ type: 'Button', key: 'open-diff' })
      expect(chip?.props.label).toBe('Diff')
    })
  }
})

describe('large sessions', () => {
  test('caps the lines drawn and points to the file view', async ($, on) => {
    turnOn(on)
    on('tool.call', { tool: 'Write' }, () => ({ result: {} as never }))
    const big = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n')
    for (let i = 0; i < 13; i++) await $.tool.call({ tool: 'Write', file_path: `/repo/file-${i}.ts`, content: big })

    const pane = await $.ui.mount({ plugin: 'live-diff', surface: 'desktop', component: 'Pane', requestId: 'live-diff', props: PANE })
    expect((await pane.findAll({})).length < 1500).toBe(true)
    expect(await pane.find({ text: /more lines; pick a file/ })).toBeDefined()

    await pane.press({ key: 'pick-/repo/file-3.ts' })
    expect(await pane.find({ text: 'line 299' })).toBeDefined()
  })
})

test('does nothing while disabled', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'live-diff', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} } })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
  expect((await band.findAll({})).length).toBe(1)
})
