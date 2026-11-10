# Changelog

## 0.2.0 — Unreleased

- Add `compare` for an approved issue-specific check at explicit base and head
  commits, retaining independent execution evidence for both revisions.
- Require conservative evidence consistency gates before reporting
  `REGRESSION_CHECK_PASSED`; a passing head alone is insufficient.
- Add an authored Docker comparison demonstration with `pnpm demo:compare` and
  run it in CI alongside the existing verification demo.
- Document comparison methodology, interpretation and limitations.

No npm publication is implied by this entry.

## 0.1.0 — Unreleased

- Local CLI with configuration initialization, issue verification and contributor
  workspace preparation.
- Public GitHub issue metadata and exact commit checkout using existing `gh`
  authentication.
- Explicit issue-bound command approval and separately controlled setup and
  reproduction networking.
- Docker-based evidence collection and conservative verification statuses.
- Portable JSON, Markdown, local HTML and vendor-neutral agent task packets.
- Authored buggy/fixed parser fixtures, Vitest coverage and a Docker demo.
- CI for lint, typechecking, tests, build and the authored fixture demonstration.

No npm publication is implied by this entry.
