import type { Elements, RenderSurface } from 'claude-code'

import type { Goal, Profile } from '../types'
import { avatarSvg } from '../src/avatar'
import { activityOf, byStatus, moodOf } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const RECENT_SHOWN = 6
const RESULTS_SHOWN = 4

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

const MARK: Record<Goal['status'], { icon: string; color: string }> = {
  working: { icon: '⟳', color: DRACULA.yellow },
  queued: { icon: '○', color: DRACULA.comment },
  waiting: { icon: '!', color: DRACULA.orange },
  done: { icon: '✓', color: DRACULA.green },
}

// A profile card like an agent's: who it is, what it is doing, what it did
export function DotPane(props: DotPaneProps) {
  const { ui, profile, goals, notice } = props
  const { Box, Text, Button } = ui
  const { waiting, active, done } = byStatus(goals)
  const { status, detail } = activityOf(profile, goals)
  const recent = [...waiting, ...active].slice(0, RECENT_SHOWN)
  const results = done.filter(g => g.notes.length > 0).slice(0, RESULTS_SHOWN)

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={2} paddingY={1} rowGap={1}>
      <Box flexDirection="row" alignItems="center" gap={2}>
        {'Svg' in ui
          ? <ui.Svg source={avatarSvg(moodOf(profile, goals), 64)} alt={profile.name} width={64} height={64} isInteractive />
          : <Text color={DRACULA.purple}>{profile.emoji}</Text>}
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Text color={DRACULA.foreground} bold>{profile.name}</Text>
          <Text color={profile.paused ? DRACULA.comment : DRACULA.green}>
            {profile.paused ? 'Paused' : profile.scheduled ? 'Active · works in the background' : 'Background work off'}
          </Text>
          <Text color={DRACULA.comment} wrap="truncate-end">{status} · {detail}</Text>
        </Box>
      </Box>

      <Box flexDirection="row" gap={1}>
        {profile.scheduled
          ? (
            <Box flexDirection="row" gap={1}>
              <Button key="run-now" label="Run now" dimColor onPress={props.onRunNow} />
              <Button key="pause" label={profile.paused ? 'Resume' : 'Pause'} dimColor onPress={props.onPause} />
            </Box>
          )
          : <Button key="schedule" label="Turn on background work" dimColor onPress={props.onSchedule} />}
      </Box>
      {notice !== '' && <Text color={DRACULA.cyan}>{notice}</Text>}

      <GoalInput ui={ui} name={profile.name} onAdd={props.onAdd} />

      {waiting.map(goal => (
        <Box key={`waiting-${goal.id}`} flexDirection="column" borderStyle="round" borderColor={DRACULA.orange} paddingX={1}>
          <Text color={DRACULA.orange} bold>{goal.title}</Text>
          <Text color={DRACULA.foreground}>{goal.question || 'Needs your decision.'}</Text>
          <AnswerInput ui={ui} goal={goal} onAnswer={props.onAnswer} />
        </Box>
      ))}

      <Box flexDirection="column">
        <Text color={DRACULA.comment}>Recent activity</Text>
        {recent.length === 0 && <Text color={DRACULA.comment} italic>Nothing yet. Give {profile.name} a goal above.</Text>}
        {recent.map(goal => <ActivityRow ui={ui} goal={goal} onDone={props.onDone} onRemove={props.onRemove} />)}
      </Box>

      <Box flexDirection="column">
        <Text color={DRACULA.comment}>Results</Text>
        {results.length === 0 && <Text color={DRACULA.comment} italic>No results yet.</Text>}
        {results.map(goal => (
          <Box key={`result-${goal.id}`} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text color={DRACULA.green}>✓</Text>
              <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.foreground} wrap="truncate-end">{goal.title}</Text></Box>
              <Button key={`remove-${goal.id}`} label="Clear" dimColor plain onPress={() => props.onRemove(goal.id)} />
            </Box>
            <Box paddingLeft={2}><Text color={DRACULA.comment}>{goal.notes[goal.notes.length - 1]}</Text></Box>
          </Box>
        ))}
      </Box>

      <Text color={DRACULA.comment}>Memory and rules live in {props.memoryPath.replace(/\/memory\.md$/, '')}</Text>
    </Box>
  )
}

type RowProps = { ui: Ui; goal: Goal; onDone: (id: string) => unknown; onRemove: (id: string) => unknown }

function ActivityRow({ ui, goal, onDone, onRemove }: RowProps) {
  const { Box, Text, Button } = ui
  const mark = MARK[goal.status]
  const last = goal.notes[goal.notes.length - 1] ?? ''

  return (
    <Box key={`goal-${goal.id}`} flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text color={mark.color}>{mark.icon}</Text>
        <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.foreground} wrap="truncate-end">{goal.title}</Text></Box>
        {goal.status !== 'waiting' && <Button key={`done-${goal.id}`} label="Done" dimColor plain onPress={() => onDone(goal.id)} />}
        <Button key={`remove-${goal.id}`} label="Remove" dimColor plain onPress={() => onRemove(goal.id)} />
      </Box>
      {last !== '' && <Box paddingLeft={2}><Text color={DRACULA.comment} wrap="truncate-end">{last}</Text></Box>}
    </Box>
  )
}

function GoalInput({ ui, name, onAdd }: { ui: Ui; name: string; onAdd: (title: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Input } = ui
  return <Input key="new-goal" label={`Message ${name}`} placeholder="Give it a goal" value="" onSubmit={(text: string) => void onAdd(text)} />
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
