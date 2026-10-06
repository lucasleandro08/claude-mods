import { describe, expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'Mods', isFocused: false, bodyColumns: 90, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

type Row = { key: string; label: string; kind: 'boolean'; value: boolean; isLocked: boolean; provider: { plugin: string; tier: 'user' } }

function row(plugin: string, value: boolean, isLocked = false): Row {
  return { key: `${plugin}.enabled`, label: 'Enabled', kind: 'boolean', value, isLocked, provider: { plugin, tier: 'user' } }
}

function settings(initial: Row[]) {
  const rows = [...initial]
  const writes: { key: string; value: unknown }[] = []
  return {
    rows,
    writes,
    list: () => ({ value: rows }),
    set: (e: { key: string; value: unknown }) => {
      writes.push({ key: e.key, value: e.value })
      const target = rows.find(r => r.key === e.key)
      if (!target) return { deny: 'no such row' }
      target.value = e.value === true
      return { value: e.value as boolean }
    },
  }
}

describe('mod-manager', () => {
  for (const surface of SURFACES) {
    test(`lists installed, off and missing mods on ${surface}`, async ($, on) => {
      const store = settings([row('live-diff', true), row('kube-pane', false), row('guardrails', false, true)])
      on('config.list', () => store.list())
      on('ui.open', () => ({ value: { isPlaced: true } }))

      const pane = await $.ui.mount({ plugin: 'mod-manager', surface, component: 'Pane', requestId: 'mod-manager', props: PANE })
      expect(await pane.find({ text: /1 of 8 on/ })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'toggle-live-diff' })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'toggle-kube-pane' })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'toggle-guardrails' })).toBeUndefined()
      expect(await pane.find({ text: 'managed' })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'install-pr-pane' })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'install-all' })).toBeDefined()
    })

    test(`chip counts mods on and keeps the band beneath on ${surface}`, async ($, on) => {
      const store = settings([row('live-diff', true), row('kube-pane', true)])
      on('config.list', () => store.list())
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })

      const band = await $.ui.mount({ plugin: 'mod-manager', surface, component: 'AbovePrompt', props: BAND })
      const chip = await band.find({ type: 'Button', key: 'open-mods' })
      expect(chip?.props.label).toBe('Mods · 2/8')
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }

  test('turning a mod on and off writes its enabled option', async ($, on) => {
    const store = settings([row('kube-pane', false)])
    on('config.list', () => store.list())
    on('config.set', ($, e) => store.set(e) as never)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'toggle-kube-pane' })
    expect(store.writes).toEqual([{ key: 'kube-pane.enabled', value: true }])
    expect((await pane.find({ type: 'Button', key: 'toggle-kube-pane' }))?.props.label).toBe('Turn off')

    await pane.press({ key: 'toggle-kube-pane' })
    expect(store.writes[1]).toEqual({ key: 'kube-pane.enabled', value: false })
  })

  test('the chip can be hidden', { options: { showChip: false } }, async ($, on) => {
    on('config.list', () => ({ value: [] }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>beneath</Text>
    })
    const band = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect(await band.find({ type: 'Button' })).toBeUndefined()
  })

  const out = (exitCode: number, stdout: string, stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })

  test('Install runs the claude CLI for that mod and reports success', async ($, on) => {
    const store = settings([])
    const calls: string[] = []
    on('config.list', () => store.list())
    on('env.get', () => ({ value: '/home/dev' }))
    on('process.run', ($, e) => {
      calls.push(e.argv.join(' '))
      return out(0, '{"command":"install","outcome":"installed","plugin":"kube-pane@claude-mods"}')
    })

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-kube-pane' })
    expect(calls).toEqual(['claude plugin install kube-pane@claude-mods --scope user --json'])
    expect(await pane.find({ text: /Installed\. Turn it on/ })).toBeDefined()
  })

  test('Install shows the CLI error', async ($, on) => {
    on('config.list', () => settings([]).list())
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => out(1, '{"outcome":"failed","message":"Marketplace \\"claude-mods\\" not found"}', 'boom'))

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-pr-pane' })
    expect(await pane.find({ text: /Install failed: Marketplace "claude-mods" not found/ })).toBeDefined()
  })

  test('without the CLI the install command goes to the prompt', async ($, on) => {
    const filled: string[] = []
    on('config.list', () => settings([]).list())
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => {
      throw new Error('ENOENT')
    })
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-guardrails' })
    expect(filled).toEqual(['/plugin install guardrails@claude-mods'])
    expect(await pane.find({ text: /press Enter/ })).toBeDefined()
  })

  test('Install all installs every missing mod in order', async ($, on) => {
    const installed: string[] = []
    on('config.list', () => settings([row('live-diff', true), row('kube-pane', false)]).list())
    on('env.get', () => ({ value: undefined }))
    on('process.run', ($, e) => {
      installed.push(String(e.argv[3]))
      return out(0, '{"outcome":"installed"}')
    })

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-all' })
    expect(installed).toEqual([
      'pr-pane@claude-mods',
      'guardrails@claude-mods',
      'promote-branch@claude-mods',
      'codex-loop@claude-mods',
      'turn-done@claude-mods',
      'aws-profile@claude-mods',
    ])
  })
})

