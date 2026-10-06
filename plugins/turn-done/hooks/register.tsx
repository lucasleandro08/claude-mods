import type { Register } from 'claude-code'

import { formatElapsed } from '../src/format'

export const register: Register = (on, options) => {
  if (options.enabled !== true) return

  const thresholdMs = Math.max(1, Number(options.thresholdSeconds ?? 60)) * 1000
  const playSound = options.playSound !== false

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.isAborted || e.durationMs < thresholdMs) return done

    $.ui.toast(`Done after ${formatElapsed(e.durationMs)}`)
    if (playSound) $.audio.play({ asset: 'assets/chime.wav' }).catch(() => undefined)

    return done
  })
}
