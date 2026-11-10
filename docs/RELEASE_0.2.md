# ContributorForge v0.2: compare a regression at two commits

The comparison command helps a maintainer assess whether the same approved
issue-specific regression fails at a base commit and passes at a proposed head.
It preserves the evidence from both executions instead of inferring a repair from
one successful test run.

## Run

Install from source and build the CLI as described in [README.md](../README.md).
Review a local `.contributorforge.yml` bound to the requested repository and issue.
Comparison requires a nonempty expected failure marker and an explicit check
identity declaration. For example:

```yaml
expectedFailure: ISSUE_42_REGRESSION
comparisonCheck:
  mode: files
  paths:
    - regression.mjs
```

Add these fields to the rest of your approved configuration; this fragment is not
a complete configuration by itself. The listed source-relative files must have
identical bytes at base and head. Include the files that define your invariant
check, not the implementation files that the proposed change is meant to repair.

For a check written entirely into the configuration command, use:

```yaml
comparisonCheck:
  mode: inline
```

Inline mode is a local maintainer attestation that the command itself contains
the invariant check. It is not automatic proof that a command such as `npm test`
runs unchanged test code. File mode likewise does not prove that every transitive
import, dynamic input or dependency remained unchanged.

Pull its trusted runtime image explicitly, then run:

```sh
docker pull node:22-bookworm-slim
contributorforge compare https://github.com/owner/repository/issues/42 --base <full-base-sha> --head <full-head-sha> --config .contributorforge.yml
```

Replace both SHA placeholders with full 40-character commit hashes from the target
repository. These are command syntax examples, not a claim about an existing
GitHub issue. `compare --help` lists the supported arguments.

Each revision must be reachable from the resolved default branch or be the
tip of a branch in that repository. A commit available only from a fork or in
the history of a non-default branch is unsupported unless it meets that rule.

## Interpretation

`REGRESSION_CHECK_PASSED` is deliberately narrower than “bug fixed.” It requires
that the base reproduces the configured failure, the head passes the configured
check, and the two runs satisfy the implemented evidence consistency checks.
An unavailable environment, failed setup, truncated output, timeout or cleanup
failure cannot establish a successful comparison.
The runtime image ID, Docker server version and platform must agree, and the
comparison must have sufficient evidence to evaluate those checks.

Review the approved commands, the source diff and both runs before accepting a
change. Code can print a failure marker or alter what a test checks. A successful
comparison is not a security attestation, a complete test suite result, or proof
that unrelated behavior remains correct.

## Comparison statuses

| Status | Exit | Interpretation |
| --- | ---: | --- |
| `REGRESSION_CHECK_PASSED` | 0 | Base reproduced, head passed and evidence consistency checks passed. |
| `BUG_STILL_REPRODUCED` | 1 | The expected issue-specific failure remains at head. |
| `BASE_NOT_REPRODUCED` | 1 | The base did not establish the expected failing baseline. |
| `CHECK_MISMATCH` | 2 | The approved comparison check cannot be established as the same check. |
| `ENVIRONMENT_BLOCKED` | 3 | The execution environment could not complete verification. |
| `EVIDENCE_INCOMPLETE` | 4 | Required execution or consistency evidence is missing or incomplete. |
| `VERIFICATION_ERROR` | 4 | An unexpected verification failure prevents a conclusion. |

Argument/configuration errors occur before a valid comparison and must not be
interpreted as a passing regression. Review the accompanying reason and the
individual run evidence rather than deriving correctness from an exit code alone.

## Artifacts

The comparison packet contains `comparison.json` for structured results,
`COMPARISON.md` for review, a local `report.html`, and individual base/head evidence.
Keep both sides when sharing the packet; the passing head alone loses the
baseline and consistency checks. The packet does not vendor the source checkout
or dependency cache, and it does not transfer approval to another operator.

## Authored local demonstration

```sh
pnpm install --frozen-lockfile
pnpm build
docker pull node:22-bookworm-slim
pnpm demo:compare
```

The demonstration uses local authored fixture code and synthetic issue metadata.
It does not require a live GitHub issue or modify a third-party repository. It
must run through Docker; a mocked test result is not demonstration evidence.

## Security and reproducibility

Both revisions use the same reviewed local configuration. Each run has a fresh
source checkout and isolated workspace. Networking approval, non-root execution,
resource/time limits and cleanup requirements are unchanged from `verify`.
Neither repository commands nor issue-derived instructions run on the host.

Image tags and network dependencies can change, so inspect the recorded image and
environment identities. Use reviewed image digests and locked dependencies when
possible. The consistency checks reduce accidental mismatches; they do not make
network services, package downloads or arbitrary tests deterministic.

The CLI creates local reports only. It does not publish packages, open pull
requests or execute a coding agent. See [SECURITY.md](../SECURITY.md) for the Docker
boundary and artifact-sharing precautions.

## Release checklist

- [ ] Review and merge the v0.2 pull request after CI passes.
- [ ] Confirm package and CLI both report 0.2.0. Build, pack and test the executable
  in a clean project on supported Node versions. Inspect the tarball for generated
  evidence, credentials and development-only files.
- [ ] Confirm registry ownership and authentication before any npm publication.
- [ ] Obtain approval for publication, then publish the reviewed tarball and check
  that installation from the registry resolves the expected version.
- [ ] Obtain approval for the Git tag and public GitHub release. Tag the verified
  main commit and use these notes with the links to CI and real-world validation.
