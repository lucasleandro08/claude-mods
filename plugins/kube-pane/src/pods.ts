import type { PodRow } from '../types'

export type PodJson = {
  metadata: { name: string; creationTimestamp: string; deletionTimestamp?: string }
  spec?: { containers?: { name: string }[] }
  status: {
    phase?: string
    reason?: string
    containerStatuses?: {
      ready: boolean
      restartCount: number
      state?: { waiting?: { reason?: string }; terminated?: { reason?: string } }
    }[]
  }
}

export function shortContext(name: string) {
  return name.replace(/^arn:aws:eks:[^:]+:\d+:cluster\//, '')
}

export function withContext(command: string, context: string) {
  if (context === '' || !/\bkubectl\b/.test(command)) return command
  return command.replace(/\bkubectl\b(?![^|;&]*--context)/g, `kubectl --context '${context}'`)
}

export function shellCommand(context: string, namespace: string, pod: string, container?: string) {
  const target = container ? ` -c '${container}'` : ''
  return `kubectl --context '${context}' -n '${namespace}' exec -it '${pod}'${target} -- sh -c 'command -v bash >/dev/null && exec bash || exec sh'`
}

export function isHealthy(status: string) {
  return ['Running', 'Completed', 'Succeeded'].includes(status)
}

export function isSettling(status: string) {
  return ['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating'].includes(status)
}

export function toRows(items: readonly PodJson[], now: number): PodRow[] {
  return items
    .map(pod => {
      const statuses = pod.status.containerStatuses ?? []
      const waiting = statuses.map(s => s.state?.waiting?.reason ?? s.state?.terminated?.reason).find(Boolean)
      const status = pod.metadata.deletionTimestamp ? 'Terminating' : (waiting ?? pod.status.reason ?? pod.status.phase ?? 'Unknown')
      return {
        name: pod.metadata.name,
        ready: `${statuses.filter(s => s.ready).length}/${statuses.length}`,
        status,
        restarts: statuses.reduce((sum, s) => sum + s.restartCount, 0),
        ageMs: now - Date.parse(pod.metadata.creationTimestamp),
        containers: (pod.spec?.containers ?? []).map(c => c.name),
      }
    })
    .sort((a, b) => Number(isHealthy(a.status)) - Number(isHealthy(b.status)) || a.name.localeCompare(b.name))
}

export function visiblePods(list: readonly PodRow[], query: string, page: number, pageSize: number) {
  const needle = query.trim().toLowerCase()
  const matching = needle === '' ? list : list.filter(p => p.name.toLowerCase().includes(needle) || p.status.toLowerCase().includes(needle))
  const pages = Math.max(1, Math.ceil(matching.length / pageSize))
  const current = Math.min(Math.max(0, page), pages - 1)
  return { rows: matching.slice(current * pageSize, (current + 1) * pageSize), total: matching.length, pages, current }
}

export function formatAge(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function pickNamespace(available: readonly string[], current: string, preferred: string) {
  if (current !== '' && available.includes(current)) return current
  return [preferred, 'default'].find(n => available.includes(n)) ?? available[0] ?? preferred
}
