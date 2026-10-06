import type { Elements, RenderSurface } from 'claude-code'

import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function ModsChip({ ui, on, total, onOpen }: { ui: Ui; on: number; total: number; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.purple} bold>⚙</Text>
      <Button key="open-mods" label={`Mods · ${on}/${total}`} dimColor onPress={onOpen} />
    </Box>
  )
}
