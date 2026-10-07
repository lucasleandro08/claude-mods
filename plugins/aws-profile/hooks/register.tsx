import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ProfileChip } from '../ui/chip'
import { isOn, parseState, statePath } from '../src/shared/toggle'

const MOD = 'aws-profile'
const CHECK_MS = 5000
const active = atom({ plugin: 'aws-profile', key: 'active' } as const, false)
let checkedAt = 0

async function isActive($: EngineInterface) {
  if (Date.now() - checkedAt > CHECK_MS) {
    checkedAt = Date.now()
    const home = await $.env.get('HOME').catch(() => undefined)
    const text = await $.fs.read(statePath(home)).catch(() => '')
    const on = isOn(parseState(text), MOD)
    await update($, active, prev => (prev === on ? prev : on))
  }
  return read($, active)
}

const REFRESH_MS = 30_000

const profile = atom({ plugin: 'aws-profile', key: 'profile' } as const, '')

async function refresh($: EngineInterface) {
  const current = (await $.env.get('AWS_PROFILE')) ?? ''
  await update($, profile, prev => (prev === current ? prev : current))
}

export const register: Register = (on, options) => {
  const production = new RegExp(String(options.productionPattern ?? 'prod'), 'i')

  on('session.start', async ($, e, next) => {
    void isActive($)
    $.clock.every(CHECK_MS, () => void isActive($))
    void isActive($).then(enabled => (enabled ? refresh($) : undefined))
    $.clock.every(REFRESH_MS, () => void isActive($).then(enabled => (enabled ? refresh($) : undefined)))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const ran = await next(e)
    if (/\baws\b|AWS_PROFILE/.test(e.command)) await refresh($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active))) return next(e)
    const rest = await next(e)
    const current = await read($, profile)
    if (e.props.hasSurvey) return rest

    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ProfileChip ui={ui} profile={current} isProduction={production.test(current)} />
        {rest}
      </ui.Box>
    )
  })
}
