import type { ModEntry, ModState } from '../types'
import { isOn, MARKETPLACE, type ModsState } from './shared/toggle'

export const CATALOG = [
  { name: 'live-diff', title: 'Live Diff', summary: 'Diff of every edit Claude makes, with a file navigator' },
  { name: 'kube-pane', title: 'Kube Pane', summary: 'Kubernetes context chip, pods pane and a shell button' },
  { name: 'pr-pane', title: 'PR Pane', summary: 'Your open PRs with CI, Codex review and integration branch' },
  { name: 'guardrails', title: 'Guardrails', summary: 'Blocks risky shell commands, confirms production writes' },
  { name: 'promote-branch', title: 'Promote Branch', summary: '/promote merges your branch into the integration branch' },
  { name: 'codex-loop', title: 'Codex Loop', summary: '/codex-loop runs the Codex review loop on a PR' },
  { name: 'turn-done', title: 'Turn Done', summary: 'Toast and chime when a long turn finishes' },
  { name: 'aws-profile', title: 'AWS Profile', summary: 'Shows AWS_PROFILE above the prompt' },
] as const

export type Installed = { enabledPlugins: Record<string, unknown>; pluginDirs: string[] }

export function readInstalled(settings: Readonly<Record<string, unknown>>, envDirs: string | undefined): Installed {
  const enabledPlugins = (settings.enabledPlugins ?? {}) as Record<string, unknown>
  const env = (settings.env ?? {}) as Record<string, unknown>
  const dirs = [envDirs, typeof env.CLAUDE_CODE_PLUGIN_DIRS === 'string' ? env.CLAUDE_CODE_PLUGIN_DIRS : undefined]
    .filter((d): d is string => typeof d === 'string' && d !== '')
    .flatMap(d => d.split(':'))
    .map(d => d.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return { enabledPlugins, pluginDirs: [...new Set(dirs)] }
}

export function isInstalled(installed: Installed, name: string) {
  const fromMarketplace = installed.enabledPlugins[`${name}@${MARKETPLACE}`] === true
  const fromFolder = installed.pluginDirs.some(dir => dir.split('/').pop() === name)
  return fromMarketplace || fromFolder
}

export function entries(installed: Installed, state: ModsState): ModEntry[] {
  return CATALOG.map(mod => {
    const status: ModState = !isInstalled(installed, mod.name) ? 'missing' : isOn(state, mod.name) ? 'on' : 'off'
    return { ...mod, state: status }
  })
}

export function installCommand(name: string) {
  return `/plugin install ${name}@${MARKETPLACE}`
}
