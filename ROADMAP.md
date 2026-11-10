# Roadmap

These are proposed milestones, not implemented features or delivery commitments.

## Next: compare a proposed fix against a pinned base

Promote the internal buggy/fixed fixture foundation into a command that runs the
same approved check at two commits. Preserve independent evidence, environment
identities and setup results. A passing patched check must not erase failures at
the base or claim general correctness.

## Reproducibility

- Export/import a task archive with configuration and artifact integrity hashes.
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
