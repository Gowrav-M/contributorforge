# Verify a pull request regression

`compare-pr` resolves the exact base and head from public GitHub PR metadata.
It checks out each revision from its own repository, runs the same reviewed
check in Docker, and generates a local comparison packet. It supports public
forks with fetchable commits and uses the existing `gh auth login`.

Add `pullRequest: <number>` to a reviewed config containing the base
`repository`, tracked `issue`, `approved: true`, `reproduction`,
`expectedFailure` and `comparisonCheck`. This explicitly links the check
to the PR. The CLI does not infer the issue from the PR description.

```sh
contributorforge compare-pr https://github.com/owner/repository/pull/42 --config .contributorforge.yml
```

The comparison packet under `.contributorforge/comparisons/` has independent
base/head evidence, the pinned repositories and SHAs, the post-run metadata
observation, and script-free Markdown, JSON and HTML summaries.
`PR_HEAD_CHANGED`, `PR_BASE_CHANGED` and `PR_UNKNOWN` exit 4 and retain the
pinned comparison result. No newer revision is substituted. Freshness describes
two observations. It cannot detect changes reverted between those reads or
guarantee that the PR stays unchanged after the second read.

Private or deleted forks, inaccessible commits, identical revisions, symlinks
and submodules are unsupported. GitHub can expose metadata for a PR even if the
fork or commit can no longer be fetched. Such failures stop the command.
Run unfamiliar fork code in a disposable VM. Network is disabled unless the
reviewed config opts in for a phase. A passing comparison applies only to
the approved check. It does not establish security or authorize a merge.

## Observed public PR results

These commands were reviewed locally for this evaluation. There was no upstream
approval of the reproduction configs. Both runs used Docker Desktop 29.9.2,
Linux/amd64 and `node:22-bookworm-slim` (image ID
`sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d`).
Neither used dependency setup or container networking. Both PRs were merged
and their snapshots remained unchanged during the runs.

### Same repository: Chalk PR #688

[Pull request](https://github.com/chalk/chalk/pull/688) · [Tracked issue #624](https://github.com/chalk/chalk/issues/624)

- Base: `chalk/chalk@8a94e0ebfc495dda27f7090fb1a012790b15a76d`
- Head: `chalk/chalk@b86cf6243269c22d0d3204679e68fabf39d39f50`

```yaml
version: 1
repository: chalk/chalk
issue: 624
pullRequest: 688
approved: true
comparisonCheck: { mode: inline }
expectedFailure: ISSUE_624_FORCE_COLOR
reproduction: >-
  env -u CI FORCE_COLOR=1 COLORTERM=truecolor node --input-type=module -e 'const {supportsColor} = await import("./source/index.js"); const level = supportsColor?.level; if (level === 3) { console.error("ISSUE_624_FORCE_COLOR level=3"); process.exit(1); } if (level !== 1) throw new Error("Unexpected level: " + level); console.log("PASS: FORCE_COLOR=1 selects level 1");'
```

An initial check inherited the runner's `CI=true` and returned
`BASE_NOT_REPRODUCED`. Chalk's own fixture excludes ambient CI variables.
With `env -u CI` in the same approved command for both sides, the base exited
1 with `ISSUE_624_FORCE_COLOR level=3` and the head exited 0 with
`PASS: FORCE_COLOR=1 selects level 1`. Result: `REGRESSION_CHECK_PASSED`.

### Public fork: Chalk PR #642

[Pull request](https://github.com/chalk/chalk/pull/642) · [Tracked issue #639](https://github.com/chalk/chalk/issues/639)

- Base: `chalk/chalk@fc809b686d5048d56fec3a5d96d1ad57dee193bf`
- Head: `hyperupcall/chalk@f0387937832645204ef1956adeb71fe53744a66a`

```yaml
version: 1
repository: chalk/chalk
issue: 639
pullRequest: 642
approved: true
comparisonCheck: { mode: inline }
expectedFailure: ISSUE_639_NAVIGATOR
reproduction: >-
  node --input-type=module -e 'delete globalThis.navigator; try { await import("./source/vendor/supports-color/browser.js"); } catch (error) { if (!(error instanceof ReferenceError) || !error.message.includes("navigator")) throw error; console.error("ISSUE_639_NAVIGATOR", error.message); process.exit(1); } console.log("PASS: browser module imports without navigator");'
```

The base exited 1 with `ISSUE_639_NAVIGATOR navigator is not defined`.
The fork head exited 0 with `PASS: browser module imports without navigator`.
Result: `REGRESSION_CHECK_PASSED`. This exercises a browser module in a Node
environment with no navigator. It does not test all browser integrations.
