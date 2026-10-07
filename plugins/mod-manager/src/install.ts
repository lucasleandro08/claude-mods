import type { Notice } from '../types'
import { MARKETPLACE } from './shared/toggle'

const CLAUDE_DIRS = ['.local/bin', '.claude/local', 'bin']

export function pluginId(name: string, marketplace = MARKETPLACE) {
  return `${name}@${marketplace}`
}

export function claudeCandidates(home: string | undefined, override: string) {
  const homeBins = home ? CLAUDE_DIRS.map(dir => `${home}/${dir}/claude`) : []
  return [override, 'claude', ...homeBins, '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].filter(bin => bin !== '')
}

export function installArgs(name: string, marketplace = MARKETPLACE) {
  return ['plugin', 'install', pluginId(name, marketplace), '--scope', 'user', '--json']
}

type InstallJson = { outcome?: string; message?: string }

export function readInstallResult(exitCode: number, stdout: string, stderr: string): Notice {
  const line = stdout.split('\n').find(l => l.trim().startsWith('{'))
  let parsed: InstallJson = {}
  try {
    parsed = line ? (JSON.parse(line) as InstallJson) : {}
  } catch {
    parsed = {}
  }

  if (exitCode === 0 && parsed.outcome !== 'failed') {
    return { tone: 'ok', text: 'Installed and reloaded. Turn it on.' }
  }
  const reason = parsed.message ?? stderr.trim().split('\n').pop() ?? `claude exited with ${exitCode}`
  return { tone: 'error', text: `Install failed: ${reason}` }
}
