# ContributorForge 0.4.0

ContributorForge 0.4 focuses on maintainer onboarding and preflight checks.

## Highlights

- `doctor [--config path]` checks Node.js, Git, GitHub CLI authentication, a
  local Linux Docker engine, and the needed local image. It does not pull the
  image, execute repository commands, or modify configuration. Missing default
  config is a warning; an explicitly selected missing or invalid config, or an
  unapproved config, is a failure.
- Four historical issue and PR YAML examples are included in the package. Each
  starts with `approved: false`; inspect it and flip approval locally only
  after reviewing commands and pinned context.
- The pilot guide, troubleshooting notes, maintainer feedback template and
  release checklist describe the first-run workflow and limits.
- A clean package smoke test runs on Linux and Windows. CI pins actions that
  use the Node.js 24 action runtime and keeps read-only repository permissions.
- `compare-pr` evaluates explicitly bound same-repository and public-fork PRs
  against a tracked issue check. See [PR comparison](PR_COMPARISON.md) for the
  recorded examples and interpretation limits.

## Local package installation

The npm package name lookup returned 404, `npm owner ls` returned 404, and
`npm whoami` returned 401 during release preparation. Install from a reviewed
local tarball instead of relying on the public package name:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm pack
npm install --no-save /path/to/contributorforge-0.4.0.tgz
npm exec --offline -- contributorforge doctor
```

The tarball declares runtime dependencies rather than bundling them; npm must
resolve those dependencies from the configured registry or cache. Offline npm
exec prevents a lookup for an unrelated public package after local installation.

## Validation evidence

On Windows with Node.js 22.22.0 and Docker Desktop 29.9.2, the
`contributorforge-0.4.0.tgz` installed into an empty npm project with lifecycle
scripts disabled. The installed executable reported 0.4.0, created an unapproved
config, and passed doctor with a reviewed config. The installed `verify`
command reproduced escape-string-regexp #20. All four packaged comparisons
returned `REGRESSION_CHECK_PASSED` after local review and approval. The installed
`start --help` passed the smoke test. The execution environment blocked the
full installed `start` invocation, so that path was not exercised end to end.

The exact historical public issue checks are recorded in
[real-world validation](REAL_WORLD_VALIDATION.md). Public PR checks and their
limitations are described in [PR comparison](PR_COMPARISON.md). Those runs are
evidence for their exact source revisions and Docker image only; they are not
upstream approval, general correctness claims, or a substitute for local
review.

See [the release checklist](RELEASE_CHECKLIST.md) before any registry
publication, tag, or public release. This document does not authorize those
actions.
