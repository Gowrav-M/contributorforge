# v0.1 implementation and validation plan

The maintainer supplied the product scope and authorized implementation and a new
public GitHub repository. Existing repositories must remain untouched.

## Milestone 1 — CLI and configuration

Create the Node 22 / pnpm / TypeScript / Vitest package. Add strict YAML validation,
an unapproved init template, help and actionable failures. Verify schema errors,
safe network defaults, paths with spaces and no-overwrite behavior.

## Milestone 2 — Exact source

Validate canonical public GitHub issue URLs, use read-only `gh api` metadata, reject
pull requests/private repos, resolve a complete commit SHA and prepare an isolated
checkout. Disable repository hooks, submodules and interactive credential prompts.
Add a tiny parser fixture with buggy and fixed versions and the same regression check.

## Milestone 3 — Real evidence

Add bounded subprocess capture, redaction and the Docker runner. Copy approved
source into container-owned storage rather than exposing writable host source.
Apply non-root execution, dropped capabilities, PID/CPU/memory/time constraints,
read-only root filesystem and explicit phase networking. Record image identity,
setup/reproduction exits and infrastructure failures. Verify conservative status
classification and cleanup, then run the local fixture in actual Docker.

## Milestone 4 — Portable task packet

Generate deterministic, safely located task directories containing task.json,
TASK.md, reproduction.md, environment.json, logs.txt, report.html and AGENT_TASK.md.
Escape HTML and redact before serialization. Clearly distinguish measured evidence,
maintainer assertions and unverified suggestions. Verify all artifacts and responsive
dark report presentation.

## Milestone 5 — Delivery

Wire verify/start end to end, create contributor checkout without host command
execution, write user/security/contributor documentation, least-privilege pinned CI,
MIT license and accurate demo transcript. Run lint, typecheck, unit/fixture tests,
build, real Docker demo and npm package inspection. Review security and quality,
commit logically, create only the new repository, push and verify remote files/CI.

No npm publication or automatic issues, comments, labels, pull requests or agent runs.
