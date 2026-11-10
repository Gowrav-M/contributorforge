# ContributorForge

ContributorForge turns GitHub issues and pull requests into reproducible, evidence-backed contributor tasks.

It pins public source revisions, runs a check you approve inside Docker, and
creates a local report and a task packet you can hand to a contributor.

[Install locally](#install-from-a-local-tarball) · [Try a verified example](#try-a-real-pull-request) · [Contribute](CONTRIBUTING.md)

## Short demo

After installing from source:

```sh
docker pull node:22-bookworm-slim
pnpm demo
pnpm demo:compare
```

The authored fixture contains a comma-separated list parser with a deliberate
trailing-delimiter bug. The demo runs the same regression against its buggy and
fixed versions, creates task packets, and produces local HTML reports. The buggy
test emits `ISSUE_1_TRAILING_COMMA`; the fixed test passes. This fixture is local
test data, not a claim about a real GitHub issue.

The comparison demo checks both commits together and preserves their separate
evidence. See [the v0.2 comparison guide](docs/RELEASE_0.2.md) for the methodology.

See [the recorded demo](docs/DEMO.md) for exact commands, actual output and report
paths. A stopped or unavailable Docker engine prevents sandbox verification; the
CLI never falls back to executing downloaded code on your host.

## Prerequisites

- Node.js 22 LTS or a later supported LTS release.
- pnpm 10.32.1 to build from source. A prebuilt tarball only needs npm to install.
- Git and [GitHub CLI](https://cli.github.com/), authenticated with `gh auth login`.
- Docker Engine or Docker Desktop running **Linux containers**.
- Sufficient disk space for a repository checkout and runtime image.

The fixture demo does not need a GitHub issue or a GitHub API key. Public issue
verification uses your existing `gh` access. No LLM API key is required.

## Install from a local tarball

ContributorForge has not been published to npm. Build
and pack a local tarball, then install that file in the project where you want
to run ContributorForge:

```sh
git clone https://github.com/Gowrav-M/contributorforge.git
cd contributorforge
pnpm install --frozen-lockfile
npm pack
cd path/to/your-project
npm install --no-save --ignore-scripts /path/to/contributorforge/contributorforge-0.4.0.tgz
npm exec --offline -- contributorforge --help
```

Adjust the tarball path and version to match the generated filename. The tarball
contains the built CLI and examples; npm installs the declared runtime
dependencies during local installation, so those dependencies must be available
from your configured registry or cache. After installation, `npm exec --offline`
uses the local binary without looking up a public `contributorforge` package.
For source development, `pnpm dev -- --help` runs the CLI directly; `npm link`
is another local option.

When evaluating the unmerged v0.4 change, build from the
`feat/v0.4-adoption-readiness` branch. After merging, use `main`.

## Try a real pull request

After the tarball install, copy the bundled config into your current project:

```sh
node -e "require('node:fs').copyFileSync('node_modules/contributorforge/examples/chalk-issue-639-pr-642.yml', 'chalk-642.yml', require('node:fs').constants.COPYFILE_EXCL)"
```

Review the command and pinned sources in the [Chalk #642 example](docs/PR_COMPARISON.md#public-fork-chalk-pr-642),
then set `approved: true` in your copy. This is your local approval.

```sh
docker pull node:22-bookworm-slim
npm exec --offline -- contributorforge doctor --config chalk-642.yml
npm exec --offline -- contributorforge compare-pr https://github.com/chalk/chalk/pull/642 --config chalk-642.yml
```

In the packaged-CLI run, base exited 1 with `ISSUE_639_NAVIGATOR navigator is not defined`
and the fork head exited 0 with `PASS: browser module imports without navigator`.
The CLI printed `REGRESSION_CHECK_PASSED` and the comparison directory. Open its
`report.html` to inspect both sides. The result covers this one check at the
recorded commits. See the [pilot guide](docs/PILOT_GUIDE.md) for the next steps.

## Quick start

In a directory where you want to store contributor task packets:

```sh
npm exec --offline -- contributorforge init
```

This creates `.contributorforge.yml` with `approved: false` and never overwrites an
existing file. Run `npm exec --offline -- contributorforge doctor --config .contributorforge.yml` to
check local prerequisites and the selected configuration. Have a maintainer
provide issue-specific commands, review them, and only then change
`approved: false` to `approved: true` locally. For example, adapt this
configuration to your own issue and test:

```yaml
version: 1
repository: owner/repository
issue: 42
approved: false
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

The example commands must exist in the target repository. Review every field and
command, then change `approved: false` to `approved: true` locally before use.
That value is your assertion that you reviewed the commands; it is not a
signature or independently verified maintainer identity. A repository's own
downloaded configuration is not automatically trusted.

```sh
docker pull node:22-bookworm-slim
npm exec --offline -- contributorforge verify https://github.com/owner/repository/issues/42
npm exec --offline -- contributorforge start https://github.com/owner/repository/issues/42
```

`verify` reads issue metadata, resolves a commit, checks out source, runs the
approved commands in Docker and creates a task directory. `start` prepares a
workspace under `.contributorforge/workspaces/` and displays instructions; it does
not run setup or reproduction commands on your machine.

Use `--config path/to/config.yml` on either command to select a local configuration.
Use `verify --commit <full-40-character-sha>` to reproduce a recorded revision
instead of the current default-branch commit. Run each command with `--help` for
its supported options.

## Compare a proposed fix

Run the same approved issue-specific check at two pinned commits:

For comparison, also declare how the check's identity is established in your
local configuration. Prefer an unchanged regression file:

```yaml
expectedFailure: ISSUE_42_REGRESSION
comparisonCheck:
  mode: files
  paths:
    - regression.mjs
```

The listed check files must have identical bytes at both revisions. If the entire
check is an invariant command written directly in the reviewed configuration,
`comparisonCheck: { mode: inline }` records your explicit attestation of that fact.
It must not be used to claim a repository test is unchanged without checking it.

```sh
npm exec --offline -- contributorforge compare https://github.com/owner/repository/issues/42 --base <full-base-sha> --head <full-head-sha> --config .contributorforge.yml
```

Both revisions receive separate checkouts, setup and Docker execution. A passing
head check is insufficient by itself: the base must reproduce the expected
failure, the head must pass, and the evidence must satisfy the comparison's
consistency checks before the status can be `REGRESSION_CHECK_PASSED`.
Image ID, Docker server version and platform must agree between the runs.

This status describes the approved regression check, not general correctness or
an independently proven repair. Review both runs and the proposed source change.
See [comparison methodology and limitations](docs/RELEASE_0.2.md).

Comparison reports contain `comparison.json`, `COMPARISON.md`, `report.html` and
the individual base/head evidence. Comparison has its own status vocabulary and
[exit-code table](docs/RELEASE_0.2.md#comparison-statuses).

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
- Symlinks and submodules in source are rejected rather than silently
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
pnpm demo:compare
```

Core tests use authored fixtures and injected infrastructure responses, not a
live third-party repository. The Docker demo is a separate integration check.
See [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), and
[ROADMAP.md](ROADMAP.md). Licensed under [MIT](LICENSE).

## Maintainer onboarding

Start with the [pilot guide](docs/PILOT_GUIDE.md), which walks through preparing
and reviewing a first issue check. Four historical, runnable config examples
are in [`examples/`](examples/); they all default to `approved: false` and need
local human review before approval. The pilot guide also covers the included
[troubleshooting notes](docs/TROUBLESHOOTING.md),
[maintainer feedback form](docs/MAINTAINER_FEEDBACK.md), and
[release checklist](docs/RELEASE_CHECKLIST.md).
See the [0.4 release notes](docs/RELEASE_0.4.md) for the release summary.
