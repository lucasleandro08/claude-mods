import { describe, expect, test } from 'claude-code/testing'

import {
  formatAge,
  groupByProject,
  isHealthy,
  isStale,
  lastHeadMove,
  logsCommand,
  parseCreatedAt,
  parseDockerPs,
  parseLabels,
  publishedPorts,
  recreateCommand,
  shellQuote,
} from '../src/containers'

function at<T>(rows: T[], index: number): T {
  const row = rows[index]
  if (row === undefined) throw new Error(`no row ${index}`)
  return row
}

describe('docker containers', () => {
  test('parses labels with comma-containing values', () => {
    expect(parseLabels('one=1,com.docker.compose.project.config_files=/a.yml,/b.yml,two=2')).toEqual({
      one: '1',
      'com.docker.compose.project.config_files': '/a.yml,/b.yml',
      two: '2',
    })
  })

  test('parses Docker dates and published ports', () => {
    expect(parseCreatedAt('2026-10-06 09:08:07 -0300 -03')).toBe(Date.parse('2026-10-06T09:08:07-03:00'))
    expect(parseCreatedAt('2026-10-06 12:08:07 +0000 UTC')).toBe(Date.parse('2026-10-06T12:08:07+00:00'))
    expect(parseCreatedAt('nope')).toBe(0)
    expect(publishedPorts('0.0.0.0:8082->80/tcp, [::]:8082->80/tcp, 6379/tcp, 0.0.0.0:8000-8001->8000-8001/tcp')).toEqual(['8082→80', '8000-8001→8000-8001'])
  })

  test('parses valid ps lines and skips invalid ones', () => {
    const output = [
      JSON.stringify({
        ID: 'abc', Names: 'web', Image: 'nginx', State: 'running', Status: 'Up 2m (healthy)', Ports: '0.0.0.0:8080->80/tcp', CreatedAt: '2026-10-06 12:08:07 +0000 UTC',
        Labels: 'com.docker.compose.project=app,com.docker.compose.service=web,com.docker.compose.project.working_dir=/repo,com.docker.compose.project.config_files=/repo/a.yml,/repo/b.yml',
      }),
      'not json',
      '',
    ].join('\n')
    expect(parseDockerPs(output)).toEqual([{
      id: 'abc', name: 'web', image: 'nginx', state: 'running', status: 'Up 2m (healthy)', ports: ['8080→80'],
      createdAt: Date.parse('2026-10-06T12:08:07+00:00'), project: 'app', service: 'web', workingDir: '/repo', configFiles: ['/repo/a.yml', '/repo/b.yml'],
    }])
  })

  test('orders rows and projects by activity', () => {
    const rows = parseDockerPs([
      JSON.stringify({ ID: '1', Names: 'z', State: 'exited', Labels: 'com.docker.compose.project=beta' }),
      JSON.stringify({ ID: '2', Names: 'b', State: 'running', Labels: 'com.docker.compose.project=alpha' }),
      JSON.stringify({ ID: '3', Names: 'a', State: 'exited', Labels: 'com.docker.compose.project=alpha' }),
      JSON.stringify({ ID: '4', Names: 'loose', State: 'running' }),
    ].join('\n'))
    expect(groupByProject(rows).map(group => [group.project, group.rows.map(row => row.name)])).toEqual([
      ['alpha', ['b', 'a']], ['beta', ['z']], ['', ['loose']],
    ])
    expect(isHealthy(at(rows, 1))).toBe(true)
    expect(isHealthy({ ...at(rows, 1), status: 'Up (unhealthy)' })).toBe(false)
  })

  test('detects stale related compose directories and head movement', () => {
    const row = at(parseDockerPs(JSON.stringify({ ID: '1', Names: 'web', CreatedAt: '2026-01-01 00:00:00 +0000 UTC', Labels: 'com.docker.compose.project.working_dir=/repo/app/' })), 0)
    const moved = lastHeadMove('1780000000 commit: work\n1770000000 checkout: moving from a to b\n')
    expect(moved).toBe(1770000000000)
    expect(lastHeadMove('1770000000 commit (amend): work')).toBe(0)
    expect(isStale(row, '/repo/app/sub/', moved)).toBe(true)
    expect(isStale(row, '/other', moved)).toBe(false)
    expect(isStale(row, '/repo/app', 0)).toBe(false)
  })

  test('builds safe commands and concise ages', () => {
    const row = at(parseDockerPs(JSON.stringify({ ID: '1', Names: 'web app', Labels: 'com.docker.compose.project=my app,com.docker.compose.service=web,com.docker.compose.project.config_files=/a.yml,/b file.yml' })), 0)
    expect(shellQuote('plain/file')).toBe('plain/file')
    expect(shellQuote("it's")).toBe("'it'\\''s'")
    expect(logsCommand(row)).toBe("docker logs -f --tail 200 'web app'")
    expect(recreateCommand(row)).toBe("docker compose -p 'my app' -f /a.yml -f '/b file.yml' up -d --force-recreate web")
    expect(recreateCommand({ ...row, service: '' })).toBe(undefined)
    expect([formatAge(45_000), formatAge(5 * 60_000), formatAge(3 * 60 * 60_000), formatAge(2 * 24 * 60 * 60_000)]).toEqual(['45s', '5m', '3h', '2d'])
  })
})
