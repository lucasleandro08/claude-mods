import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { formatElapsed } from '../src/format'
import { isOn, parseState, statePath } from '../src/shared/toggle'

const MOD = 'turn-done'
const CHECK_MS = 5000
const active = atom({ plugin: 'turn-done', key: 'active' } as const, false)
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

export const register: Register = (on, options) => {
  const thresholdMs = Math.max(1, Number(options.thresholdSeconds ?? 60)) * 1000
  const playSound = options.playSound !== false

  on('turn.complete', async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const done = await next(e)
    if (e.agentId !== undefined || e.isAborted || e.durationMs < thresholdMs) return done

    $.ui.toast(`Done after ${formatElapsed(e.durationMs)}`)
    if (playSound) $.audio.play({ asset: 'assets/chime.wav' }).catch(() => undefined)

    return done
  })
}
