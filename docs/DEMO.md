# Docker fixture demonstration

Run from a ContributorForge checkout with Node 22+, pnpm, Git and a local Linux
Docker engine. The fixture creates two commits in a temporary repository and
runs the same regression in Docker at each revision. Its issue metadata is local
test data, so the demo requires no GitHub login.

```sh
pnpm install --frozen-lockfile
docker pull node:22-bookworm-slim
pnpm demo
```

Captured on Windows with Docker 29.9.2 (Linux/amd64). The transcript omits the
machine-specific workspace prefix and pnpm's command banner.

```text
buggy: REPRODUCED (exit 1)
ISSUE_1_TRAILING_COMMA: expected two items for alpha,beta,
Expected values to be strictly deep-equal:
+ actual - expected

  [
    'alpha',
    'beta',
+   ''
  ]
Commit: 155b4d71a7645ffb9cf6c97fc90ba5d593b0287b
Task bundle: .contributorforge/tasks/contributorforge-fixture-parser-1-02564d62451b
fixed: NOT_REPRODUCED (exit 0)
PASS: trailing delimiters do not create an empty item
Commit: 885fed45543db4139d55d23223e62e5f332ace26
Task bundle: .contributorforge/tasks/contributorforge-fixture-parser-1-02564d62451b-541929f3
```

The demo itself exited 0 because both outcomes matched the fixture's expected
behavior. Open `report.html` in either printed directory to inspect the
observed output and environment. Repeated runs get fresh paths and preserve
previous evidence.
