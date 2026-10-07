import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { classify, LOGIN_PATTERN, loginCommand, pickProfiles, withStatus } from '../src/sessions'
import { binaryCandidates } from '../src/shared/bin'
import { isOn, parseState, statePath } from '../src/shared/toggle'
import { barIsLive, sameChip, type Chip, type ChipPress } from '../src/shared/chip'
import { ProfileChip, profileChip } from '../ui/chip'

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

const chip = atom({ plugin: 'aws-profile', key: 'chip' } as const, null)

async function barOwnsChips($: EngineInterface) {
  const { value } = await $.state.get({ plugin: 'mod-manager', key: 'bar' })
  return barIsLive(value, Date.now())
}

async function setChip($: EngineInterface, next: Chip | null) {
  await update($, chip, prev => (sameChip(prev, next) ? prev : next))
}

const PENDING_WINDOW_MS = 180_000

const profile = atom({ plugin: 'aws-profile', key: 'profile' } as const, '')
const sessions = atom({ plugin: 'aws-profile', key: 'sessions' } as const, [])
const pending = atom({ plugin: 'aws-profile', key: 'pending' } as const, [])
let pendingUntil = 0
let fullCheckAt = 0

type Settings = { production: RegExp; profiles: string; awsPath: string; checkMs: number }

function readSettings(options: PluginOptions): Settings {
  return {
    production: new RegExp(String(options.productionPattern ?? 'prod'), 'i'),
    profiles: String(options.profiles ?? ''),
    awsPath: String(options.awsPath ?? ''),
    checkMs: Math.max(1, Number(options.checkMinutes ?? 5)) * 60_000,
  }
}

async function aws($: EngineInterface, settings: Settings, args: readonly string[]) {
  for (const bin of binaryCandidates('aws', await $.env.get('HOME'), settings.awsPath)) {
    try {
      return await $.process.run([bin, ...args], { timeoutMs: 20_000, env: { AWS_PAGER: '' } })
    } catch {
      continue
    }
  }
  return undefined
}

async function readProfile($: EngineInterface) {
  const current = (await $.env.get('AWS_PROFILE')) ?? ''
  await update($, profile, prev => (prev === current ? prev : current))
  return current
}

// Only the exit code matters: the identity the call prints is never kept or shown
async function checkProfile($: EngineInterface, settings: Settings, name: string) {
  const ran = await aws($, settings, ['sts', 'get-caller-identity', '--profile', name, '--output', 'text'])
  const state = ran === undefined ? 'error' : classify(ran.exitCode, ran.stderr)
  await update($, sessions, prev => withStatus(prev, name, state))
  if (state === 'valid') await update($, pending, prev => prev.filter(p => p !== name))
}

async function checkAll($: EngineInterface, settings: Settings) {
  const current = await readProfile($)
  const listed = settings.profiles === '' ? await aws($, settings, ['configure', 'list-profiles']) : undefined
  const names = pickProfiles(listed?.exitCode === 0 ? listed.stdout : '', settings.profiles, current)
  await update($, sessions, prev => names.map(name => prev.find(s => s.name === name) ?? { name, state: 'checking' as const }))
  await Promise.all(names.map(name => checkProfile($, settings, name)))
}

async function checkPending($: EngineInterface, settings: Settings) {
  const waiting = await read($, pending)
  if (waiting.length === 0) return
  if (Date.now() > pendingUntil) {
    await update($, pending, () => [])
    return
  }
  await Promise.all(waiting.map(name => checkProfile($, settings, name)))
}

async function tick($: EngineInterface, settings: Settings) {
  if (!(await isActive($))) return
  if (Date.now() - fullCheckAt < settings.checkMs) return checkPending($, settings)
  fullCheckAt = Date.now()
  await checkAll($, settings)
}

async function login($: EngineInterface, name: string) {
  try {
    await $.tool.call({ tool: 'mcp__terminal__run_in_terminal', command: loginCommand(name), title: `aws sso login ${name}`.slice(0, 40) })
    pendingUntil = Date.now() + PENDING_WINDOW_MS
    await update($, pending, prev => (prev.includes(name) ? prev : [...prev, name]))
  } catch (err) {
    $.ui.toast(`Could not open the terminal: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function publishChip($: EngineInterface, settings: Settings) {
  const next = (await read($, active))
    ? profileChip(await read($, profile), await read($, sessions), await read($, pending), name => settings.production.test(name))
    : null
  await setChip($, next)
}

async function pressProfile($: EngineInterface, action: string) {
  if (action.startsWith('login:')) await login($, action.slice('login:'.length))
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('state.set', async ($, e, next) => {
    const ran = await next(e)
    if (e.plugin === 'mod-manager' && e.key === 'press') {
      const pressed = e.value as ChipPress | null
      if (pressed?.plugin === MOD && (await isActive($))) await pressProfile($, pressed.action)
    }
    return ran
  })

  on('session.start', async ($, e, next) => {
    fullCheckAt = 0
    $.clock.every(CHECK_MS, () => void tick($, settings).catch(() => undefined))
    $.clock.every(CHECK_MS, () => void publishChip($, settings).catch(() => undefined))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const ran = await next(e)
    if (LOGIN_PATTERN.test(e.command)) await checkAll($, settings)
    else if (/\baws\b|AWS_PROFILE/.test(e.command)) await readProfile($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active)) || (await barOwnsChips($))) return next(e)
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ProfileChip
          ui={ui}
          profile={await read($, profile)}
          sessions={await read($, sessions)}
          pending={await read($, pending)}
          isProduction={name => settings.production.test(name)}
          onLogin={name => login($, name)}
        />
        {rest}
      </ui.Box>
    )
  })
}
