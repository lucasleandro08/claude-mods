import type { Elements, RenderSurface } from 'claude-code'

import type { BranchState, CheckState, PrRow } from '../types'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export type PrPaneProps = {
  ui: Ui
  rows: PrRow[]
  isLoading: boolean
  error: string
  updatedAt: number
  integrationBranch: string
  onRefresh: () => unknown
}

export function PrPane({ ui, rows, isLoading, error, updatedAt, integrationBranch, onRefresh }: PrPaneProps) {
  const { Box, Text, Button } = ui
  const repos = [...new Set(rows.map(r => r.repo))]

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={DRACULA.purple} bold>⑂ Pull requests</Text>
        <Text color={DRACULA.comment}>{rows.length} open</Text>
        <Box flexGrow={1} />
        <Text color={DRACULA.comment}>
          {isLoading ? 'refreshing…' : updatedAt > 0 ? `updated ${new Date(updatedAt).toTimeString().slice(0, 5)}` : ''}
        </Text>
        <Button key="refresh" label="Refresh" dimColor onPress={onRefresh} />
      </Box>
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}
      {rows.length === 0 && !isLoading && error === '' && <Text color={DRACULA.comment} italic>No open PRs.</Text>}

      {repos.map(repo => (
        <Box flexDirection="column" marginTop={1}>
          <Box backgroundColor={DRACULA.currentLine} paddingX={1}>
            <Text color={DRACULA.pink} bold>{repo}</Text>
          </Box>
          {rows.filter(r => r.repo === repo).map(row => <PrRowView ui={ui} row={row} integrationBranch={integrationBranch} />)}
        </Box>
      ))}
    </Box>
  )
}

function PrRowView({ ui, row, integrationBranch }: { ui: Ui; row: PrRow; integrationBranch: string }) {
  const { Box, Text, Link } = ui

  return (
    <Box key={`pr-${row.repo}-${row.number}`} flexDirection="column" paddingX={1} marginTop={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={DRACULA.comment}>#{row.number}</Text>
        {row.isDraft && <Text color={DRACULA.comment} italic>draft</Text>}
        <Link href={row.url} label={row.title} />
      </Box>
      <Box flexDirection="row" gap={2} paddingLeft={2}>
        <ChecksBadge ui={ui} state={row.checks} />
        <CodexBadge ui={ui} row={row} />
        <BranchBadge ui={ui} state={row.integration} branch={integrationBranch} />
      </Box>
    </Box>
  )
}

function ChecksBadge({ ui, state }: { ui: Ui; state: CheckState }) {
  const { Text } = ui
  if (state === 'pass') return <Text color={DRACULA.green}>✓ CI</Text>
  if (state === 'fail') return <Text color={DRACULA.red} bold>✗ CI</Text>
  if (state === 'pending') return <Text color={DRACULA.yellow}>● CI</Text>
  return <Text color={DRACULA.comment}>– CI</Text>
}

function CodexBadge({ ui, row }: { ui: Ui; row: PrRow }) {
  const { Text } = ui
  if (row.codex === 'clean') return <Text color={DRACULA.green}>👍 Codex</Text>
  if (row.codex === 'findings') return <Text color={DRACULA.orange}>⚠ Codex {row.codexReviews}</Text>
  if (row.codex === 'reviewing') return <Text color={DRACULA.yellow}>👀 Codex</Text>
  return <Text color={DRACULA.comment}>– Codex</Text>
}

function BranchBadge({ ui, state, branch }: { ui: Ui; state: BranchState; branch: string }) {
  const { Text } = ui
  if (state === 'in') return <Text color={DRACULA.cyan}>✓ {branch}</Text>
  if (state === 'out') return <Text color={DRACULA.comment}>○ {branch}</Text>
  return undefined
}
