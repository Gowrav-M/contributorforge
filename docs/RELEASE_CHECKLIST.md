# Release checklist

## Before release

- [ ] Confirm the release version is consistent in `package.json`, CLI output,
  changelog, documentation and generated tarball name.
- [ ] Review the complete diff, including generated files, examples and docs.
- [ ] Run the project checks and record their actual results: `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [ ] Build and inspect a package tarball with `npm pack`. Confirm it contains
  the CLI output, dependency declarations, README, license and YAML examples.
  Exclude credentials, local evidence, fixtures and development-only files.
- [ ] Run `pnpm smoke:package` and check Linux and Windows CI for the exact
  release commit. Run `pnpm demo` and `pnpm demo:compare` with the reviewed image.
- [ ] Install the tarball into a clean temporary project and check
  `contributorforge --help` and `contributorforge doctor`.
- [ ] Confirm `doctor --config` handles a good, missing, invalid, and unapproved
  config as documented, and performs read-only checks.
- [ ] Validate the four example YAML files and confirm each ships with
  `approved: false`. Review command line wrapping and escaped characters.
- [ ] Review [real-world validation](REAL_WORLD_VALIDATION.md) and
  [PR comparison](PR_COMPARISON.md) statements against recorded artifacts.
- [ ] Review security guidance, default-deny network behavior and approval
  boundaries for consistency.

## Publication and announcement

- [ ] Confirm package name availability and registry ownership with the
  maintainers. The recorded npm name lookup returned 404 and `npm whoami`
  returned 401; resolve both with live checks before considering publication.
- [ ] Obtain explicit release-owner approval before publishing a registry
  package, pushing a version tag, creating a public release, or posting
  announcements.
- [ ] After an approved publication, verify the installed registry version and
  provenance against the reviewed tarball.
- [ ] Publish release notes with known limitations, tested platforms and links
  to the validation evidence.

No registry publication, git tag, release, issue creation, or outreach is part
of preparing this checklist.
