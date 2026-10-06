import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const STATE = JSON.stringify({ enabled: { 'aws-profile': true } })
const turnOn = (on: On) =>
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))

const SURFACES = ['terminal', 'desktop'] as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

describe('aws-profile', () => {
  for (const surface of SURFACES) {
    test(`shows the AWS profile and keeps the band beneath on ${surface}`, async ($, on) => {
    turnOn(on)
      on('env.get', () => ({ value: 'prod-admin' }))
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      on('tool.call', { tool: 'Bash' }, () => ({ result: {} as never }))
      await $.tool.call({ tool: 'Bash', command: 'aws sts get-caller-identity' })

      const band = await $.ui.mount({ plugin: 'aws-profile', surface, component: 'AbovePrompt', props: BAND })
      const texts = await band.findAll({ type: 'Text', text: 'prod-admin' })
      expect(texts.some(t => t.props.color === '#ff5555')).toBe(true)
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }
})

test('does nothing while disabled', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'aws-profile', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} } })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
  expect((await band.findAll({})).length).toBe(1)
})
