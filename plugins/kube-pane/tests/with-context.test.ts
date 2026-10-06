import { describe, expect, test } from 'claude-code/testing'

import { withContext } from '../src/pods'

const CTX = 'staging'
const flag = `kubectl --context '${CTX}'`

describe('withContext', () => {
  test('adds the context to kubectl in command position', () => {
    expect(withContext('kubectl get pods', CTX)).toBe(`${flag} get pods`)
    expect(withContext('kubectl get pods && kubectl get ns', CTX)).toBe(`${flag} get pods && ${flag} get ns`)
    expect(withContext('watch kubectl get pods', CTX)).toBe(`watch ${flag} get pods`)
    expect(withContext('FOO=1 kubectl get pods', CTX)).toBe(`FOO=1 ${flag} get pods`)
    expect(withContext('echo $(kubectl get ns)', CTX)).toBe(`echo $(${flag} get ns)`)
  })

  test('leaves commands that already pick a context', () => {
    expect(withContext('kubectl --context prod get pods', CTX)).toBe('kubectl --context prod get pods')
  })

  test('never touches kubectl inside text', () => {
    for (const command of [
      'echo "use kubectl here"',
      "git commit -m 'kubectl chip; kubectl pane'",
      "cat > notes.md <<'EOF'\nkubectl get pods\nEOF",
      'grep -rn kubectl src',
      'python3 - <<PY\nprint("kubectl")\nPY',
    ]) {
      expect(withContext(command, CTX)).toBe(command)
    }
  })
})
