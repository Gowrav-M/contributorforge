# ContributorForge architecture

ContributorForge v0.1 is a local TypeScript CLI on Node.js 22 LTS. pnpm owns
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

## Modules

- `cli`: argument parsing and orchestration; documented exit codes.
- `config`: strict YAML schema and explicit approval.
- `github`: public issue metadata and exact source revision.
- `runner`: bounded subprocess capture and isolated Docker execution.
- `verification`: pure evidence classification, reusable for base/patch comparison.
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
