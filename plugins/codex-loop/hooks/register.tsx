import type { Register } from 'claude-code'

import { loopPrompt, parseTarget } from '../src/prompt'

const USAGE = 'Usage: /codex-loop <PR url | owner/repo#123 | 123>'

export const register: Register = (on, options) => {
  const bot = String(options.codexBotLogin ?? 'chatgpt-codex-connector[bot]')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'codex-loop', description: 'Run the Codex review loop on a PR: /codex-loop <url | owner/repo#n | n>' })
    return next(e)
  })

  on('command.run', { command: 'codex-loop' }, async ($, e) => {
    const target = parseTarget(e.args)
    if (!target) return { text: USAGE }

    // prompt.submit cannot run inside command.run (it would wait on the turn the command holds)
    $.clock.after(0, () => {
      $.prompt.submit({ text: loopPrompt(target, bot), asUser: true }).catch(err =>
        $.ui.toast(`codex-loop could not start: ${err instanceof Error ? err.message : String(err)}`),
      )
    })

    return { text: `Codex review loop started for ${target.repo ?? ''}#${target.number}.` }
  })
}
