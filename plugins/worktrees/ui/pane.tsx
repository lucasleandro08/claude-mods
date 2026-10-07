import type { Elements, RenderSurface } from 'claude-code'

import type { RepoRow, WorktreeRow } from '../types'
import { shortPath } from '../src/worktrees'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export type WorktreesPaneProps = {
  ui: Ui
  width: number
  home: string
  cwd: string
  repos: RepoRow[]
  isLoading: boolean
  error: string
  updatedAt: number
  busy: string
  onRefresh: () => unknown
  onTerminal: (row: WorktreeRow) => unknown
  onRemove: (repo: RepoRow, rows: WorktreeRow[]) => unknown
}

export function canRemove(row: WorktreeRow, cwd: string) {
  return !row.isMain && row.isMerged && row.changes === 0 && !row.isLocked && cwd !== row.path && !cwd.startsWith(`${row.path}/`)
}

export function WorktreesPane(props: WorktreesPaneProps) {
  const { ui, repos, isLoading, error, updatedAt } = props
  const { Box, Text, Button } = ui
  const total = repos.reduce((n, repo) => n + repo.worktrees.length, 0)

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={DRACULA.green} bold>🌳 Worktrees</Text>
        <Text color={DRACULA.comment}>{total} in {repos.length} repo{repos.length === 1 ? '' : 's'}</Text>
        <Box flexGrow={1} />
        <Text color={DRACULA.comment}>
          {isLoading ? 'refreshing…' : updatedAt > 0 ? `updated ${new Date(updatedAt).toTimeString().slice(0, 8)}` : ''}
        </Text>
        <Button key="refresh" label="Refresh" dimColor onPress={props.onRefresh} />
      </Box>
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}
      {repos.length === 0 && !isLoading && (
        <Text color={DRACULA.comment} italic>No extra worktrees here. Add folders that hold your repos in /config → worktrees → Roots.</Text>
      )}
      {repos.map(repo => <RepoView {...props} repo={repo} />)}
    </Box>
  )
}

function RepoView(props: WorktreesPaneProps & { repo: RepoRow }) {
  const { ui, repo, home, cwd } = props
  const { Box, Text, Button } = ui
  const removable = repo.worktrees.filter(row => canRemove(row, cwd))
  const branchWidth = Math.max(14, Math.min(44, props.width - 46))

  return (
    <Box key={`repo-${repo.main}`} flexDirection="column" marginTop={1}>
      <Box flexDirection="row" alignItems="center" gap={1} backgroundColor={DRACULA.currentLine} paddingX={1}>
        <Text color={DRACULA.purple} bold>{shortPath(repo.main, home)}</Text>
        {repo.branch !== '' && <Text color={DRACULA.comment}>⑂ {repo.branch}</Text>}
        <Box flexGrow={1} />
        {removable.length > 1 && (
          <Button key={`remove-merged-${repo.main}`} label={`Remove ${removable.length} merged`} dimColor plain onPress={() => props.onRemove(repo, removable)} />
        )}
      </Box>
      {repo.worktrees.map(row => (
        <Box key={`worktree-${row.path}`} flexDirection="row" paddingX={1} gap={1}>
          <Box width={branchWidth}>
            <Text color={row.branch === '' ? DRACULA.comment : DRACULA.foreground} wrap="truncate-middle">{row.branch || `detached ${row.head.slice(0, 7)}`}</Text>
          </Box>
          <Box width={10}>
            <Text color={row.changes > 0 ? DRACULA.orange : DRACULA.comment}>{row.changes > 0 ? `${row.changes} changed` : 'clean'}</Text>
          </Box>
          <Box width={12}><PrLabel ui={ui} row={row} /></Box>
          {props.busy === row.path ? <Text color={DRACULA.yellow}>removing…</Text> : (
            <Box flexDirection="row" gap={1}>
              <Button key={`terminal-${row.path}`} label="Terminal" dimColor plain onPress={() => props.onTerminal(row)} />
              {canRemove(row, cwd) && <Button key={`remove-${row.path}`} label="Remove" dimColor plain onPress={() => props.onRemove(repo, [row])} />}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

function PrLabel({ ui, row }: { ui: Ui; row: WorktreeRow }) {
  const { Text } = ui
  if (row.pr) {
    const color = row.pr.state === 'OPEN' ? DRACULA.green : row.pr.state === 'MERGED' ? DRACULA.purple : DRACULA.red
    return <Text color={color}>#{row.pr.number} {row.pr.state.toLowerCase()}</Text>
  }
  if (row.isMerged) return <Text color={DRACULA.purple}>merged</Text>
  return <Text color={DRACULA.comment}>no PR</Text>
}

export function PaneError({ ui, message, onRefresh }: { ui: Ui; message: string; onRefresh: () => unknown }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={DRACULA.red}>Worktrees pane failed to draw: {message}</Text>
      <Button key="refresh" label="Refresh" dimColor onPress={onRefresh} />
    </Box>
  )
}
