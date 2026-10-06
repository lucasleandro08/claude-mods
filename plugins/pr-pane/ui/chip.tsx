import type { Elements, RenderSurface } from 'claude-code'

import type { PrRow } from '../types'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function PrChip({ ui, rows, onOpen }: { ui: Ui; rows: PrRow[]; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui
  const failing = rows.filter(r => r.checks === 'fail').length
  const findings = rows.filter(r => r.codex === 'findings').length

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.purple} bold>⑂</Text>
      <Button key="open-prs" label={`PRs · ${rows.length}`} dimColor onPress={onOpen} />
      {failing > 0 && <Text color={DRACULA.red}>✗ {failing} CI</Text>}
      {findings > 0 && <Text color={DRACULA.orange}>⚠ {findings} Codex</Text>}
    </Box>
  )
}
