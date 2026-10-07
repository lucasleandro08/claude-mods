import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'Mods', isFocused: false, bodyColumns: 90, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

type World = {
  enabledPlugins?: Record<string, boolean>
  pluginDirs?: string
  state?: Record<string, boolean>
  writes?: string[]
  known?: string
  installed?: string
}

function world(on: On, w: World) {
  let file = w.state ? JSON.stringify({ enabled: w.state }) : ''
  on('settings.read', () => ({ value: { enabledPlugins: w.enabledPlugins ?? {} } }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/dev' : e.name === 'CLAUDE_CODE_PLUGIN_DIRS' ? w.pluginDirs : undefined }))
  on('fs.read', ($, e) => {
    if (e.path.endsWith('known_marketplaces.json')) return w.known ? { value: w.known } : { deny: 'missing' }
    if (e.path.endsWith('installed_plugins.json')) return w.installed ? { value: w.installed } : { deny: 'missing' }
    return file === '' ? { deny: 'missing' } : { value: file }
  })
  on('fs.write', ($, e) => {
    file = e.text
    w.writes?.push(`${e.path} ${e.text}`)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
}

const out = (exitCode: number, stdout: string, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

const OPEN = { command: 'mods', args: '' } as never

describe('mod-manager', () => {
  for (const surface of SURFACES) {
    test(`finds mods installed from the marketplace or a folder on ${surface}`, async ($, on) => {
      world(on, {
        enabledPlugins: { 'live-diff@dracula-mods': true, 'pr-pane@other-market': true },
        pluginDirs: '~/mods/kube-pane:/opt/mods/guardrails/',
        state: { 'live-diff': true },
      })
      await $.command.run(OPEN)

      const pane = await $.ui.mount({ plugin: 'mod-manager', surface, component: 'Pane', requestId: 'mod-manager', props: PANE })
      expect(await pane.find({ text: /1 of 11 on/ })).toBeDefined()
      expect((await pane.find({ type: 'Button', key: 'toggle-live-diff' }))?.props.label).toBe('Turn off')
      expect((await pane.find({ type: 'Button', key: 'toggle-kube-pane' }))?.props.label).toBe('Turn on')
      expect(await pane.find({ type: 'Button', key: 'toggle-guardrails' })).toBeDefined()
      expect(await pane.find({ type: 'Button', key: 'install-pr-pane' })).toBeDefined()
    })

    test(`chip counts mods on and keeps the band beneath on ${surface}`, async ($, on) => {
      world(on, { enabledPlugins: { 'live-diff@dracula-mods': true, 'kube-pane@dracula-mods': true }, state: { 'live-diff': true, 'kube-pane': true } })
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      await $.command.run(OPEN)

      const band = await $.ui.mount({ plugin: 'mod-manager', surface, component: 'AbovePrompt', props: BAND })
      expect((await band.find({ type: 'Button', key: 'open-mods' }))?.props.label).toBe('Mods · 2/11')
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }

  test('turning a mod on and off writes the shared state file', async ($, on) => {
    const writes: string[] = []
    world(on, { enabledPlugins: { 'kube-pane@dracula-mods': true }, writes })
    await $.command.run(OPEN)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'toggle-kube-pane' })
    expect(writes[0]).toContain('/home/dev/.claude/dracula-mods.json')
    expect(writes[0]).toContain('"kube-pane": true')
    expect((await pane.find({ type: 'Button', key: 'toggle-kube-pane' }))?.props.label).toBe('Turn off')

    await pane.press({ key: 'toggle-kube-pane' })
    expect(writes[1]).toContain('"kube-pane": false')
  })

  test('Install runs the claude CLI against dracula-mods and reloads the plugins', async ($, on) => {
    const calls: string[] = []
    const commands: string[] = []
    world(on, {})
    on('process.run', ($, e) => {
      calls.push(e.argv.join(' '))
      return out(0, '{"command":"install","outcome":"installed"}')
    })
    on('command.run', { command: 'reload-plugins' }, ($, e) => {
      commands.push(e.command)
      return { text: 'Reloaded' } as never
    })
    const clock = mock.clock(on)
    await $.command.run(OPEN)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-kube-pane' })
    await clock.advance(1)
    expect(calls).toEqual(['claude plugin install kube-pane@dracula-mods --scope user --json'])
    expect(await pane.find({ text: /Installed and reloaded/ })).toBeDefined()
    expect(commands).toEqual(['reload-plugins'])
  })

  test('Reload falls back to the prompt when the command cannot run here', async ($, on) => {
    const filled: string[] = []
    world(on, {})
    on('command.run', { command: 'reload-plugins' }, () => ({ text: "/reload-plugins isn't available over a remote connection in this session." }) as never)
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    const clock = mock.clock(on)
    await $.command.run(OPEN)
    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'reload' })
    await clock.advance(1)
    await clock.settle()
    expect(filled).toEqual(['/reload-plugins'])
  })

  test('Install shows the CLI error', async ($, on) => {
    world(on, {})
    on('process.run', () => out(1, '{"outcome":"failed","message":"Marketplace not found"}', 'boom'))
    await $.command.run(OPEN)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-pr-pane' })
    expect(await pane.find({ text: /Install failed: Marketplace not found/ })).toBeDefined()
  })

  test('without the CLI the install command goes to the prompt', async ($, on) => {
    const filled: string[] = []
    world(on, {})
    on('process.run', () => {
      throw new Error('ENOENT')
    })
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    await $.command.run(OPEN)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-guardrails' })
    expect(filled).toEqual(['/plugin install guardrails@dracula-mods'])
  })

  test('Install all installs every missing mod in order', async ($, on) => {
    const installed: string[] = []
    world(on, { enabledPlugins: { 'live-diff@dracula-mods': true, 'kube-pane@dracula-mods': true } })
    on('process.run', ($, e) => {
      installed.push(String(e.argv[3]))
      return out(0, '{"outcome":"installed"}')
    })
    let reloads = 0
    on('command.run', { command: 'reload-plugins' }, () => {
      reloads++
      return { text: 'Reloaded' } as never
    })
    const clock = mock.clock(on)
    await $.command.run(OPEN)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    await pane.press({ key: 'install-all' })
    await clock.advance(1)
    expect(reloads).toBe(1)
    expect(installed).toEqual([
      'pr-pane@dracula-mods',
      'guardrails@dracula-mods',
      'promote-branch@dracula-mods',
      'codex-loop@dracula-mods',
      'turn-done@dracula-mods',
      'aws-profile@dracula-mods',
      'docker-pane@dracula-mods',
      'deploy-watch@dracula-mods',
      'worktrees@dracula-mods',
    ])
  })

  test('opens itself at session start while no mod is on', async ($, on) => {
    const opened: string[] = []
    on('settings.read', () => ({ value: {} }))
    on('env.get', () => ({ value: undefined }))
    on('fs.read', () => ({ deny: 'missing' }))
    on('command.register', () => ({ value: undefined }) as never)
    on('ui.open', ($, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    on('session.start', () => ({ cwd: '/tmp' }) as never)
    const clock = mock.clock(on)
    await $.session.start({ source: 'startup' } as never).catch(() => undefined)
    await clock.advance(1)
    expect(opened).toEqual(['mod-manager'])
  })

  test('the chip can be hidden', { options: { showChip: false } }, async ($, on) => {
    world(on, {})
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>beneath</Text>
    })
    const band = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    expect(await band.find({ type: 'Button' })).toBeUndefined()
  })

  test('follows the name the marketplace was added under', async ($, on) => {
    const calls: string[] = []
    world(on, {
      known: JSON.stringify({
        'claude-mods': { source: { source: 'github', repo: 'lucasleandro08/claude-mods' } },
        other: { source: { source: 'github', repo: 'someone/else' } },
      }),
      installed: JSON.stringify({ version: 2, plugins: { 'kube-pane@claude-mods': [{ scope: 'user' }], 'guardrails@other': [{}] } }),
    })
    on('process.run', ($, e) => {
      calls.push(e.argv.join(' '))
      return out(0, '{"outcome":"installed"}')
    })
    await $.command.run(OPEN)

    const pane = await $.ui.mount({ plugin: 'mod-manager', surface: 'desktop', component: 'Pane', requestId: 'mod-manager', props: PANE })
    expect(await pane.find({ type: 'Button', key: 'toggle-kube-pane' })).toBeDefined()
    expect(await pane.find({ type: 'Button', key: 'install-guardrails' })).toBeDefined()
    await pane.press({ key: 'install-pr-pane' })
    expect(calls).toEqual(['claude plugin install pr-pane@claude-mods --scope user --json'])
  })
})

