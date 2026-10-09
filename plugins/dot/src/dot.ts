import type { Goal, GoalStatus, Profile } from '../types'

export const DOT_DIR = '.claude/dot'
export const WORK_TASK = 'dot-work'
export const BRIEFING_TASK = 'dot-briefing'
export const DEFAULT_PROFILE: Profile = { name: 'Vlad', emoji: '🧛', paused: false, scheduled: false }

export type DotPaths = { dir: string; profile: string; goals: string; memory: string; rules: string; work: string; briefing: string }

export function dotPaths(home: string): DotPaths {
  const dir = `${home}/${DOT_DIR}`
  return {
    dir,
    profile: `${dir}/profile.json`,
    goals: `${dir}/goals.json`,
    memory: `${dir}/memory.md`,
    rules: `${dir}/rules.md`,
    work: `${dir}/work.md`,
    briefing: `${dir}/briefing.md`,
  }
}

export function parseProfile(text: string): Profile {
  try {
    const parsed = JSON.parse(text) as Partial<Profile>
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name.trim() : DEFAULT_PROFILE.name,
      emoji: typeof parsed.emoji === 'string' && parsed.emoji.trim() !== '' ? parsed.emoji.trim() : DEFAULT_PROFILE.emoji,
      paused: parsed.paused === true,
      scheduled: parsed.scheduled === true,
    }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

const STATUSES: readonly GoalStatus[] = ['queued', 'working', 'waiting', 'done']

export function parseGoals(text: string): Goal[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((raw): Goal[] => {
    const g = raw as Partial<Goal>
    if (typeof g.id !== 'string' || typeof g.title !== 'string') return []
    return [{
      id: g.id,
      title: g.title,
      status: STATUSES.includes(g.status as GoalStatus) ? (g.status as GoalStatus) : 'queued',
      notes: Array.isArray(g.notes) ? g.notes.filter((n): n is string => typeof n === 'string') : [],
      question: typeof g.question === 'string' ? g.question : '',
      createdAt: typeof g.createdAt === 'number' ? g.createdAt : 0,
      updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : 0,
    }]
  })
}

export function serialize(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function addGoal(goals: Goal[], title: string, now: number): Goal[] {
  const text = title.trim()
  if (text === '') return goals
  const id = `g${now.toString(36)}`
  return [...goals, { id, title: text, status: 'queued', notes: [], question: '', createdAt: now, updatedAt: now }]
}

export function answerGoal(goals: Goal[], id: string, answer: string, now: number): Goal[] {
  const text = answer.trim()
  if (text === '') return goals
  return goals.map(g =>
    g.id === id ? { ...g, status: 'queued', notes: [...g.notes, `You: ${text}`], question: '', updatedAt: now } : g,
  )
}

export function setStatus(goals: Goal[], id: string, status: GoalStatus, now: number): Goal[] {
  return goals.map(g => (g.id === id ? { ...g, status, updatedAt: now } : g))
}

export function removeGoal(goals: Goal[], id: string): Goal[] {
  return goals.filter(g => g.id !== id)
}

export function byStatus(goals: Goal[]) {
  const sorted = [...goals].sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    waiting: sorted.filter(g => g.status === 'waiting'),
    active: sorted.filter(g => g.status === 'working' || g.status === 'queued'),
    done: sorted.filter(g => g.status === 'done'),
  }
}

export function newlyWaiting(before: Goal[], after: Goal[]): Goal[] {
  const was = new Set(before.filter(g => g.status === 'waiting').map(g => g.id))
  return after.filter(g => g.status === 'waiting' && !was.has(g.id))
}

export function everyMinutesCron(minutes: number) {
  const m = Math.max(5, Math.round(minutes))
  if (m < 60) return `*/${m} * * * *`
  const hours = Math.max(1, Math.round(m / 60))
  return hours >= 24 ? '0 9 * * *' : `0 */${hours} * * *`
}

export function briefingCron(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return `${minute} ${hour} * * 1-5`
}

export const DEFAULT_RULES = `# Rules

Each action falls in one level. When unsure, use the stricter one.

## Act without asking
- Read code, files, docs, logs, dashboards and connected apps.
- Run read-only commands and tests on the local machine.
- Write notes and drafts inside ~/.claude/dot/ and in local branches or worktrees.

## Ask first (set the goal to "waiting" with a question)
- Commit, push, open or comment on pull requests.
- Send any message (Slack, email, PR comments) on the user's behalf.
- Change shared configuration, deploy anything, or write to a staging environment.

## Hand off to the user (never do it, explain what to do)
- Anything in production: writes, restarts, deploys, data changes.
- Passwords, credentials, secrets, payments, purchases, account settings.
- Deleting data permanently.
`

export function workPrompt(name: string, paths: DotPaths) {
  return `You are ${name}, the user's always-on assistant. This is one background work round; nobody is watching it live.

1. Read ${paths.profile}. If "paused" is true, stop now without doing anything.
2. Read ${paths.goals} (a JSON array of goals), ${paths.rules} and ${paths.memory}.
3. Pick ONE goal: the oldest with status "working", else the oldest "queued". If none, stop now: do not invent work.
4. Set it to "working" and work on it for this round only. Follow the rules file strictly: anything under "Ask first" or "Hand off" must not be done.
5. Before finishing, update that goal in ${paths.goals} (keep every other goal untouched, keep valid JSON):
   - append one short note to "notes" with what you did and what is next;
   - status "done" when the goal is complete;
   - status "waiting" with a one-sentence "question" when you need a decision, an approval or a hand-off, then send a desktop notification (PushNotification) saying "${name}: " and the question;
   - otherwise keep "working";
   - set "updatedAt" to the current time in milliseconds.
6. Add to ${paths.memory} anything durable you learned about the user's preferences or setup (short bullets, no secrets).

Never print or store secrets. Write notes in the language the goal was written in.`
}

export function briefingPrompt(name: string, paths: DotPaths) {
  return `You are ${name}, the user's always-on assistant. This is the morning briefing.

1. Read ${paths.profile}. If "paused" is true, stop now.
2. Read ${paths.goals}, ${paths.rules} and ${paths.memory}.
3. Look around read-only, following the rules file: goals in progress, what is waiting on the user, and anything in the connected tools that is worth their attention today (open pull requests and CI, failing builds, things the goals depend on). Do not change anything.
4. Send one desktop notification (PushNotification, under 200 characters) with the most important thing, starting with "${name}: ".
5. Append the full briefing (a few bullets) as a note to a goal titled "Briefings" in ${paths.goals}, creating it with status "done" if missing, and set its "updatedAt" to now in milliseconds.

Write in the language of the user's goals.`
}

export function taskPointer(path: string) {
  return `Read ${path} and follow it exactly.`
}
