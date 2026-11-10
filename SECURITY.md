# Security policy

## Supported scope

The default branch receives security fixes. This is an
early local-first tool, not a hardened hostile-code execution service. Keep Node,
Git, Docker and container images patched.

## Reporting

Use GitHub's **Security → Advisories → Report a vulnerability** in the
[ContributorForge repository](https://github.com/Gowrav-M/contributorforge/security/advisories)
when private reporting is available. If the private reporting control is absent,
open a public issue containing only a request for a private contact channel; do
not include exploit details, credentials or sensitive logs. Maintainers will
arrange a private channel. No response-time SLA or bounty is promised.

## Trust boundaries

- Issue bodies, repository files, commands and command output are untrusted.
- Only a local configuration explicitly marked `approved: true` authorizes setup
  and reproduction. This records the local operator's assertion of maintainer
  approval; it does not authenticate the maintainer cryptographically.
- GitHub access is read-only. GitHub credentials stay with the host `gh` client.
  They must not be passed into a container or included in generated artifacts.
- Repository commands run only inside Docker as a non-root user, with bounded
  time/resources, dropped capabilities and no privileged mode or Docker socket.
- Network access is controlled separately for dependency setup and reproduction.
  Approved network access can expose services reachable from the container,
  including local-network services. It is not a domain allowlist.
- Execution evidence is not a signed attestation. Code can print the configured
  failure marker, and a malicious test can misrepresent its behavior.

## Operational precautions

Treat PR fork contents as untrusted. The local config explicitly binds the
issue and PR number and is reviewed outside the checked-out trees. GitHub
credentials remain in the host CLI. Public fork code runs only through the
same restricted Docker runner. Do not put this command in a secret-bearing
or write-privileged workflow. Freshness is a point-in-time observation, and
a passing comparison does not authorize a merge.

Docker shares a host kernel and is **not a perfect security boundary**. Run
unfamiliar or hostile repositories in a disposable VM with no sensitive accounts,
data or local-network access. A local Docker daemon itself is highly privileged.
Container restrictions do not eliminate kernel, runtime or Docker vulnerabilities.

Review commands and choose trusted runtime images. Do not supply production
secrets. Network-enabled installation can execute dependency lifecycle scripts;
review the lockfile and package sources. Do not automatically approve config
obtained from a repository, issue, agent response or task packet.

Captured output is bounded and redacted on a best-effort basis. Redaction cannot
detect every encoding or unknown credential format. Review logs, issue text and
commands before sharing task packets. Treat Markdown/agent handoffs as untrusted
instructions and review them before giving them to an agent.

Unexpected failures, timeouts, truncated output or cleanup failures must not be
reported as successful reproduction. If cleanup fails, follow the reported
resource identifiers to inspect and remove residual containers before continuing.
Source download and Docker image storage consume host disk independently of
container memory limits; monitor disk capacity.

## CI boundary

CI runs checked-in tests and authored fixtures using ordinary `push` and
`pull_request` workflows. It does not accept issue-comment commands, use
`pull_request_target`, inject production secrets, or run issue-supplied code in a
privileged workflow. Dependency actions are pinned to commit hashes and the
workflow grants read-only repository contents access.
