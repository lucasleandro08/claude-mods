import type { Elements, RenderSurface } from 'claude-code'

import { shortContext } from '../src/pods'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function ContextChip({ ui, context, isProduction, onOpen }: { ui: Ui; context: string; isProduction: boolean; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={isProduction ? DRACULA.red : DRACULA.cyan} bold>⎈</Text>
      <Button key="open-pods" label={shortContext(context)} dimColor onPress={onOpen} />
      {isProduction && <Text color={DRACULA.red} bold>PROD</Text>}
    </Box>
  )
}
