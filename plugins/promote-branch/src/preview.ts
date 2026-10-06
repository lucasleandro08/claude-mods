const TEST_FILE = /(\.test\.|\.spec\.|_spec\.rb$|_test\.exs?$|_test\.go$|Test\.php$|(^|\/)tests?\/)/

export type Preview = {
  repo: string
  branch: string
  target: string
  commits: string[]
  files: string[]
  tests: string[]
  isDirty: boolean
}

export function lines(text: string) {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

export function testFiles(files: readonly string[]) {
  return files.filter(f => TEST_FILE.test(f))
}

export function protectedBranches(list: string, target: string) {
  return [...new Set([target, ...list.split(',').map(b => b.trim()).filter(Boolean)])]
}

export function describePreview(p: Preview) {
  const out = [
    `Repo: ${p.repo}`,
    `Merge ${p.branch} → ${p.target} (full merge, no cherry-pick)`,
    '',
    `${p.commits.length} commit(s) not in ${p.target} yet:`,
    ...p.commits.slice(0, 20).map(c => `  ${c}`),
    ...(p.commits.length > 20 ? [`  … ${p.commits.length - 20} more`] : []),
    '',
    `${p.files.length} file(s) changed; test files touched:`,
    ...(p.tests.length > 0 ? p.tests.map(t => `  ${t}`) : ['  (none)']),
  ]
  if (p.isDirty) out.push('', '⚠ Uncommitted changes: commit them first; /promote go refuses a dirty tree.')
  out.push('', p.commits.length === 0 ? 'Nothing to merge.' : 'Run `/promote go` to merge and push.')
  return out.join('\n')
}
