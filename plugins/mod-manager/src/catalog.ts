import type { ModEntry, ModState } from '../types'

export const MARKETPLACE = 'claude-mods'

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

export type ConfigRowLike = { key: string; value: unknown; isLocked: boolean; provider?: { plugin: string } }

// A plugin loaded from a folder names its rows `<name>.<field>`; one installed from a marketplace `<name>@<marketplace>.<field>`
export function isEnabledRow(row: ConfigRowLike, name: string) {
  if (!row.key.endsWith('.enabled')) return false
  const owner = row.key.slice(0, -'.enabled'.length)
  return owner === name || owner.startsWith(`${name}@`) || row.provider?.plugin === name
}

export function entries(rows: readonly ConfigRowLike[]): ModEntry[] {
  return CATALOG.map(mod => {
    const row = rows.find(r => isEnabledRow(r, mod.name))
    const state: ModState = !row ? 'missing' : row.isLocked ? 'locked' : row.value === true ? 'on' : 'off'
    return { ...mod, state, key: row?.key ?? `${mod.name}.enabled` }
  })
}

export function installCommand(name: string) {
  return `/plugin install ${name}@${MARKETPLACE}`
}
