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

export const REPO = 'lucasleandro08/claude-mods'

export type Installed = { enabledPlugins: Record<string, unknown>; pluginDirs: string[]; installedIds: string[]; marketplaces: string[] }

type KnownMarketplaces = Record<string, { source?: { repo?: string; url?: string } }>

// The marketplace keeps the name it had when it was added, so an older install may still call it claude-mods
export function ourMarketplaces(knownJson: string): string[] {
  let known: KnownMarketplaces = {}
  try {
    known = JSON.parse(knownJson) as KnownMarketplaces
  } catch {
    known = {}
  }
  const ours = Object.entries(known)
    .filter(([, entry]) => `${entry.source?.repo ?? ''} ${entry.source?.url ?? ''}`.toLowerCase().includes(REPO))
    .map(([name]) => name)
  return ours.length > 0 ? ours : [MARKETPLACE]
}

export function installedIds(installedJson: string): string[] {
  try {
    const parsed = JSON.parse(installedJson) as { plugins?: Record<string, unknown> }
    return Object.keys(parsed.plugins ?? {})
  } catch {
    return []
  }
}

export function readInstalled(
  settings: Readonly<Record<string, unknown>>,
  envDirs: string | undefined,
  knownJson = '',
  installedJson = '',
): Installed {
  const enabledPlugins = (settings.enabledPlugins ?? {}) as Record<string, unknown>
  const env = (settings.env ?? {}) as Record<string, unknown>
  const dirs = [envDirs, typeof env.CLAUDE_CODE_PLUGIN_DIRS === 'string' ? env.CLAUDE_CODE_PLUGIN_DIRS : undefined]
    .filter((d): d is string => typeof d === 'string' && d !== '')
    .flatMap(d => d.split(':'))
    .map(d => d.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return { enabledPlugins, pluginDirs: [...new Set(dirs)], installedIds: installedIds(installedJson), marketplaces: ourMarketplaces(knownJson) }
}

export function isInstalled(installed: Installed, name: string) {
  const ids = installed.marketplaces.map(m => `${name}@${m}`)
  const fromMarketplace = ids.some(id => installed.enabledPlugins[id] === true || installed.installedIds.includes(id))
  const fromFolder = installed.pluginDirs.some(dir => dir.split('/').pop() === name)
  return fromMarketplace || fromFolder
}

export function entries(installed: Installed, state: ModsState): ModEntry[] {
  return CATALOG.map(mod => {
    const status: ModState = !isInstalled(installed, mod.name) ? 'missing' : isOn(state, mod.name) ? 'on' : 'off'
    return { ...mod, state: status }
  })
}

export function installCommand(name: string, marketplace = MARKETPLACE) {
  return `/plugin install ${name}@${marketplace}`
}
