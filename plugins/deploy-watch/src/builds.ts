import type { BuildRow, ChipKind, Project } from '../types'

// --query keeps only these fields, so build environment variables never reach the mod
export const BUILD_QUERY =
  'builds[].{id:id,number:buildNumber,status:buildStatus,phase:currentPhase,source:sourceVersion,resolved:resolvedSourceVersion,start:startTime,end:endTime,group:logs.groupName,stream:logs.streamName}'

type BuildJson = {
  id?: string
  number?: number
  status?: string
  phase?: string
  source?: string | null
  resolved?: string | null
  start?: string | number | null
  end?: string | number | null
  group?: string | null
  stream?: string | null
}

export function parseProjects(option: string): Project[] {
  return option
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [name = '', branch = ''] = entry.split('=').map(part => part.trim())
      return { name, branch }
    })
    .filter(project => project.name !== '')
}

export function parseTime(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  if (!value) return 0
  const parsed = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function toBuildRows(stdout: string): BuildRow[] {
  let parsed: BuildJson[] = []
  try {
    parsed = JSON.parse(stdout) as BuildJson[]
  } catch {
    return []
  }
  return (Array.isArray(parsed) ? parsed : [])
    .map(build => ({
      id: build.id ?? '',
      number: build.number ?? 0,
      status: build.status ?? 'UNKNOWN',
      phase: build.phase ?? '',
      commit: (build.resolved || build.source || '').replace(/^refs\/heads\//, ''),
      startedAt: parseTime(build.start),
      endedAt: parseTime(build.end),
      logGroup: build.group ?? '',
      logStream: build.stream ?? '',
    }))
    .sort((a, b) => b.startedAt - a.startedAt)
}

export function pushedProjects(command: string, projects: Project[]): string[] {
  const push = /\bgit\s+(?:-C\s+\S+\s+)?push\b([^;&|\n]*)/g
  const targets = [...command.matchAll(push)].map(match => match[1] ?? '')
  if (targets.length === 0) return []
  return projects
    .filter(p => p.branch !== '' && targets.some(args => new RegExp(`(^|[\\s:/])${escape(p.branch)}(\\s|$)`).test(args)))
    .map(p => p.name)
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type ChipState = { kind: ChipKind; label: string }

export function chipState(builds: BuildRow[], pushedAt: number, now: number, missingMs: number): ChipState {
  const latest = builds[0]
  if (pushedAt > 0 && !builds.some(b => b.startedAt >= pushedAt - 30_000)) {
    const waited = now - pushedAt
    return waited > missingMs ? { kind: 'missing', label: `no build ${formatAgo(waited)} after push` } : { kind: 'running', label: 'waiting for build' }
  }
  if (!latest) return { kind: 'idle', label: 'no builds' }
  if (latest.status === 'IN_PROGRESS') return { kind: 'running', label: `#${latest.number} ${latest.phase.toLowerCase()} ${formatAgo(now - latest.startedAt)}` }
  if (latest.status === 'SUCCEEDED') return { kind: 'ok', label: `#${latest.number} ${formatAgo(now - latest.endedAt)} ago` }
  return { kind: 'failed', label: `#${latest.number} ${latest.status.toLowerCase().replace('_', ' ')}` }
}

export function isSettled(builds: BuildRow[], pushedAt: number) {
  return builds[0]?.status !== 'IN_PROGRESS' && (pushedAt === 0 || builds.some(b => b.startedAt >= pushedAt - 30_000))
}

export function formatAgo(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 172_800) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86_400)}d`
}

export function quote(value: string) {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

export function awsFlags(profile: string, region: string): string[] {
  return [...(profile ? ['--profile', profile] : []), ...(region ? ['--region', region] : [])]
}

export function logsCommand(build: BuildRow, profile: string, region: string) {
  return ['aws', 'logs', 'tail', build.logGroup, '--log-stream-names', build.logStream, '--follow', ...awsFlags(profile, region)].map(quote).join(' ')
}
