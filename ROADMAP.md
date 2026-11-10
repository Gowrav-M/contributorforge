# Roadmap

v0.3 adds approved regression comparisons for same-repository and public-fork
pull requests. Next, explore a way to distribute a reviewed, immutable
regression harness independently of both source trees.

These are proposed milestones, not implemented features or delivery commitments.

## v0.2: comparison foundation

The `compare` command runs an approved check at explicit base and head commits,
retains both results, and reports `REGRESSION_CHECK_PASSED` only when the collected
evidence satisfies its consistency gates. See [the v0.2 guide](docs/RELEASE_0.2.md).
This is a narrow regression result, not a general claim that the issue is fixed.

## Next: portable evidence with integrity checks

Export/import a task archive with configuration and artifact integrity hashes.
Make missing or altered evidence explicit during import, and preserve the
maintainer approval boundary instead of automatically executing imported commands.

## Reproducibility

- Improve runtime digest pinning and dependency-cache provenance.
- Add explicit support for Git LFS, symlinks and submodules only with safe,
  reproducible source materialization.
- Exercise additional operating systems and Node.js LTS releases in CI.

## Maintainer workflow

- Multiple named issue-specific checks with clear approval provenance.
- Richer acceptance criteria and structured expected/observed results.
- Optional cryptographic approval and evidence signatures.

## Isolation

- Disposable VM execution backend and stronger network policy controls.
- Storage quotas and cancellation/cleanup recovery improvements.
- Additional language runtimes after the Node.js workflow is dependable.

Automatic pull requests, agent execution, telemetry, billing and a hosted backend
are not prerequisites for these milestones.
