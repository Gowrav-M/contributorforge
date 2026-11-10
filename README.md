# ContributorForge

Turn a messy GitHub issue into a verified, reproducible, contributor-ready coding task.

ContributorForge is a local TypeScript CLI for maintainers and contributors. It pins
a public repository to an exact commit, runs explicitly approved reproduction
commands in Docker, and packages the observed evidence with instructions for a
human contributor or coding agent. It does not invent reproduction steps from an
issue body, post to GitHub, or run an agent for you.

## Short demo

After installing from source:

```sh
docker pull node:22-bookworm-slim
pnpm demo
```

The authored fixture contains a comma-separated list parser with a deliberate
trailing-delimiter bug. The demo runs the same regression against its buggy and
fixed versions, creates task packets, and produces local HTML reports. The buggy
test emits `ISSUE_1_TRAILING_COMMA`; the fixed test passes. This fixture is local
test data, not a claim about a real GitHub issue.

See [the recorded demo](docs/DEMO.md) for exact commands, actual output and report
paths. A stopped or unavailable Docker engine prevents sandbox verification; the
CLI never falls back to executing downloaded code on your host.

## Prerequisites

- Node.js 22 LTS or a later supported LTS release.
- pnpm 10.32.1, as recorded in `package.json`.
- Git and [GitHub CLI](https://cli.github.com/), authenticated with `gh auth login`.
- Docker Engine or Docker Desktop running **Linux containers**.
- Sufficient disk space for a repository checkout and runtime image.

The fixture demo does not need a GitHub issue or a GitHub API key. Public issue
verification uses your existing `gh` access. No LLM API key is required.

## Install from source

```sh
git clone https://github.com/Gowrav-M/contributorforge.git
cd contributorforge
pnpm install --frozen-lockfile
pnpm build
node dist/cli/index.js --help
```

For a local shell command, optionally run `npm link` after building. The package
name is `contributorforge`; v0.1 is prepared for packaging, **not published to npm**.
Use source installation rather than assuming `npx contributorforge` is available.

## Quick start

In a directory where you want to store contributor task packets:

```sh
contributorforge init
```

This creates `.contributorforge.yml` with `approved: false` and never overwrites an
existing file. Have a maintainer provide issue-specific commands, review them, and
edit the file. For example, adapt this configuration to your own issue and test:

```yaml
version: 1
repository: owner/repository
issue: 42
approved: true
setup: npm ci
reproduction: npm run test:issue-42
expectedFailure: ISSUE_42_REGRESSION
image: node:22-bookworm-slim
setupNetwork: true
reproductionNetwork: false
timeoutSeconds: 60
memoryMb: 512
cpus: 1
expectedBehavior: Describe the behavior expected for this issue.
acceptanceCriteria:
  - The issue-specific regression passes with the intended behavior.
```

The example commands must exist in the target repository. `approved: true` is your
local assertion that a maintainer reviewed these commands; it is not a signature
or an independently verified maintainer identity. A repository's own downloaded
configuration is not automatically trusted.

```sh
docker pull node:22-bookworm-slim
contributorforge verify https://github.com/owner/repository/issues/42
contributorforge start https://github.com/owner/repository/issues/42
```

`verify` reads issue metadata, resolves a commit, checks out source, runs the
approved commands in Docker and creates a task directory. `start` prepares a
workspace under `.contributorforge/workspaces/` and displays instructions; it does
not run setup or reproduction commands on your machine.

Use `--config path/to/config.yml` on either command to select a local configuration.
Use `verify --commit <full-40-character-sha>` to reproduce a recorded revision
instead of the current default-branch commit. Run each command with `--help` for
its supported options.

## Results and exit codes

The generated `task.json` is the machine-readable report. Example result values
for the authored fixture are `REPRODUCED` for its buggy parser and
`NOT_REPRODUCED` for its fixed parser; consult the recorded demo for actual evidence.

| Status | Exit | Meaning |
| --- | ---: | --- |
| `REPRODUCED` | 0 | An issue-specific command failed and its configured expected marker was captured. |
| `NOT_REPRODUCED` | 1 | The reproduction command passed in this environment. |
| `NEEDS_REPRO_STEPS` | 2 | Approved, usable issue-specific instructions are missing. |
| `ENVIRONMENT_BLOCKED` | 3 | The environment cannot complete verification. |
| `VERIFICATION_ERROR` | 4 | Evidence or execution failed in an unexpected way. |

Successful `init` and `start` commands return 0. Argument parsing errors are CLI
errors, not verification results. Neither a generic failing suite nor a timeout
proves the reported issue. `NOT_REPRODUCED` does not mean the bug is universally
fixed, and `REPRODUCED` describes the bug check, not a successful repair.

## Portable task packet

Each run writes beneath `.contributorforge/tasks/<task-id>/`:

| File | Purpose |
| --- | --- |
| `task.json` | Structured issue, configuration and execution evidence |
| `TASK.md` | Contributor overview and acceptance criteria |
| `reproduction.md` | Approved commands and observed results |
| `environment.json` | Runtime and execution metadata |
| `logs.txt` | Captured output with best-effort secret redaction |
| `report.html` | Responsive local evidence report |
| `AGENT_TASK.md` | Vendor-neutral instructions for a coding agent |

Copy or archive the task directory to share it. It contains handoff evidence and
instructions, not a vendored source tree or dependency cache. Recreating a
workspace requires the pinned source and runtime image to remain available.
Review all artifacts before sharing them. Give `AGENT_TASK.md` to your preferred
agent only after reviewing its contents; ContributorForge does not invoke agents.

## Configuration notes

Only the configuration's bound repository and issue may use its commands.
`setup` is optional. `expectedFailure` is optional in the schema, but an expected
issue-specific marker is required to establish `REPRODUCED`. Markers are literal
strings, not regular expressions. Commands run using the container's shell.

Networking defaults to disabled for both phases. Enable setup networking only
when dependency installation needs it; this does not approve reproduction
networking. Images are never pulled automatically: review the configured image,
then pull it explicitly with `docker pull <image>`. Limits are per configured
execution phase: 1–600 seconds, 256–4096 MiB
memory and 0.25–4 CPUs. Choose a trusted Linux image with the tools your commands
need. Image tags may move; use a digest when exact runtime selection matters.

## Limitations and security boundary

- Docker reduces exposure but shares a kernel and is not a perfect sandbox. Use a
  disposable VM for hostile repositories. See [SECURITY.md](SECURITY.md).
- Public canonical `https://github.com/owner/repo/issues/number` URLs are supported;
  private repositories, pull requests, URL queries and fragments are rejected.
- Symlinks and submodules in source are rejected in v0.1 rather than silently
  producing an altered or incomplete checkout.
- The sandbox copy omits `.git`, `node_modules`, `.contributorforge` and filenames
  starting with `.env`. Reproductions must not depend on these source entries.
  The copy is limited to 10,000 entries and 256 MiB; dependency installation can
  consume additional disk space. Remote Docker contexts are unsupported.
- Verification supports Linux-container Node.js/TypeScript workflows first.
  Native Windows containers, GUI tests, privileged services and secret-dependent
  reproductions are outside this release's scope.
- Dependency setup can run install scripts and contact external services when
  networking is approved. Lockfiles do not guarantee dependency availability.
- An expected marker is a maintainer-defined check, not an independent proof of
  causality. Untrusted code can intentionally print that marker.
- Log redaction is best effort. Do not provide secrets to reproduction commands.
- No telemetry, hosted backend, automatic PRs, registry publication or agent
  execution is included.

## Develop and contribute

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker pull node:22-bookworm-slim
pnpm demo
```

Core tests use authored fixtures and injected infrastructure responses, not a
live third-party repository. The Docker demo is a separate integration check.
See [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), and
[ROADMAP.md](ROADMAP.md). Licensed under [MIT](LICENSE).
