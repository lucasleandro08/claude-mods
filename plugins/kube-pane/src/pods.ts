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

const COMMAND_POSITION = /((?:^|[|;&(`]|\$\()\s*(?:\w+=\S*\s+)*(?:(?:sudo|watch|time|exec)\s+(?:-\S+\s+)*)?)kubectl\b/g

function isQuoted(text: string, index: number) {
  let single = false
  let double = false
  for (let i = 0; i < index; i++) {
    const ch = text[i]
    if (ch === '\\') i++
    else if (ch === "'" && !double) single = !single
    else if (ch === '"' && !single) double = !double
  }
  return single || double
}

// Only rewrites kubectl in command position, outside quotes and before a heredoc body
export function withContext(command: string, context: string) {
  if (context === '' || !command.includes('kubectl')) return command

  const lines = command.split('\n')
  const heredoc = lines.findIndex(line => line.includes('<<'))
  const last = heredoc < 0 ? lines.length - 1 : heredoc

  return lines
    .map((line, n) => {
      if (n > last) return line
      return line.replace(COMMAND_POSITION, (match, prefix: string, offset: number) => {
        const at = offset + prefix.length
        const segment = line.slice(at).split(/[|;&]/)[0] ?? ''
        if (isQuoted(line, at) || segment.includes('--context')) return match
        return `${prefix}kubectl --context '${context}'`
      })
    })
    .join('\n')
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
