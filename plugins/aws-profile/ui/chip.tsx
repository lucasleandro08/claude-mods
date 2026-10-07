import type { Elements, RenderSurface } from 'claude-code'

import type { SessionStatus } from '../types'
import type { Chip, ChipPart } from '../src/shared/chip'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

type ChipProps = {
  ui: Ui
  profile: string
  sessions: SessionStatus[]
  pending: string[]
  isProduction: (name: string) => boolean
  onLogin: (name: string) => unknown
}

export function ProfileChip({ ui, profile, sessions, pending, isProduction, onLogin }: ChipProps) {
  const { Box, Text, Button } = ui

  if (sessions.length === 0) {
    const prod = isProduction(profile)
    return (
      <Box flexDirection="row" marginBottom={1}>
        <Text>
          <Text color={prod ? DRACULA.red : DRACULA.orange} bold={prod}>☁ </Text>
          <Text color={prod ? DRACULA.red : DRACULA.comment} bold={prod} dimColor={profile === ''}>{profile === '' ? 'no AWS_PROFILE' : profile}</Text>
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.orange}>☁</Text>
      {sessions.map(({ name, state }) => {
        const label = `${name === profile ? '● ' : ''}${name}`
        const color = isProduction(name) ? DRACULA.red : DRACULA.foreground
        if (pending.includes(name)) return <Text key={`aws-${name}`} color={DRACULA.yellow}>{label} ⟳</Text>
        if (state === 'valid') return <Text key={`aws-${name}`} color={color}>{label} <Text color={DRACULA.green}>✓</Text></Text>
        if (state === 'checking') return <Text key={`aws-${name}`} color={DRACULA.comment}>{label} …</Text>
        return <Button key={`login-${name}`} label={`${label} ✗ login`} dimColor onPress={() => onLogin(name)} />
      })}
    </Box>
  )
}

export function profileChip(profile: string, sessions: SessionStatus[], pending: string[], isProduction: (name: string) => boolean): Chip {
  if (sessions.length === 0) {
    const tone = profile === '' ? 'muted' : isProduction(profile) ? 'bad' : 'text'
    return { icon: '☁', label: 'aws', tone: 'warn', parts: [{ text: profile === '' ? 'no AWS_PROFILE' : profile, tone }] }
  }
  const parts: ChipPart[] = sessions.flatMap(({ name, state }): ChipPart[] => {
    const label = `${name === profile ? '● ' : ''}${name}`
    const tone = isProduction(name) ? 'bad' : 'text'
    if (pending.includes(name)) return [{ text: `${label} ⟳`, tone: 'warn' }]
    if (state === 'valid') return [{ text: label, tone }, { text: '✓', tone: 'ok' }]
    if (state === 'checking') return [{ text: `${label} …`, tone: 'muted' }]
    return [{ text: `${label} ✗ login`, tone: 'bad', action: `login:${name}` }]
  })
  return { icon: '☁', label: 'aws', tone: 'warn', parts }
}
