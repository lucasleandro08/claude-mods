import type { Elements, RenderSurface } from 'claude-code'

import type { Goal, Profile } from '../types'
import { avatarSvg } from '../src/avatar'
import { activityOf, byStatus, moodOf } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const AVATAR_PX = 88
const RECENT_SHOWN = 6
const RESULTS_SHOWN = 4
const STATUS_WIDTH = 9

export type Notice = { tone: 'ok' | 'error' | 'info'; text: string }

export type DotPaneProps = {
  ui: Ui
  width: number
  profile: Profile
  goals: Goal[]
  notice: Notice | null
  dotDir: string
  onAdd: (title: string) => unknown
  onAnswer: (id: string, answer: string) => unknown
  onDone: (id: string) => unknown
  onRemove: (id: string) => unknown
  onPause: () => unknown
  onRunNow: () => unknown
  onSchedule: () => unknown
}

const STATUS_COLOR: Record<string, string> = {
  working: DRACULA.green,
  'waiting on you': DRACULA.orange,
  paused: DRACULA.comment,
  'up next': DRACULA.purple,
  queued: DRACULA.purple,
  idle: DRACULA.comment,
}

const ROW_STATUS: Record<Goal['status'], { label: string; color: string }> = {
  working: { label: 'working', color: DRACULA.green },
  queued: { label: 'next', color: DRACULA.purple },
  waiting: { label: 'needs you', color: DRACULA.orange },
  done: { label: 'done', color: DRACULA.comment },
}

const NOTICE_COLOR = { ok: DRACULA.green, error: DRACULA.orange, info: DRACULA.cyan } as const

export function DotPane(props: DotPaneProps) {
  const { ui, profile, goals, notice } = props
  const { Box, Text } = ui
  const { waiting, active, done } = byStatus(goals)
  const recent = active.slice(0, RECENT_SHOWN)
  const results = done.filter(g => g.notes.length > 0).slice(0, RESULTS_SHOWN)

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={2} paddingY={1} rowGap={1}>
      <Header {...props} />
      {notice && <Text color={NOTICE_COLOR[notice.tone]} wrap="wrap">{notice.text}</Text>}

      <Composer ui={ui} name={profile.name} count={goals.length} onAdd={props.onAdd} />

      {waiting.length > 0 && (
        <Section ui={ui} title="Needs you" count={waiting.length} color={DRACULA.orange}>
          {waiting.map(goal => <Question ui={ui} goal={goal} onAnswer={props.onAnswer} />)}
        </Section>
      )}

      <Section ui={ui} title="Activity" count={active.length} color={DRACULA.purple}>
        {recent.length === 0
          ? <Text color={DRACULA.comment} wrap="wrap">Nothing in progress. Send {profile.name} a goal above and it picks it up on the next round.</Text>
          : recent.map(goal => <GoalRow ui={ui} goal={goal} onDone={props.onDone} onRemove={props.onRemove} />)}
      </Section>

      <Section ui={ui} title="Results" count={done.length} color={DRACULA.green}>
        {results.length === 0
          ? <Text color={DRACULA.comment}>Finished goals show up here with what it found.</Text>
          : results.map(goal => <Result ui={ui} goal={goal} onRemove={props.onRemove} />)}
      </Section>

      <Text color={DRACULA.comment} wrap="wrap">Rules, memory and goals are plain files in {props.dotDir}</Text>
    </Box>
  )
}

function Header(props: DotPaneProps) {
  const { ui, profile, goals } = props
  const { Box, Text, Button } = ui
  const { status, detail } = activityOf(profile, goals)

  return (
    <Box flexDirection="row" gap={2} alignItems="flex-start">
      {'Svg' in ui
        ? <ui.Svg source={avatarSvg(moodOf(profile, goals), AVATAR_PX)} alt={`${profile.name}, ${status}`} width={AVATAR_PX} height={AVATAR_PX} />
        : <Text color={DRACULA.purple}>{profile.emoji}</Text>}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} rowGap={0}>
        <Text color={DRACULA.foreground} bold>{profile.name}</Text>
        <Text color={STATUS_COLOR[status] ?? DRACULA.comment}>{status}</Text>
        <Text color={DRACULA.foreground} wrap="wrap">{detail}</Text>
        <Text color={DRACULA.comment}>
          {profile.paused ? 'Paused · no rounds until you resume' : profile.scheduled ? 'Works in the background' : 'Background work is off'}
        </Text>
        <Box flexDirection="row" gap={1} marginTop={1} flexWrap="wrap">
          {!profile.scheduled && <Button key="schedule" label="Turn on background work" dimColor onPress={props.onSchedule} />}
          {profile.scheduled && !profile.paused && <Button key="run-now" label="Run a round now" dimColor onPress={props.onRunNow} />}
          {profile.scheduled && <Button key="pause" label={profile.paused ? 'Resume' : 'Pause'} dimColor onPress={props.onPause} />}
        </Box>
      </Box>
    </Box>
  )
}

