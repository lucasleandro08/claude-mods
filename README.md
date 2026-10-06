# claude-mods

Dracula-themed mods for [Claude Code](https://code.claude.com): a live diff pane, a Kubernetes pods pane, a pull request dashboard, guardrails for risky shell commands and a few workflow helpers. Each mod is its own plugin, so install only the ones you want.

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
| **mod-manager** | The only mod on by default: a pane that lists every mod with an on/off switch and an **Install** button for the ones not installed yet (it runs `claude plugin install`, or puts the `/plugin install` command in your prompt when the CLI is not found), plus a `⚙ Mods · n/8` chip above the prompt. | `/mods` |
| **live-diff** | A pane with the diff of every `Edit` and `Write` Claude makes: file navigator with `M`/`A` status, `+/-` counts, line numbers and red/green rows. A `Δ Diff` chip above the prompt reopens it. | `/diff`, `/diff-clear` |
| **kube-pane** | A `⎈ context` chip above the prompt (red on production) and a pods pane: context and namespace pickers, filter, pages, unhealthy pods first, and a `⌘ Shell` button that opens `kubectl exec` in the app's Terminal, with a container picker for multi-container pods. Switching context only affects Claude's session: your kubeconfig is never written. | `/pods` |
| **pr-pane** | Your open pull requests grouped by repo, with CI status, the Codex review state and whether each PR already reached your integration branch. A `⑂ PRs` chip flags failing CI and Codex findings. Needs the [GitHub CLI](https://cli.github.com). | `/prs` |
| **guardrails** | Blocks risky commands before they run: killing a port owned by a Docker container, `pkill docker`, printing secrets (`env`, `printenv`, `echo $API_TOKEN`), rewriting the kubeconfig. Asks before `kubectl` writes on production contexts. Each rule can be switched off. | — |
| **promote-branch** | `/promote` previews merging the current branch into your integration branch (commits, files, test files touched). `/promote go` does a full merge in a temporary worktree and pushes it, refusing dirty trees and protected branches. | `/promote`, `/promote go` |
| **codex-loop** | Hands Claude the review loop with the Codex GitHub bot: request a review, weigh each finding, fix or 👎 it, reply, resolve, repeat until 👍. | `/codex-loop <PR>` |
| **turn-done** | A toast and a chime when a long turn finishes. | — |
| **aws-profile** | Shows the `AWS_PROFILE` Claude Code runs with above the prompt, in red on production profiles. | — |

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
| aws-profile | Production pattern | `prod` |

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

Load your checkout instead of the published version by pointing `CLAUDE_CODE_PLUGIN_DIRS` (in the `env` block of `~/.claude/settings.json`) at the plugin folders, separated by `:`. Interactive sessions reload a plugin when its files change.

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
