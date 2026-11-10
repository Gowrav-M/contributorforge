# Contributing

ContributorForge welcomes focused fixes, regression tests and clearer reproduction
instructions. Follow [the code of conduct](CODE_OF_CONDUCT.md).

## Local setup

Use Node.js 22 LTS, pnpm 10.32.1, Git and a Linux-container Docker engine. Clone
your fork, create a topic branch, then run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker pull node:22-bookworm-slim
pnpm demo
```

The unit suite does not need Docker or GitHub network access. The fixture demo
requires Docker and an explicitly pulled runtime image. Never substitute a host
execution fallback for an unavailable sandbox.

## Changes

1. Describe the behavior being corrected and add a focused regression test.
2. Keep TypeScript strict; avoid `any`, silent catches and unnecessary dependencies.
3. Preserve explicit command approval, source pinning and conservative evidence
   classification. Consult [ARCHITECTURE.md](ARCHITECTURE.md).
4. Run the checks above; include actual results and any unavailable integration
   checks in your pull request. Do not claim mocked results are real Docker runs.
5. Update user-facing documentation when behavior or configuration changes.

Use conventional commits such as `fix: reject truncated reproduction evidence`.
Keep one logical change per commit. Do not commit credentials, `.env` files,
generated task packets, dependency directories, or downloaded repository source.

Pull requests should state the problem, changed behavior, verification performed
and known limitations. New execution privileges, network defaults, infrastructure
providers and public GitHub write operations need explicit design discussion.
Report vulnerabilities using [SECURITY.md](SECURITY.md), not a public issue.
