import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  changesKubeconfig,
  contextFlag,
  isKubeWrite,
  killedPorts,
  killsDockerEngine,
  portOwners,
  secretPrintReason,
} from '../src/rules'
import { binaryCandidates } from '../src/shared/bin'
import { isOn, parseState, statePath } from '../src/shared/toggle'

const MOD = 'guardrails'
const CHECK_MS = 5000
const active = atom({ plugin: 'guardrails', key: 'active' } as const, false)
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

async function run($: EngineInterface, name: string, args: readonly string[]) {
  for (const bin of binaryCandidates(name, await $.env.get('HOME'))) {
    try {
      return await $.process.run([bin, ...args], { timeoutMs: 5000 })
    } catch {
      continue
    }
  }
  return undefined
}

async function containersOnPorts($: EngineInterface, ports: readonly string[]) {
  const listed = await run($, 'docker', ['ps', '--format', '{{.Names}}\t{{.Ports}}'])
  return listed?.exitCode === 0 ? portOwners(listed.stdout, ports) : []
}

async function kubeContext($: EngineInterface, command: string) {
  const flag = contextFlag(command)
  if (flag) return flag
  const session = await $.env.get('CLAUDE_KUBE_CONTEXT')
  if (session) return session
  const current = await run($, 'kubectl', ['config', 'current-context'])
  return current?.exitCode === 0 ? current.stdout.trim() : ''
}

async function confirmProduction($: EngineInterface, context: string, command: string) {
  try {
    const answer = await $.ui.ask(`Run this kubectl command against ${context}? ${command.slice(0, 160)}`, {
      header: 'Production',
      options: ['Run it', 'Cancel'],
    })
    return answer === 'Run it'
  } catch {
    return false
  }
}

export const register: Register = (on, options) => {
  const production = new RegExp(String(options.productionPattern ?? 'prod'), 'i')

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const command = e.command

    if (options.blockKubeconfigChanges !== false && changesKubeconfig(command)) {
      return { deny: 'guardrails: changing the kubeconfig is blocked. Ask the user to run it, or pass --context per command.' }
    }

    if (options.blockSecretPrinting !== false) {
      const reason = secretPrintReason(command)
      if (reason) {
        return { deny: `guardrails: ${reason} To check presence use: [ -n "\${VAR:-}" ] && echo set || echo missing` }
      }
    }

    if (options.protectDockerPorts !== false) {
      if (killsDockerEngine(command)) {
        return { deny: 'guardrails: killing Docker processes takes the whole engine down. Use `docker stop <name>`.' }
      }
      const ports = killedPorts(command)
      if (ports.length > 0) {
        const owners = await containersOnPorts($, ports)
        if (owners.length > 0) {
          const list = owners.map(o => `:${o.port} → ${o.name}`).join(', ')
          return {
            deny: `guardrails: port published by a Docker container (${list}). Killing it can take the engine down. Use \`docker stop ${owners[0]?.name}\`.`,
          }
        }
      }
    }

    if (options.confirmProductionWrites !== false && isKubeWrite(command)) {
      const context = await kubeContext($, command)
      if (production.test(context) && !(await confirmProduction($, context, command))) {
        return { deny: `guardrails: the user did not approve a write on ${context}.` }
      }
    }

    return next(e)
  })
}
