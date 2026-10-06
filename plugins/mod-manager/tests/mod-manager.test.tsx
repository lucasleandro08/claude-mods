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
      expect(await pane.find({ text: /\/plugin install pr-pane@claude-mods/ })).toBeDefined()
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
})
