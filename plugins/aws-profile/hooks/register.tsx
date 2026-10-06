import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ProfileChip } from '../ui/chip'

const REFRESH_MS = 30_000

const profile = atom({ plugin: 'aws-profile', key: 'profile' } as const, '')

async function refresh($: EngineInterface) {
  const current = (await $.env.get('AWS_PROFILE')) ?? ''
  await update($, profile, prev => (prev === current ? prev : current))
}

export const register: Register = (on, options) => {
  const production = new RegExp(String(options.productionPattern ?? 'prod'), 'i')

  on('session.start', async ($, e, next) => {
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\baws\b|AWS_PROFILE/.test(e.command)) await refresh($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    const current = await read($, profile)
    if (e.props.hasSurvey || current === '') return rest

    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ProfileChip ui={ui} profile={current} isProduction={production.test(current)} />
        {rest}
      </ui.Box>
    )
  })
}
