import type { Elements, RenderSurface } from 'claude-code'

import type { PrRow } from '../types'
import type { Chip } from '../src/shared/chip'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function PrChip({ ui, rows, onOpen }: { ui: Ui; rows: PrRow[]; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui
  const failing = rows.filter(r => r.checks === 'fail').length
  const findings = rows.filter(r => r.codex === 'findings').length

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.purple} bold>⑂</Text>
      <Button key="open-prs" label={rows.length === 0 ? 'PRs' : `PRs · ${rows.length}`} dimColor onPress={onOpen} />
      {failing > 0 && <Text color={DRACULA.red}>✗ {failing} CI</Text>}
      {findings > 0 && <Text color={DRACULA.orange}>⚠ {findings} Codex</Text>}
    </Box>
  )
}

export function prChip(rows: PrRow[]): Chip {
  const failing = rows.filter(r => r.checks === 'fail').length
  const findings = rows.filter(r => r.codex === 'findings').length
  return {
    icon: '⑂',
    label: 'prs',
    tone: 'accent',
    parts: [
      { text: rows.length === 0 ? 'open' : `${rows.length} open`, tone: 'text', action: 'open' },
      ...(failing > 0 ? [{ text: `✗ ${failing} CI`, tone: 'bad' as const }] : []),
      ...(findings > 0 ? [{ text: `⚠ ${findings} Codex`, tone: 'warn' as const }] : []),
    ],
  }
}