function Section({ ui, title, count, color, children }: { ui: Ui; title: string; count: number; color: string; children?: unknown }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" rowGap={0}>
      <Box flexDirection="row" gap={1}>
        <Text color={color} bold>{title}</Text>
        {count > 0 && <Text color={DRACULA.comment}>{count}</Text>}
      </Box>
      {children as never}
    </Box>
  )
}

type RowProps = { ui: Ui; goal: Goal; onDone: (id: string) => unknown; onRemove: (id: string) => unknown }

function GoalRow({ ui, goal, onDone, onRemove }: RowProps) {
  const { Box, Text, Button } = ui
  const state = ROW_STATUS[goal.status]
  const last = goal.notes[goal.notes.length - 1] ?? ''

  return (
    <Box key={`goal-${goal.id}`} flexDirection="row" gap={1} alignItems="flex-start">
      <Box width={STATUS_WIDTH} flexShrink={0}><Text color={state.color}>{state.label}</Text></Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text color={DRACULA.foreground} wrap="wrap">{goal.title}</Text>
        {last !== '' && <Text color={DRACULA.comment} wrap="wrap">{last}</Text>}
      </Box>
      <Box flexDirection="row" gap={1} flexShrink={0}>
        <Button key={`done-${goal.id}`} label="Done" dimColor plain onPress={() => onDone(goal.id)} />
        <Button key={`remove-${goal.id}`} label="Drop" dimColor plain onPress={() => onRemove(goal.id)} />
      </Box>
    </Box>
  )
}

function Result({ ui, goal, onRemove }: { ui: Ui; goal: Goal; onRemove: (id: string) => unknown }) {
  const { Box, Text, Button } = ui
  return (
    <Box key={`result-${goal.id}`} flexDirection="row" gap={1} alignItems="flex-start">
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text color={DRACULA.foreground} wrap="wrap">{goal.title}</Text>
        <Text color={DRACULA.comment} wrap="wrap">{goal.notes[goal.notes.length - 1]}</Text>
      </Box>
      <Box flexShrink={0}><Button key={`remove-${goal.id}`} label="Clear" dimColor plain onPress={() => onRemove(goal.id)} /></Box>
    </Box>
  )
}

function Question({ ui, goal, onAnswer }: { ui: Ui; goal: Goal; onAnswer: (id: string, answer: string) => unknown }) {
  const { Box, Text } = ui
  return (
    <Box key={`waiting-${goal.id}`} flexDirection="column" rowGap={0}>
      <Text color={DRACULA.foreground} bold wrap="wrap">{goal.question || 'Needs your decision.'}</Text>
      <Text color={DRACULA.comment} wrap="wrap">{goal.title}</Text>
      {'Input' in ui && (
        <ui.Input key={`answer-${goal.id}-${goal.notes.length}`} label="Reply" placeholder="Your decision" value=""
          onSubmit={(text: string) => void onAnswer(goal.id, text)} />
      )}
    </Box>
  )
}

// Keyed by the goal count so the field comes back empty once a goal lands
function Composer({ ui, name, count, onAdd }: { ui: Ui; name: string; count: number; onAdd: (title: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Input } = ui
  return <Input key={`new-goal-${count}`} label={`Message ${name}`} placeholder="Review the open PRs and tell me which need me" value="" onSubmit={(text: string) => void onAdd(text)} />
}

export function PaneError({ ui, message }: { ui: Ui; message: string }) {
  const { Box, Text } = ui
  return <Box padding={1}><Text color={DRACULA.red}>{`The pane couldn't draw: ${message}`}</Text></Box>
}
