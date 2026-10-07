import type { Elements, RenderSurface } from 'claude-code'

import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function WorktreesChip({ ui, total, merged, onOpen }: { ui: Ui; total: number; merged: number; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.green}>🌳</Text>
      <Button key="open-worktrees" label={`${total} worktree${total === 1 ? '' : 's'}`} dimColor onPress={onOpen} />
      {merged > 0 && <Text color={DRACULA.purple}>{merged} merged, can go</Text>}
    </Box>
  )
}
