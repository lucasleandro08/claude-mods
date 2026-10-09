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

      <Box flexDirection="column" rowGap={1}>
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

// One goal as a short conversation: what you asked, what it answered, and where it stands
function Thread({ ui, goal, name, nextAt, onAnswer, onDone, onRemove }: ThreadProps) {
  const { Box, Text, Button } = ui
  const state = {
    queued: { text: `Not started. It picks this up in the next round, around ${nextAt}.`, color: DRACULA.comment },
    working: { text: 'In progress. More in the next round.', color: DRACULA.green },
    waiting: { text: 'Needs your answer to continue.', color: DRACULA.orange },
    done: { text: 'Done.', color: DRACULA.comment },
  }[goal.status]

  return (
    <Box key={`thread-${goal.id}`} flexDirection="column" rowGap={0}>
      <Box flexDirection="row" gap={1} alignItems="flex-start">
        <Box width={6} flexShrink={0}><Text color={DRACULA.cyan} bold>You</Text></Box>
        <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.foreground} wrap="wrap">{goal.title}</Text></Box>
        <Box flexDirection="row" gap={1} flexShrink={0}>
          {goal.status !== 'done' && <Button key={`done-${goal.id}`} label="Mark done" dimColor plain onPress={() => onDone(goal.id)} />}
          <Button key={`remove-${goal.id}`} label="Delete" dimColor plain onPress={() => onRemove(goal.id)} />
        </Box>
      </Box>
      {goal.notes.map((note, index) => {
        const mine = note.startsWith('You: ')
        return (
          <Box key={`note-${goal.id}-${index}`} flexDirection="row" gap={1} alignItems="flex-start">
            <Box width={6} flexShrink={0}><Text color={mine ? DRACULA.cyan : DRACULA.purple} bold>{mine ? 'You' : name}</Text></Box>
            <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.foreground} wrap="wrap">{mine ? note.slice(5) : note}</Text></Box>
          </Box>
        )
      })}
      {goal.status === 'waiting' && goal.question !== '' && (
        <Box flexDirection="row" gap={1} alignItems="flex-start">
          <Box width={6} flexShrink={0}><Text color={DRACULA.purple} bold>{name}</Text></Box>
          <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.orange} bold wrap="wrap">{goal.question}</Text></Box>
        </Box>
      )}
      <Box paddingLeft={7}><Text color={state.color}>{state.text}</Text></Box>
      {goal.status === 'waiting' && 'Input' in ui && (
        <Box paddingLeft={7}>
          <ui.Input key={`answer-${goal.id}-${goal.notes.length}`} label="Reply" placeholder="Your answer" value=""
            onSubmit={(text: string) => void onAnswer(goal.id, text)} />
        </Box>
      )}
    </Box>
  )
}

// Keyed by the goal count so the field comes back empty once a message lands
function Composer({ ui, name, count, onAdd }: { ui: Ui; name: string; count: number; onAdd: (title: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Input } = ui
  return <Input key={`new-goal-${count}`} label={`Message ${name}`} placeholder="Check my open PRs and tell me which need me" value="" onSubmit={(text: string) => void onAdd(text)} />
}

export function PaneError({ ui, message }: { ui: Ui; message: string }) {
  const { Box, Text } = ui
  return <Box padding={1}><Text color={DRACULA.red}>{`The pane couldn't draw: ${message}`}</Text></Box>
}
