import type { Elements, RenderSurface } from 'claude-code'

import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export function ProfileChip({ ui, profile, isProduction }: { ui: Ui; profile: string; isProduction: boolean }) {
  const { Box, Text } = ui
  const color = isProduction ? DRACULA.red : DRACULA.comment

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Text>
        <Text color={isProduction ? DRACULA.red : DRACULA.orange} bold={isProduction}>☁ </Text>
        <Text color={color} bold={isProduction} dimColor={profile === ''}>{profile === '' ? 'no AWS_PROFILE' : profile}</Text>
      </Text>
    </Box>
  )
}
