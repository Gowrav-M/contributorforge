# Historical public issue validation

Both comparisons used Windows Docker Desktop 29.9.2 (Linux/amd64), the
`node:22-bookworm-slim` image and the matching image ID recorded by both runs,
`sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d`.
The checks were authored and reviewed locally for this evaluation. Upstream
maintainers did not approve these commands. Both ran without setup, dependencies,
or container network access. GitHub issue metadata and source were read-only.

## escape-string-regexp #20

- [Repository](https://github.com/sindresorhus/escape-string-regexp)
- [Issue #20](https://github.com/sindresorhus/escape-string-regexp/issues/20) · [Merged fix #21](https://github.com/sindresorhus/escape-string-regexp/pull/21)
- Base `5085b257c801507460270b747f645276fbc1d937`
- Head `732905da074f0220487ad6a27590f89bd0819374`

Save as `issue20.yml` after reviewing the configuration and pinned sources:

```yaml
version: 1
repository: sindresorhus/escape-string-regexp
issue: 20
approved: true
comparisonCheck: { mode: inline }
expectedFailure: ISSUE_20_UNICODE_HYPHEN
reproduction: >-
  node -e 'const escape = require("./index.js"); const text = escape("-"); let regex; try { regex = new RegExp(text, "u"); } catch (error) { if (!(error instanceof SyntaxError)) throw error; console.error("ISSUE_20_UNICODE_HYPHEN", error.message); process.exit(1); } if (!regex.test("-")) throw new Error("Escaped expression did not match hyphen"); console.log("PASS: escaped hyphen is valid in Unicode mode");'
```

```sh
contributorforge compare https://github.com/sindresorhus/escape-string-regexp/issues/20 --base 5085b257c801507460270b747f645276fbc1d937 --head 732905da074f0220487ad6a27590f89bd0819374 --config issue20.yml
```

Base exit 1 emitted `ISSUE_20_UNICODE_HYPHEN Invalid regular expression: /\-/u: Invalid escape`.
Head exit 0 emitted `PASS: escaped hyphen is valid in Unicode mode`.
The comparison returned `REGRESSION_CHECK_PASSED` (exit 0).
No reproduction blocker occurred. The check covers the reported hyphen input
and Unicode flag on this Node image.

## decamelize #21

- [Repository](https://github.com/sindresorhus/decamelize)
- [Issue #21](https://github.com/sindresorhus/decamelize/issues/21) · [Fix commit](https://github.com/sindresorhus/decamelize/commit/26c7530b4fe5674809cb91c3df2615cf065492ab)
- Base `9ac3cb535f46e08eedb6ac7417e9bc26f5ff58bf`
- Head `26c7530b4fe5674809cb91c3df2615cf065492ab`

Save as `issue21.yml` after reviewing the configuration and pinned sources:

```yaml
version: 1
repository: sindresorhus/decamelize
issue: 21
approved: true
comparisonCheck: { mode: inline }
expectedFailure: ISSUE_21_ADDRESS1
reproduction: >-
  node -e 'const decamelize = require("./index.js"); const actual = decamelize("ADDRESS1"); if (actual === "addres_s1") { console.error("ISSUE_21_ADDRESS1", actual); process.exit(1); } if (actual !== "address1") throw new Error("Unexpected result: " + actual); console.log("PASS: ADDRESS1 -> address1");'
```

```sh
contributorforge compare https://github.com/sindresorhus/decamelize/issues/21 --base 9ac3cb535f46e08eedb6ac7417e9bc26f5ff58bf --head 26c7530b4fe5674809cb91c3df2615cf065492ab --config issue21.yml
```

Base exit 1 emitted `ISSUE_21_ADDRESS1 addres_s1`. Head exit 0 emitted
`PASS: ADDRESS1 -> address1`. The comparison returned
`REGRESSION_CHECK_PASSED` (exit 0). No reproduction blocker occurred. This
single input does not establish behavior for other acronym or digit patterns.
