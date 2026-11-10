# Validation record

## Milestone 1

Validated on Windows with Node v22.22.0 and pnpm 10.32.1:

- `pnpm test`: 2 test files, 16 tests passed.
- `npx tsc --noEmit`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0.
- Compiled CLI help lists init, verify and start.

An independent review approved the milestone. Subsequent milestones replace the
initial verify/start placeholders; this record describes the incremental gate.

## Environment preparation

`gh auth status` confirmed Gowrav-M as active with network access. Repository lookup
for Gowrav-M/contributorforge and npm lookup for contributorforge returned 404;
GitHub public repository search returned no results at initial inspection.

Docker Desktop engine 29.9.2 started successfully. The downloaded
`node:22-bookworm-slim` image reports Node v22.23.4 under a non-root, read-only,
network-disabled container with dropped capabilities and resource limits.

These preliminary checks do not establish end-to-end verification functionality.

## v0.2 validation

The starting revision was `86a72d9` on `origin/main`. The prior v0.1 validation
passed 74 tests, lint, typecheck, build and its Docker fixture, with a successful
[main CI run](https://github.com/Gowrav-M/contributorforge/actions/runs/42729362464).
The v0.2 branch retains that test suite and passes 107 tests total across 10 files.
Lint, both TypeScript checks, build, the original Docker fixture and the new
comparison demo passed on Windows with Docker Desktop 29.9.2.

Two historical issues produced a failing base and passing head through the
built CLI. See [the commands and evidence](REAL_WORLD_VALIDATION.md).
The 0.2.0 tarball installed in a fresh npm project with lifecycle scripts
disabled. Its installed Windows executable returned 0.2.0, displayed compare
help and generated an unapproved configuration with init. The package contained
the compiled CLI, README, license and manifest, without generated reports or
development sources. Commander, YAML and Zod installed as runtime dependencies.
