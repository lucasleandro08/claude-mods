# claude-mods

Dracula-themed mods for [Claude Code](https://code.claude.com): a live diff pane, Kubernetes, Docker, CodeBuild and worktree panes, a pull request dashboard, AWS SSO status, guardrails for risky shell commands and a few workflow helpers. Each mod is its own plugin, so install only the ones you want.

> Mods use Claude Code's function hooks API, which is in early access and may change between releases. Mods run on your machine with your permissions: read the code before installing, like any plugin.

## Install

In Claude Code (terminal or the desktop app's Code tab):

```
/plugin marketplace add lucasleandro08/claude-mods
/plugin install mod-manager@dracula-mods
```

The marketplace is named `dracula-mods`. Open `/mods` (or click the `⚙ Mods` chip above the prompt; the pane also opens by itself while no mod is on): install the mods you want from there (**Install** or **Install all**) and turn them on. **Every mod ships turned off.** Your choices are saved in `~/.claude/dracula-mods.json`, so they hold in every session; each mod's other options are in `/config`.

## Mods

| Mod | What it does | Commands |
| --- | --- | --- |
| **mod-manager** | The only mod on by default: a pane that lists every mod with an on/off switch and an **Install** button for the ones not installed yet (it runs `claude plugin install`, or puts the `/plugin install` command in your prompt when the CLI is not found), plus a `⚙ Mods · n/11` chip above the prompt. After an install it runs `/reload-plugins`, so the new mod shows up in the session you are in; **↻ Reload** does the same by hand. | `/mods`, `/mods reload` |
| **live-diff** | A pane with the diff of every `Edit` and `Write` Claude makes: file navigator with `M`/`A` status, `+/-` counts, line numbers and red/green rows. A `Δ Diff` chip above the prompt reopens it. | `/diff`, `/diff-clear` |
| **kube-pane** | A `⎈ context` chip above the prompt (red on production) and a pods pane: context and namespace pickers, filter, pages, unhealthy pods first, and a `⌘ Shell` button that opens `kubectl exec` in the app's Terminal, with a container picker for multi-container pods. Switching context only affects Claude's session: your kubeconfig is never written. | `/pods` |
| **pr-pane** | Your open pull requests grouped by repo, with CI status, the Codex review state and whether each PR already reached your integration branch. A `⑂ PRs` chip flags failing CI and Codex findings. Needs the [GitHub CLI](https://cli.github.com). | `/prs` |
| **guardrails** | Blocks risky commands before they run: killing a port owned by a Docker container, `pkill docker`, printing secrets (`env`, `printenv`, `echo $API_TOKEN`), rewriting the kubeconfig. Asks before `kubectl` writes on production contexts. Each rule can be switched off. | — |
| **promote-branch** | `/promote` previews merging the current branch into your integration branch (commits, files, test files touched). `/promote go` does a full merge in a temporary worktree and pushes it, refusing dirty trees and protected branches. | `/promote`, `/promote go` |
| **codex-loop** | Hands Claude the review loop with the Codex GitHub bot: request a review, weigh each finding, fix or 👎 it, reply, resolve, repeat until 👍. | `/codex-loop <PR>` |
| **turn-done** | A toast and a chime when a long turn finishes. | — |
| **aws-profile** | Each AWS profile above the prompt with whether its login still works (`aws sts get-caller-identity`, only the exit code is kept). Expired ones get a **login** button that runs `aws sso login --profile …` in the app's Terminal and turns green once you finish. The `AWS_PROFILE` Claude Code runs with is marked `●`; production profiles are red. | — |
| **docker-pane** | A `🐳 Docker · n up` chip (unhealthy and stale counts) and a pane grouped by compose project: ports, health, **Start/Stop/Restart** by container name (never by port), **Logs** and compose **Recreate** in the app's Terminal. Flags containers created before your last `git checkout` in the session's repo, the usual cause of a test failing for no reason. | `/docker` |
| **deploy-watch** | Watches AWS CodeBuild projects: a `🚀` chip with the last build, a warning (chip and toast) when a `git push` to a project's branch started no build after a few minutes, and a pane with recent builds, their logs in the Terminal and a **Start build** button that asks first. | `/deploys` |
| **worktrees** | A `🌳 n worktrees` chip and a pane with every worktree of the session's repo and of the repos under your roots: branch, uncommitted changes, PR state, a **Terminal** button, and **Remove** (asks first, never `--force`) for clean worktrees whose branch is merged. | `/worktrees` |

### Options

| Mod | Option | Default |
| --- | --- | --- |
| mod-manager | Show the Mods chip · open on start until a mod is on · claude CLI path | on · on · PATH |
| kube-pane | Production context pattern · default namespace · refresh interval · pods per page · kubectl path | `prod` · `default` · 15 s · 25 · PATH |
| pr-pane | Integration branch · Codex bot login · refresh interval · PRs to load · gh path | `staging` · `chatgpt-codex-connector[bot]` · 5 min · 50 · PATH |
| guardrails | Production pattern · confirm production writes · block kubeconfig changes · block printing secrets · protect Docker ports | `prod` · on · on · on · on |
| promote-branch | Target branch · protected branches | `staging` · `main,master` |
| live-diff | Context lines · edits kept | 2 · 100 |
| turn-done | Long turn threshold · play sound | 60 s · on |
| codex-loop | Codex bot login | `chatgpt-codex-connector[bot]` |
| aws-profile | Production pattern · profiles · check interval · aws path | `prod` · all · 5 min · PATH |
| docker-pane | Refresh interval · docker path | 60 s (10 s while open) · PATH |
| deploy-watch | Projects (`name=branch`, comma-separated) · AWS profile · region · poll interval · missing build warning · production pattern · aws path | none · CLI default · profile's · 60 s · 3 min · `prod` · PATH |
| worktrees | Roots (folders holding your repos) · refresh interval · gh path | session repo only · 5 min · PATH |

The chips above the prompt compose with each other and with other mods' bands: each one draws its row and keeps whatever the mods beneath it drew.

## Rolling out to a whole organization

Admins can register the marketplace and install mods for everyone through managed settings (`extraKnownMarketplaces` and `enabledPlugins`); people then turn on what they use in `/mods`. See [Plugins for organizations](https://code.claude.com/docs/en/plugins/org.md) and [Mods for admins](https://code.claude.com/docs/en/plugins/mods/admin.md).

## Development

```
git clone https://github.com/lucasleandro08/claude-mods
cd claude-mods
scripts/check.sh            # validate + test every plugin (CLAUDE_BIN overrides the CLI path)
scripts/check.sh kube-pane  # only one
```

Load your checkout instead of the published version by adding it as a local marketplace and installing from it:

```
claude plugin marketplace add ~/claude-mods
claude plugin install mod-manager@dracula-mods --scope user
```

Plugins of a marketplace added from a local folder load in place, so edits and newly installed mods reach open sessions with `/reload-plugins` (or **↻ Reload** in `/mods`); see [Plugin loading](https://code.claude.com/docs/en/plugins/loading.md#in-place-and-copied-plugins). Avoid `CLAUDE_CODE_PLUGIN_DIRS` for this: it is read only when a session starts, so a mod added to it shows up only in new sessions.

### Layout

```
.claude-plugin/marketplace.json
plugins/<mod>/
  .claude-plugin/plugin.json   manifest and /config options
  hooks/register.tsx           event wiring, state atoms, everything that touches $
  src/                         pure logic (diffing, parsing kubectl and gh output, rules)
  src/shared/                  vendored copies of scripts/shared (theme, binary lookup)
  ui/                          components the panes and chips draw
  types/index.d.ts             state contract
  tests/                       claude plugin test suites
scripts/shared/                source of the shared files; scripts/sync-shared.sh copies them
```

Two rules of the hooks runtime shape this layout: `$` can only be passed to functions declared in `register.tsx` itself, and state atoms must be declared there too. Plugins cannot import files from each other, which is why small shared helpers are vendored.

## License

[MIT](LICENSE)

---

🇧🇷 **Em português:** mods para o Claude Code com tema Dracula. Instale com `/plugin marketplace add lucasleandro08/claude-mods` e `/plugin install mod-manager@dracula-mods`, instale os mods que quiser e ligue cada um em `/mods` (todos vêm desligados); as demais opções ficam em `/config`.
