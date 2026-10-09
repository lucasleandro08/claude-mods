import type { Elements, RenderSurface } from 'claude-code'

import type { Goal, Profile, RoundStatus } from '../types'
import { avatarSvg } from '../src/avatar'
import { BRIEFING_CHOICES, clock, moodOf, nextRoundAt, ROUND_CHOICES } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const AVATAR_PX = 88
const THREADS_SHOWN = 8
const STUCK_MS = 10 * 60_000

export type Notice = { tone: 'ok' | 'error' | 'info'; text: string }

export type DotPaneProps = {
  ui: Ui
  profile: Profile
  goals: Goal[]
  round: RoundStatus
  now: number
  notice: Notice | null
  dotDir: string
  onAdd: (title: string) => unknown
  onAnswer: (id: string, answer: string) => unknown
  onDone: (id: string) => unknown
  onRemove: (id: string) => unknown
  onPause: () => unknown
  onRunNow: () => unknown
  onSchedule: () => unknown
  onEvery: (minutes: number) => unknown
  onBriefing: (time: string) => unknown
}

const NOTICE_COLOR = { ok: DRACULA.green, error: DRACULA.orange, info: DRACULA.cyan } as const

function roundLine(profile: Profile, round: RoundStatus, now: number): { text: string; color: string } {
  if (!profile.scheduled) return { text: 'Background work is off. Turn it on so it works without you.', color: DRACULA.orange }
  if (profile.paused) return { text: 'Paused. No rounds run until you resume.', color: DRACULA.comment }
  if (round.state === 'running') {
    const since = round.at > 0 ? ` since ${clock(round.at)}` : ''
    const stuck = round.at > 0 && now - round.at > STUCK_MS
    return stuck
      ? { text: `Running${since} and quiet for a while: it may be waiting for your approval in the "${profile.name} · work" session.`, color: DRACULA.orange }
      : { text: `Working now${since}${round.goal ? ` on "${round.goal}"` : ''}.`, color: DRACULA.green }
  }
  const last = round.at > 0 ? `Last round ${clock(round.at)}. ` : ''
  return { text: `${last}Next round around ${clock(nextRoundAt(profile.everyMinutes, now))}.`, color: DRACULA.comment }
}

export function DotPane(props: DotPaneProps) {
  const { ui, profile, goals, round, now, notice } = props
  const { Box, Text, Button } = ui
  const line = roundLine(profile, round, now)
  const threads = [...goals].sort((a, b) => a.createdAt - b.createdAt).slice(-THREADS_SHOWN)

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={2} paddingY={1} rowGap={1}>
      <Box flexDirection="row" gap={2} alignItems="center">
        {'Svg' in ui
          ? <ui.Svg source={avatarSvg(moodOf(profile, goals), AVATAR_PX)} alt={profile.name} width={AVATAR_PX} height={AVATAR_PX} />
          : <Text color={DRACULA.purple}>{profile.emoji}</Text>}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} rowGap={0}>
          <Text color={DRACULA.foreground} bold>{profile.name}</Text>
          <Text color={line.color} wrap="wrap">{line.text}</Text>
          <Box flexDirection="row" gap={1} marginTop={1} flexWrap="wrap">
            {!profile.scheduled && <Button key="schedule" label="Turn on background work" dimColor onPress={props.onSchedule} />}
            {profile.scheduled && !profile.paused && round.state !== 'running' && <Button key="run-now" label="Run a round now" dimColor onPress={props.onRunNow} />}
            {profile.scheduled && <Button key="pause" label={profile.paused ? 'Resume' : 'Pause'} dimColor onPress={props.onPause} />}
          </Box>
        </Box>
      </Box>

      {profile.scheduled && <Schedule {...props} />}
      {notice && <Text color={NOTICE_COLOR[notice.tone]} wrap="wrap">{notice.text}</Text>}

      <Box flexDirection="column" rowGap={1} borderStyle="single" borderColor={DRACULA.currentLine} paddingX={1} paddingTop={1}>
        {threads.length === 0 && (
          <Text color={DRACULA.comment} wrap="wrap">Ask {profile.name} anything below. Each message becomes a goal it works on in its rounds, and its replies show up here.</Text>
        )}
        {threads.map(goal => <Thread ui={ui} goal={goal} name={profile.name} nextAt={clock(nextRoundAt(profile.everyMinutes, now))}
          onAnswer={props.onAnswer} onDone={props.onDone} onRemove={props.onRemove} />)}
      </Box>

      <Composer ui={ui} name={profile.name} count={goals.length} onAdd={props.onAdd} />
      <Text color={DRACULA.comment} wrap="wrap">Its rules, memory and goals are plain files in {props.dotDir}</Text>
    </Box>
  )
}

