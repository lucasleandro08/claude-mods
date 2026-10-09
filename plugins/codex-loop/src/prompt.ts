export type PrTarget = { repo?: string; number: number }
export type LoopLimits = { maxRounds: number; waitMinutes: number }

export function parseMaxRounds(raw: string): { rest: string; maxRounds?: number } {
  const flag = raw.match(/(?:^|\s)--max(?:=|\s+)(\d+)(?=\s|$)/)
  if (!flag?.[1]) return { rest: raw }
  return { rest: raw.replace(flag[0], ' ').trim(), maxRounds: Number(flag[1]) }
}

export function parseTarget(raw: string): PrTarget | undefined {
  const text = raw.trim()
  const url = text.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/)
  if (url?.[1] && url[2]) return { repo: url[1], number: Number(url[2]) }
  const short = text.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/)
  if (short?.[1] && short[2]) return { repo: short[1], number: Number(short[2]) }
  const bare = text.match(/^#?(\d+)$/)
  if (bare?.[1]) return { number: Number(bare[1]) }
  return undefined
}

export function loopPrompt(target: PrTarget, bot: string, limits: LoopLimits) {
  const pr = target.repo ? `${target.repo}#${target.number}` : `#${target.number} (repo of the current directory)`
  const repo = target.repo ?? '<owner>/<repo>'

  return [
    `Run the Codex review loop on PR ${pr} until Codex reacts 👍, for at most ${limits.maxRounds} review rounds.`,
    `A round is one @codex review request and the work on its findings. Say "Round n/${limits.maxRounds}" when each one starts.`,
    '',
    `1. Ask for a review: gh api repos/${repo}/issues/${target.number}/comments -f body="@codex review"`,
    `2. Wait for Codex (${bot}): a 👍 reaction on the PR means clean; inline review comments are findings. Check instead of sleeping in a loop, and give up on the round after ${limits.waitMinutes} minutes without an answer.`,
    '3. For each finding, measure before agreeing: read the code and check the real service or API when possible. Do not trust assumed shapes or tests that stub the assumption.',
    '   - Valid: fix it, run the repo lint/format/tests for the touched files, commit and push.',
    `   - Not valid: do not apply it; react 👎 with gh api repos/${repo}/pulls/comments/<id>/reactions -f content="-1"`,
    `4. Reply on each thread (gh api repos/${repo}/pulls/comments/<id>/replies -f body=...) and resolve it with the GraphQL resolveReviewThread mutation.`,
    `5. Comment @codex review again and repeat until the 👍, unless round ${limits.maxRounds} is done or Codex did not answer in time.`,
    '',
    `Stop at the 👍, after round ${limits.maxRounds}, or when Codex does not answer: do not request another review then.`,
    'gh api sometimes fails with a TLS handshake timeout: retry, and confirm the call went through before saying it did.',
    'Finish with a short summary: why it stopped, the rounds run, what was applied, what got 👎 and why, and the findings still open.',
  ].join('\n')
}
