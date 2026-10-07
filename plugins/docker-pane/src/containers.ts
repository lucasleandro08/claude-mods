import type { ContainerRow } from '../types'

export type { ContainerRow }
export type ContainerGroup = { project: string; rows: ContainerRow[] }

type DockerContainer = {
  ID?: string
  Names?: string
  Image?: string
  State?: string
  Status?: string
  Ports?: string
  CreatedAt?: string
  Labels?: string
}

export function parseLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {}
  let previous = ''
  for (const piece of text.split(',')) {
    const equals = piece.indexOf('=')
    if (equals < 0) {
      if (previous !== '') labels[previous] += `,${piece}`
      continue
    }
    const key = piece.slice(0, equals)
    labels[key] = piece.slice(equals + 1)
    previous = key
  }
  return labels
}

export function parseCreatedAt(text: string): number {
  const match = text.match(/^(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d:\d\d)\s+([+-]\d{2})(\d\d)(?:\s+.*)?$/)
  if (!match) return 0
  const value = Date.parse(`${match[1]}T${match[2]}${match[3]}:${match[4]}`)
  return Number.isNaN(value) ? 0 : value
}

export function publishedPorts(ports: string): string[] {
  const published = new Set<string>()
  for (const entry of ports.split(',')) {
    const arrow = entry.indexOf('->')
    if (arrow < 0) continue
    const host = entry.slice(0, arrow).trim()
    const container = entry.slice(arrow + 2).trim().replace(/\/[^/]+$/, '')
    const colon = host.lastIndexOf(':')
    if (colon < 0 || container === '') continue
    published.add(`${host.slice(colon + 1)}→${container}`)
  }
  return [...published]
}

export function parseDockerPs(stdout: string): ContainerRow[] {
  const rows: ContainerRow[] = []
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    let container: DockerContainer
    try {
      container = JSON.parse(line) as DockerContainer
    } catch {
      continue
    }
    const labels = parseLabels(container.Labels ?? '')
    rows.push({
      id: container.ID ?? '',
      name: container.Names ?? '',
      image: container.Image ?? '',
      state: container.State ?? '',
      status: container.Status ?? '',
      ports: publishedPorts(container.Ports ?? ''),
      createdAt: parseCreatedAt(container.CreatedAt ?? ''),
      project: labels['com.docker.compose.project'] ?? '',
      service: labels['com.docker.compose.service'] ?? '',
      workingDir: labels['com.docker.compose.project.working_dir'] ?? '',
      configFiles: (labels['com.docker.compose.project.config_files'] ?? '').split(',').filter(Boolean),
    })
  }
  return rows
}

export function isHealthy(row: ContainerRow): boolean {
  return row.state === 'running' && !row.status.toLowerCase().includes('unhealthy')
}

export function groupByProject(rows: ContainerRow[]): ContainerGroup[] {
  const groups = new Map<string, ContainerRow[]>()
  for (const row of rows) {
    const group = groups.get(row.project) ?? []
    group.push(row)
    groups.set(row.project, group)
  }
  return [...groups.entries()]
    .map(([project, group]) => ({
      project,
      rows: [...group].sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.project === '') return 1
      if (b.project === '') return -1
      const aRunning = a.rows.some(row => row.state === 'running')
      const bRunning = b.rows.some(row => row.state === 'running')
      return Number(bRunning) - Number(aRunning) || a.project.localeCompare(b.project)
    })
}

export function lastHeadMove(reflog: string): number {
  for (const line of reflog.split('\n')) {
    const match = line.match(/^(\d+)\s+(.*)$/)
    if (match && !(match[2] ?? '').startsWith('commit')) return Number(match[1]) * 1000
  }
  return 0
}

function cleanPath(path: string): string {
  const cleaned = path.replace(/\/+$/, '')
  return cleaned === '' && path.startsWith('/') ? '/' : cleaned
}

export function isStale(row: ContainerRow, repoRoot: string, headMovedAt: number): boolean {
  const work = cleanPath(row.workingDir)
  const root = cleanPath(repoRoot)
  const inside = (path: string, parent: string) => parent === '/' ? path.startsWith('/') : path === parent || path.startsWith(`${parent}/`)
  const related = inside(work, root) || inside(root, work)
  return headMovedAt > 0 && work !== '' && related && row.createdAt < headMovedAt
}

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`
}

export function logsCommand(row: ContainerRow): string {
  return `docker logs -f --tail 200 ${shellQuote(row.name)}`
}

export function recreateCommand(row: ContainerRow): string | undefined {
  if (row.project === '' || row.service === '') return undefined
  const files = row.configFiles.map(file => ` -f ${shellQuote(file)}`).join('')
  return `docker compose -p ${shellQuote(row.project)}${files} up -d --force-recreate ${shellQuote(row.service)}`
}

export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
