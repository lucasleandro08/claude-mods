import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const STATE = JSON.stringify({ enabled: { worktrees: true } })
const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'Worktrees', isFocused: false, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const out = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: exitCode ? 'fatal: contains modified files' : '', isStdoutTruncated: false, isStderrTruncated: false },
})

const PORCELAIN = [
  'worktree /code/app\nHEAD aaa\nbranch refs/heads/main',
  'worktree /code/app-done\nHEAD bbb\nbranch refs/heads/done',
  'worktree /code/app-wip\nHEAD ccc\nbranch refs/heads/wip',
  'worktree /code/app-fresh\nHEAD aaa\nbranch refs/heads/fresh',
].join('\n\n')

const PRS = JSON.stringify([
  { number: 7, state: 'MERGED', headRefName: 'done', url: 'u7' },
  { number: 9, state: 'OPEN', headRefName: 'wip', url: 'u9' },
])

function setup(on: On, calls: string[]) {
  on('fs.read', ($, e) => (e.path.endsWith('dracula-mods.json') ? { value: STATE } : { deny: 'missing' }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/dev' : undefined }))
  on('session.cwd', () => ({ value: '/code/app' }))
  on('fs.list', ($, e) => ({ value: e.path === '/code' ? [{ name: 'app-wip', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] : [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    calls.push(args)
    if (args.endsWith('worktree list --porcelain')) return out(PORCELAIN)
    if (args.includes('symbolic-ref')) return out('origin/main\n')
    if (args.includes('branch --merged')) return out('  done\n* main\n+ fresh\n')
    if (args.includes('rev-parse origin/main')) return out('aaa\n')
    if (args.includes('git -C /code/app-wip status')) return out(' M src/a.ts\n')
    if (args.includes('status --porcelain')) return out('')
    if (args.includes('pr list')) return out(PRS)
    if (args.includes('worktree remove')) return out('')
    return out('', 1)
  })
}

describe('worktrees', () => {
  for (const surface of SURFACES) {
    test(`chip counts worktrees and keeps the band beneath on ${surface}`, { options: { roots: '/code' } }, async ($, on) => {
      setup(on, [])
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return <Text>beneath</Text>
      })
      await $.command.run({ command: 'worktrees', args: '' } as never)

      const band = await $.ui.mount({ plugin: 'worktrees', surface, component: 'AbovePrompt', props: BAND })
      expect((await band.find({ type: 'Button', key: 'open-worktrees' }))?.props.label).toBe('3 worktrees')
      expect(await band.find({ text: /1 merged, can go/ })).toBeDefined()
      expect(await band.find({ text: 'beneath' })).toBeDefined()
    })
  }

  test('pane shows changes and PRs, and only offers Remove for clean merged worktrees', { options: { roots: '/code' } }, async ($, on) => {
    const calls: string[] = []
    setup(on, calls)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      const questions = (e as unknown as { questions: { question: string }[] }).questions
      return { result: { questions, answers: { [questions[0]?.question ?? '']: 'Remove' } } } as never
    })
    on('ui.toast', () => ({ value: undefined }))
    await $.command.run({ command: 'worktrees', args: '' } as never)

    const pane = await $.ui.mount({ plugin: 'worktrees', surface: 'desktop', component: 'Pane', requestId: 'worktrees', props: PANE })
    expect(await pane.find({ text: '#7 merged' })).toBeDefined()
    expect(await pane.find({ text: '#9 open' })).toBeDefined()
    expect(await pane.find({ text: '1 changed' })).toBeDefined()
    expect(await pane.find({ type: 'Button', key: 'remove-/code/app-wip' })).toBeUndefined()
    expect(await pane.find({ type: 'Button', key: 'remove-/code/app-fresh' })).toBeUndefined()

    await pane.press({ key: 'remove-/code/app-done' })
    expect(calls).toContain('git -C /code/app worktree remove /code/app-done')
    expect(calls.some(c => c.includes('--force'))).toBe(false)
    expect(calls.filter(c => c.endsWith('worktree list --porcelain')).length).toBeGreaterThan(1)
  })

  test('Terminal opens the worktree folder', async ($, on) => {
    const terminal: string[] = []
    setup(on, [])
    on('tool.call', { tool: 'mcp__terminal__run_in_terminal' }, ($, e) => {
      terminal.push(String(e.command))
      return { result: {} as never }
    })
    await $.command.run({ command: 'worktrees', args: '' } as never)
    const pane = await $.ui.mount({ plugin: 'worktrees', surface: 'desktop', component: 'Pane', requestId: 'worktrees', props: PANE })
    await pane.press({ key: 'terminal-/code/app-wip' })
    expect(terminal).toEqual(['cd /code/app-wip'])
  })
})

test('does nothing while disabled', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  const band = await $.ui.mount({ plugin: 'worktrees', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.findAll({ type: 'Button' })).length).toBe(0)
})
