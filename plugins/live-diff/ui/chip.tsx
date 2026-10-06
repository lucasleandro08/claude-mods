import type { Elements, RenderSurface } from 'claude-code'

import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function DiffChip({ ui, count, onOpen }: { ui: Ui; count: number; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui
  const label = count === 0 ? 'Diff' : `Diff · ${count} ${count === 1 ? 'edit' : 'edits'}`

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.purple} bold>Δ</Text>
      <Button key="open-diff" label={label} dimColor onPress={onOpen} />
    </Box>
  )
}
