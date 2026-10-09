import type { Elements, RenderSurface } from 'claude-code'

import type { Chip } from '../src/shared/chip'
import type { Goal, Profile } from '../types'
import { byStatus } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const DONE_SHOWN = 5

export function dotChip(profile: Profile, goals: Goal[]): Chip {
  const { waiting, active } = byStatus(goals)
  const label = profile.name.toLowerCase()
  if (profile.paused) return { icon: profile.emoji, label, tone: 'muted', parts: [{ text: 'paused', tone: 'text', action: 'open' }] }
  if (waiting.length > 0) {
    return { icon: profile.emoji, label, tone: 'warn', parts: [{ text: `${waiting.length} waiting on you`, tone: 'text', action: 'open' }] }
  }
  const text = active.length === 0 ? 'idle' : `${active.length} goal${active.length === 1 ? '' : 's'}`
  return { icon: profile.emoji, label, tone: 'accent', parts: [{ text, tone: 'text', action: 'open' }] }
}

export type DotPaneProps = {
  ui: Ui
  profile: Profile
  goals: Goal[]
  notice: string
  memoryPath: string
  onAdd: (title: string) => unknown
  onAnswer: (id: string, answer: string) => unknown
  onDone: (id: string) => unknown
  onRemove: (id: string) => unknown
  onPause: () => unknown
  onRunNow: () => unknown
  onSchedule: () => unknown
}

export function DotPane(props: DotPaneProps) {
  const { ui, profile, goals, notice } = props
  const { Box, Text, Button } = ui
  const { waiting, active, done } = byStatus(goals)

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1} rowGap={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={DRACULA.purple} bold>{profile.emoji} {profile.name}</Text>
        <Text color={profile.paused ? DRACULA.orange : profile.scheduled ? DRACULA.green : DRACULA.comment}>
          {profile.paused ? 'paused' : profile.scheduled ? 'working in the background' : 'background work off'}
        </Text>
        <Box flexGrow={1} />
        {!profile.scheduled && <Button key="schedule" label="Turn on background work" dimColor onPress={props.onSchedule} />}
        {profile.scheduled && <Button key="run-now" label="Run now" dimColor onPress={props.onRunNow} />}
        {profile.scheduled && <Button key="pause" label={profile.paused ? 'Resume' : 'Pause'} dimColor onPress={props.onPause} />}
      </Box>
      {notice !== '' && <Text color={DRACULA.cyan}>{notice}</Text>}

      <GoalInput ui={ui} onAdd={props.onAdd} />

      {waiting.length > 0 && (
        <Section ui={ui} title={`Waiting on you · ${waiting.length}`} color={DRACULA.orange}>
          {waiting.map(goal => (
            <Box key={`waiting-${goal.id}`} flexDirection="column">
              <Text color={DRACULA.foreground} bold>{goal.title}</Text>
              <Text color={DRACULA.orange}>{goal.question || 'Needs your decision.'}</Text>
              <AnswerInput ui={ui} goal={goal} onAnswer={props.onAnswer} />
            </Box>
          ))}
        </Section>
      )}

      <Section ui={ui} title={`In progress · ${active.length}`} color={DRACULA.purple}>
        {active.length === 0 && <Text color={DRACULA.comment} italic>No goals. Give {profile.name} one above or with /dot &lt;goal&gt;.</Text>}
        {active.map(goal => <GoalRow ui={ui} goal={goal} onDone={props.onDone} onRemove={props.onRemove} />)}
      </Section>

      {done.length > 0 && (
        <Section ui={ui} title={`Done · ${done.length}`} color={DRACULA.green}>
          {done.slice(0, DONE_SHOWN).map(goal => <GoalRow ui={ui} goal={goal} onRemove={props.onRemove} />)}
        </Section>
      )}

      <Text color={DRACULA.comment}>Memory: {props.memoryPath}</Text>
    </Box>
  )
}

function Section({ ui, title, color, children }: { ui: Ui; title: string; color: string; children?: unknown }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Box backgroundColor={DRACULA.currentLine} paddingX={1}><Text color={color} bold>{title}</Text></Box>
      <Box flexDirection="column" paddingX={1}>{children as never}</Box>
    </Box>
  )
}

type GoalRowProps = { ui: Ui; goal: Goal; onDone?: (id: string) => unknown; onRemove: (id: string) => unknown }

function GoalRow({ ui, goal, onDone, onRemove }: GoalRowProps) {
  const { Box, Text, Button } = ui
  const last = goal.notes[goal.notes.length - 1] ?? ''
  const mark = goal.status === 'working' ? '⟳' : goal.status === 'done' ? '✓' : '·'
  const color = goal.status === 'working' ? DRACULA.yellow : goal.status === 'done' ? DRACULA.green : DRACULA.comment

  return (
    <Box key={`goal-${goal.id}`} flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text color={color}>{mark}</Text>
        <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.foreground} wrap="truncate-end">{goal.title}</Text></Box>
        {onDone && <Button key={`done-${goal.id}`} label="Done" dimColor plain onPress={() => onDone(goal.id)} />}
        <Button key={`remove-${goal.id}`} label="Remove" dimColor plain onPress={() => onRemove(goal.id)} />
      </Box>
      {last !== '' && <Box paddingLeft={2}><Text color={DRACULA.comment} wrap="truncate-end">{last}</Text></Box>}
    </Box>
  )
}

function GoalInput({ ui, onAdd }: { ui: Ui; onAdd: (title: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Input } = ui
  return <Input key="new-goal" label="New goal" placeholder="What should it work on?" value="" onSubmit={(text: string) => void onAdd(text)} />
}

function AnswerInput({ ui, goal, onAnswer }: { ui: Ui; goal: Goal; onAnswer: (id: string, answer: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Input } = ui
  return <Input key={`answer-${goal.id}`} label="Answer" placeholder="Your decision" value="" onSubmit={(text: string) => void onAnswer(goal.id, text)} />
}

export function PaneError({ ui, message }: { ui: Ui; message: string }) {
  const { Box, Text } = ui
  return <Box padding={1}><Text color={DRACULA.red}>Dot pane failed to draw: {message}</Text></Box>
}
