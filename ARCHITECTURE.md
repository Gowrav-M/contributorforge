# ContributorForge architecture

ContributorForge v0.2 is a local TypeScript CLI on Node.js 22 LTS. pnpm owns
dependencies; Vitest exercises behavior without third-party repositories.

## Trust and evidence

Issue bodies are untrusted data, never executable instructions. A local, explicitly
approved `.contributorforge.yml` binds commands to one repository and issue.
The CLI does not auto-trust a configuration discovered in a downloaded repository.
Approval is a local operator assertion, not a cryptographic maintainer signature.

GitHub ingestion uses the existing `gh` login for read-only API requests. Source is
pinned to a full commit SHA. Git operations never execute repository hooks or setup
commands. Setup and reproduction execute only inside Docker, in separate phases.
Setup networking and reproduction networking require separate explicit opt-ins.

Containers run without privileges, host credentials, or a Docker socket. Resource
limits, a non-root user, dropped capabilities, and no-new-privileges reduce exposure.
Docker shares a kernel and is not a perfect boundary: use a disposable VM for
hostile repositories. Cleanup failure must be reported, never silently ignored.

REPRODUCED requires a nonzero issue-specific check with a configured expected
literal failure marker. Timeout, infrastructure errors, truncated evidence and
unexpected failures cannot prove an issue. A passing check is NOT_REPRODUCED,
which does not prove the reported bug is fixed generally.

## Base and head comparison

The comparison workflow accepts explicit full base and head commit SHAs. Both
checkouts belong to the requested public repository and use the same locally
approved issue-bound configuration. Each revision runs in a fresh Docker
workspace; source files and dependency state are not shared between revisions.
Setup and reproduction evidence remain separately inspectable for both sides.

The comparison layer consumes evidence rather than deciding from a head exit code
alone. `REGRESSION_CHECK_PASSED` requires a reproduced base, a passing head and
consistent verification evidence. A setup failure, incomplete capture or failed
cleanup must prevent a successful comparison. This is a result for the configured
regression check only; an altered test or misleading repository code can invalidate
the human interpretation. See [the v0.2 methodology](docs/RELEASE_0.2.md).

The expected failure marker is mandatory for comparison. `comparisonCheck` either
lists source-relative files whose bytes must match at both revisions (`mode:
files`) or records the local maintainer's explicit attestation that the configured
command contains the invariant check (`mode: inline`). File identity does not
prove the identity of all transitive imports, dependencies or dynamic inputs.
The image ID, Docker server version and platform must agree. These gates are
intentionally conservative and do not treat absent metadata as matching metadata.

Comparison output includes `comparison.json`, `COMPARISON.md`, `report.html` and
the separate base/head evidence. Status and exit-code mappings remain distinct
from single-revision verification so an unchanged reproduced bug cannot look like
a passing regression comparison.

## Modules

- `cli`: argument parsing and orchestration; documented exit codes.
- `config`: strict YAML schema and explicit approval.
- `github`: public issue metadata and exact source revision.
- `runner`: bounded subprocess capture and isolated Docker execution.
- `verification`: per-run evidence classification and conservative base/head comparison.
- `tasks`, `reports`: portable JSON, Markdown and escaped local HTML artifacts.
- `utils`: identifiers, safe paths and best-effort secret redaction.

No server, database, telemetry, LLM key, or automated coding-agent execution.
Reports use a dark developer-tool design with semantic tokens, readable monospace
evidence and responsive layout. Their contents are inert and escaped.

## Delivery gates

1. CLI/config scaffold: build, typecheck, configuration and help tests.
2. GitHub ingestion/fixtures: input validation, SHA pinning and real buggy/fixed tests.
3. Docker runner: timeout, missing engine, resource isolation and classification tests.
4. Bundles: deterministic paths, redaction, escaping and all portable artifacts.
5. Contributor checkout, documentation, CI, package checks and end-to-end demo.

Each gate is verified before proceeding. A Docker-unavailable result is reported
honestly; mocked tests cannot substitute for a successful real Docker demonstration.
