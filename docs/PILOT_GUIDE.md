# Maintainer pilot guide

This guide takes a maintainer from a local installation to a reviewed task packet.
The first pilot should use a public, non-sensitive repository and a narrow test
with a clear failure marker.

## 1. Install and check the machine

Build a local package from the checked-out ContributorForge source:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm pack
```

Install the generated `contributorforge-<version>.tgz` in the target project:

```sh
npm install --no-save /absolute/path/to/contributorforge/contributorforge-<version>.tgz
npm exec --offline -- contributorforge --help
npm exec --offline -- contributorforge doctor
```

The doctor command checks the local Node.js, Git, GitHub CLI authentication,
Docker context, Linux-container engine and configured local Docker image. It is
read-only: it does not pull images, start containers, change configuration, or
run repository commands. Any failure exits 1. Warnings alone exit 0. With no
config path, a missing default config is a warning; a supplied missing, invalid,
or unapproved config is a failure.

Check a chosen file explicitly with:

```sh
npm exec --offline -- contributorforge doctor --config .contributorforge.yml
```

## 2. Author and approve one issue check

Create a template without overwriting an existing file:

```sh
npm exec --offline -- contributorforge init --config .contributorforge.yml
```

Bind it to the exact public repository and issue. Write a small command that
checks the reported behavior and emits a unique literal marker only when that
behavior is observed. Review the command, target source assumptions, image,
network settings, resource limits, and expected behavior. Then change
`approved: false` to `approved: true` in your local file. That value is an
operator assertion, not a signature and not proof that the repository owner
approved the check.

For a first pilot, keep both network settings false. If dependency setup truly
requires network access, review and enable `setupNetwork` separately; leave
`reproductionNetwork` false unless the regression itself needs it. Pull the
reviewed image explicitly:

```sh
docker pull node:22-bookworm-slim
```

Run a local readiness check, then verify the bound issue:

```sh
npm exec --offline -- contributorforge doctor --config .contributorforge.yml
npm exec --offline -- contributorforge verify https://github.com/owner/repository/issues/42 --config .contributorforge.yml
```

`verify` pins the fetched source revision, copies source into the Docker
execution boundary and writes a local task packet. It does not follow
instructions from the issue body. Review `task.json`, `TASK.md`,
`reproduction.md`, `environment.json`, `logs.txt`, `report.html`, and
`AGENT_TASK.md` before sharing the packet or handing it to a coding agent.

## 3. Compare a proposed fix

For a same-repository fix, select full base and head SHAs and declare how the
check identity is established. Prefer a regression file that is byte-identical
at both revisions; `mode: inline` is an explicit local attestation that the
check itself is embedded in the reviewed config.

```sh
npm exec --offline -- contributorforge compare https://github.com/owner/repository/issues/42 --base <full-base-sha> --head <full-head-sha> --config .contributorforge.yml
```

For a public pull request, explicitly bind the pull request number in the
configuration and use:

```sh
npm exec --offline -- contributorforge compare-pr https://github.com/owner/repository/pull/42 --config .contributorforge.yml
```

Read both sides' evidence and the source diff. `REGRESSION_CHECK_PASSED` only
means the approved check reproduced the configured failure at base and passed at
head under the recorded consistency checks. It is not a general correctness,
security, or merge decision. See [PR comparison](PR_COMPARISON.md) and the
[comparison guide](RELEASE_0.2.md) for limitations and recorded outcomes.

## 4. Historical examples

The four YAML files in [`../examples/`](../examples/) reproduce checks recorded
in [real-world validation](REAL_WORLD_VALIDATION.md) and
[PR comparison](PR_COMPARISON.md). They are historical evaluation configs, not
upstream-approved instructions. Each intentionally has `approved: false`.
Inspect the full command and confirm the pinned source and context before
changing that value locally. The recorded outcomes are evidence for those
specific revisions and runtime image only.

## Five-maintainer pilot plan

Invite five independent maintainers manually, one from each workflow below.
Choose people who already have a public, non-sensitive issue with a known
regression and can spare 20–30 minutes. Ask for consent before sharing a config
or recording feedback. Send one invitation and at most one follow-up.

| Slot | Workflow to try | What to observe |
| --- | --- | --- |
| 1 | First install on Windows | Can they install the tarball and run doctor without help? |
| 2 | First install on Linux | Does doctor identify a missing Docker image and give a usable remedy? |
| 3 | Verify an issue in a small library | Can they write and approve a focused reproduction check? |
| 4 | Compare a same-repository PR | Can they find and interpret both runs and the pinned commits? |
| 5 | Compare a public fork PR | Do the approval boundary, source identities and freshness caveats make sense? |

Ask each maintainer to follow the guide unassisted first and fill in the
[feedback template](MAINTAINER_FEEDBACK.md). Record whether they reached a
report, where they stopped, and whether they correctly interpreted the result.
Fix repeated blockers before expanding the pilot. Share sanitized findings
without identifying participants unless they consent.

## Candidate first contributions

The repository currently has no open GitHub issues. The following are concrete
candidate tasks grounded in the current code and test structure; they are
maintainer backlog suggestions, not posted or assigned issues. Confirm current
code and scope with the maintainers before starting:

1. **Cover invalid YAML through the doctor CLI.** Current unit tests exercise
   `inspectSetup` and missing/unapproved configs; add a focused CLI-level case
   for malformed YAML and assert the failure exit code without invoking any
   repository command.
2. **Improve a Windows PowerShell onboarding path.** Add copy-paste PowerShell
   equivalents for local tarball build/install and verify quoting with a path
   containing spaces. Keep the existing shell examples if they remain useful.
3. **Add a Docker context troubleshooting example.** Capture sanitized output
   for a non-local Docker context and show how to select a local Linux context.
   Keep this documentation tied to the checks in `src/cli/doctor.ts` and avoid
   asking contributors to expose raw environment details.

These tasks are small, bounded documentation or test changes. They do not need
GitHub credentials or write access. Follow [CONTRIBUTING.md](../CONTRIBUTING.md)
for local checks and report which were actually run.
