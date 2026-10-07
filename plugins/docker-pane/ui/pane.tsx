import type { Elements, RenderSurface } from 'claude-code'

import { formatAge, groupByProject, isHealthy, isStale, recreateCommand, type ContainerRow } from '../src/containers'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export type Action = 'start' | 'stop' | 'restart' | 'logs' | 'recreate'

export type DockerPaneProps = {
  ui: Ui
  width: number
  containers: ContainerRow[]
  repoRoot: string
  headMovedAt: number
  isLoading: boolean
  error: string
  updatedAt: number
  busy: string
  hideStopped: boolean
  now: number
  onRefresh: () => unknown
  onToggleStopped: () => unknown
  onAction: (row: ContainerRow, action: Action) => unknown
}

export function DockerPane(props: DockerPaneProps) {
  const { ui, containers, isLoading, error, updatedAt, hideStopped } = props
  const { Box, Text, Button } = ui
  const running = containers.filter(c => c.state === 'running').length
  const shown = hideStopped ? containers.filter(c => c.state === 'running') : containers
  const groups = groupByProject(shown)
  const nameWidth = Math.max(12, Math.min(40, props.width - 62))

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={DRACULA.cyan} bold>🐳 Containers</Text>
        <Text color={DRACULA.comment}>{running} up · {containers.length - running} stopped</Text>
        <Box flexGrow={1} />
        <Text color={DRACULA.comment}>
          {isLoading ? 'refreshing…' : updatedAt > 0 ? `updated ${new Date(updatedAt).toTimeString().slice(0, 8)}` : ''}
        </Text>
        <Button key="toggle-stopped" label={hideStopped ? 'Show stopped' : 'Hide stopped'} dimColor onPress={props.onToggleStopped} />
        <Button key="refresh" label="Refresh" dimColor onPress={props.onRefresh} />
      </Box>
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}
      {groups.length === 0 && !isLoading && error === '' && <Text color={DRACULA.comment} italic>No containers.</Text>}
      {groups.map(group => (
        <Box key={`group-${group.project || 'standalone'}`} flexDirection="column" marginTop={1}>
          <Box backgroundColor={DRACULA.currentLine} paddingX={1}>
            <Text color={DRACULA.purple} bold>{group.project || 'standalone'}</Text>
          </Box>
          {group.rows.map(row => <ContainerView {...props} row={row} nameWidth={nameWidth} />)}
        </Box>
      ))}
    </Box>
  )
}

function ContainerView(props: DockerPaneProps & { row: ContainerRow; nameWidth: number }) {
  const { ui, row, nameWidth, now } = props
  const { Box, Text, Button } = ui
  const isUp = row.state === 'running'
  const stale = isStale(row, props.repoRoot, props.headMovedAt)
  const color = isUp ? (isHealthy(row) ? DRACULA.green : DRACULA.red) : DRACULA.comment
  const isBusy = props.busy === row.name
  const act = (action: Action) => () => props.onAction(row, action)

  return (
    <Box key={`container-${row.id}`} flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Box width={nameWidth}><Text color={isUp ? DRACULA.foreground : DRACULA.comment} wrap="truncate-middle">{row.service || row.name}</Text></Box>
        <Box width={14}><Text color={color} wrap="truncate-end">{statusLabel(row)}</Text></Box>
        <Box width={14}><Text color={DRACULA.cyan} wrap="truncate-end">{row.ports.join(' ')}</Text></Box>
        <Box width={5}><Text color={stale ? DRACULA.orange : DRACULA.comment}>{row.createdAt > 0 ? formatAge(now - row.createdAt) : ''}</Text></Box>
        {isBusy ? <Text color={DRACULA.yellow}>working…</Text> : (
          <Box flexDirection="row" gap={1}>
            {isUp
              ? <Button key={`restart-${row.id}`} label="Restart" dimColor plain onPress={act('restart')} />
              : <Button key={`start-${row.id}`} label="Start" dimColor plain onPress={act('start')} />}
            {isUp && <Button key={`stop-${row.id}`} label="Stop" dimColor plain onPress={act('stop')} />}
            <Button key={`logs-${row.id}`} label="Logs" dimColor plain onPress={act('logs')} />
            {recreateCommand(row) !== undefined && <Button key={`recreate-${row.id}`} label="Recreate" dimColor plain onPress={act('recreate')} />}
          </Box>
        )}
      </Box>
      {stale && (
        <Box paddingLeft={2}>
          <Text color={DRACULA.orange}>⚠ created before your last checkout: Recreate it before trusting a failure</Text>
        </Box>
      )}
    </Box>
  )
}

function statusLabel(row: ContainerRow) {
  if (row.state !== 'running') return row.status.replace(/^Exited/, 'exited').replace(/ ago$/, '')
  if (row.status.includes('unhealthy')) return 'unhealthy'
  if (row.status.includes('healthy')) return 'healthy'
  return 'running'
}

export function PaneError({ ui, message, onRefresh }: { ui: Ui; message: string; onRefresh: () => unknown }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={DRACULA.red}>Docker pane failed to draw: {message}</Text>
      <Button key="refresh" label="Refresh" dimColor onPress={onRefresh} />
    </Box>
  )
}