function Schedule({ ui, profile, onEvery, onBriefing }: DotPaneProps) {
  const { Box, Text, Button } = ui
  if ('Select' in ui) {
    const { Select } = ui
    return (
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Select key="every" label="Rounds" value={String(profile.everyMinutes)}
          options={ROUND_CHOICES.map(m => ({ value: String(m), label: m < 60 ? `every ${m} min` : `every ${m / 60} h` }))}
          onSelect={(v: string) => void onEvery(Number(v))} />
        <Select key="briefing" label="Weekday briefing" value={profile.briefing || 'off'}
          options={BRIEFING_CHOICES.map(t => ({ value: t, label: t === 'off' ? 'off' : `at ${t}` }))}
          onSelect={(v: string) => void onBriefing(v)} />
      </Box>
    )
  }
  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      <Text color={DRACULA.comment}>Rounds:</Text>
      {ROUND_CHOICES.map(m => m === profile.everyMinutes
        ? <Text color={DRACULA.purple} bold>{m < 60 ? `${m}m` : `${m / 60}h`}</Text>
        : <Button key={`every-${m}`} label={m < 60 ? `${m}m` : `${m / 60}h`} dimColor plain onPress={() => onEvery(m)} />)}
    </Box>
  )
}

type ThreadProps = {
  ui: Ui
  goal: Goal
  name: string
  nextAt: string
  onAnswer: (id: string, answer: string) => unknown
  onDone: (id: string) => unknown
  onRemove: (id: string) => unknown
}

const BUBBLE_WIDTH = '85%'

// Your messages sit right in a filled bubble; the assistant answers left in an outlined one
function Bubble({ ui, from, mine, text, tone, id }: { ui: Ui; from: string; mine: boolean; text: string; tone?: string; id: string }) {
  const { Box, Text } = ui
  return (
    <Box key={id} flexDirection="column" alignItems={mine ? 'flex-end' : 'flex-start'} rowGap={0}>
      <Text color={mine ? DRACULA.cyan : DRACULA.purple} bold>{from}</Text>
      <Box width={BUBBLE_WIDTH} flexDirection="row" justifyContent={mine ? 'flex-end' : 'flex-start'}>
        <Box flexShrink={1} paddingX={1}
          backgroundColor={mine ? DRACULA.currentLine : undefined}
          borderStyle={mine ? undefined : 'round'} borderColor={mine ? undefined : (tone ?? DRACULA.purple)}>
          <Text color={tone ?? DRACULA.foreground} wrap="wrap">{text}</Text>
        </Box>
      </Box>
    </Box>
  )
}

// One goal as a short conversation: what you asked, what it answered, and where it stands
function Thread({ ui, goal, name, nextAt, onAnswer, onDone, onRemove }: ThreadProps) {
  const { Box, Text, Button } = ui
  const state = {
    queued: { text: `${name} hasn't started. It picks this up in the next round, around ${nextAt}.`, color: DRACULA.comment },
    working: { text: `${name} is on it. More in the next round.`, color: DRACULA.green },
    waiting: { text: `${name} needs your answer to continue.`, color: DRACULA.orange },
    done: { text: 'Done.', color: DRACULA.comment },
  }[goal.status]
  const silentDone = goal.status === 'done' && !goal.notes.some(note => !note.startsWith('You: '))

  return (
    <Box key={`thread-${goal.id}`} flexDirection="column" rowGap={1} paddingBottom={1}>
      <Bubble ui={ui} id={`ask-${goal.id}`} from="You" mine text={goal.title} />
      {goal.notes.map((note, index) => {
        const mine = note.startsWith('You: ')
        return <Bubble ui={ui} id={`note-${goal.id}-${index}`} from={mine ? 'You' : name} mine={mine} text={mine ? note.slice(5) : note} />
      })}
      {goal.status === 'waiting' && goal.question !== '' && (
        <Bubble ui={ui} id={`question-${goal.id}`} from={name} mine={false} text={goal.question} tone={DRACULA.orange} />
      )}
      {goal.status === 'waiting' && 'Input' in ui && (
        <Box borderStyle="round" borderColor={DRACULA.orange} paddingX={1}>
          <ui.Input key={`answer-${goal.id}-${goal.notes.length}`} placeholder={`Answer ${name}…`} submitLabel="send" value=""
            onSubmit={(text: string) => void onAnswer(goal.id, text)} />
        </Box>
      )}
      <Box flexDirection="row" gap={1} alignItems="center">
        <Box flexGrow={1} flexShrink={1}>
          <Text color={state.color} wrap="wrap">{silentDone ? `Done, but ${name} left no reply.` : state.text}</Text>
        </Box>
        {goal.status !== 'done' && <Button key={`done-${goal.id}`} label="Mark done" dimColor plain onPress={() => onDone(goal.id)} />}
        <Button key={`remove-${goal.id}`} label="Delete" dimColor plain onPress={() => onRemove(goal.id)} />
      </Box>
    </Box>
  )
}

// Keyed by the goal count so the field comes back empty once a message lands
function Composer({ ui, name, count, onAdd }: { ui: Ui; name: string; count: number; onAdd: (title: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Box, Text, Input } = ui
  return (
    <Box flexDirection="column" rowGap={0}>
      <Box borderStyle="round" borderColor={DRACULA.purple} paddingX={1}>
        <Input key={`new-goal-${count}`} placeholder={`Message ${name}…`} submitLabel="send" autoFocus value=""
          onSubmit={(text: string) => void onAdd(text)} />
      </Box>
      <Text color={DRACULA.comment}>Enter sends. {name} answers in its next round, or now with "Run a round now".</Text>
    </Box>
  )
}

export function PaneError({ ui, message }: { ui: Ui; message: string }) {
  const { Box, Text } = ui
  return <Box padding={1}><Text color={DRACULA.red}>{`The pane couldn't draw: ${message}`}</Text></Box>
}
