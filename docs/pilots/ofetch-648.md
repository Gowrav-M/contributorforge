# Pilot evidence for ofetch #648

On November 10, 2026, a clean npm install of `contributorforge@0.4.0` reproduced the two URL results described in [ofetch issue #648](https://github.com/unjs/ofetch/issues/648). The run used ofetch source version `2.0.0-alpha.3` at commit [`1dbc37fd1ceab832fc7c90cad81b1091c95ba563`](https://github.com/unjs/ofetch/commit/1dbc37fd1ceab832fc7c90cad81b1091c95ba563).

| Request against `/api?key=abc` | Observed request URL | Expected request URL |
| --- | --- | --- |
| `/users` | `/api?key=abc/users` | `/api/users?key=abc` |
| `/users` with `query: { page: 2 }` | `/api?key=abc%2Fusers&page=2` | `/api/users?key=abc&page=2` |

In both cases the server received `/api` as the pathname and `/users` as part of the `key` value.

## Verification and environment

- `contributorforge doctor` exited `0` with a warning about optional comparison configuration.
- `contributorforge verify` returned `REPRODUCED` and exited `0`. The reproduction process exited `1` and printed `OFETCH_648_PATH_JOIN: /users is in the key query value in both cases`.
- The check ran on Docker `29.9.2` (`linux/amd64`) with Node.js `v26.13.0`, matching the issue's Node version. The image digest is recorded in the configuration below.
- The container used loopback only, with external networking disabled. The run had no setup phase, timeout, truncated output, or recorded cleanup errors.

## Reviewed reproduction

The pilot operator reviewed the following configuration. Review it and the pinned source before running it. Set `approved` to `true` after your own review. The command body matches the recorded run.

```yaml
version: 1
repository: unjs/ofetch
issue: 648
approved: false
expectedFailure: OFETCH_648_PATH_JOIN
expectedBehavior: Append /users to the path before merging the base and request query parameters.
image: node@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
setupNetwork: false
reproductionNetwork: false
timeoutSeconds: 30
reproduction: |
  node --input-type=module <<'JS'
  import { createServer } from 'node:http';
  import { once } from 'node:events';
  import { readFile } from 'node:fs/promises';
  import { ofetch } from './src/index.ts';

  const { version } = JSON.parse(await readFile('./package.json', 'utf8'));
  console.log(`Node ${process.version}; ofetch source ${version}; no external runtime dependencies installed`);
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const baseURL = `http://127.0.0.1:${server.address().port}/api?key=abc`;
    const actual = [
      await ofetch('/users', { baseURL, retry: false, timeout: 5000 }),
      await ofetch('/users', { baseURL, query: { page: 2 }, retry: false, timeout: 5000 }),
    ];
    const expected = ['/api/users?key=abc', '/api/users?key=abc&page=2'];
    const reported = ['/api?key=abc/users', '/api?key=abc%2Fusers&page=2'];
    console.log('Actual:   ' + JSON.stringify(actual));
    console.log('Expected: ' + JSON.stringify(expected));
    if (actual.every((value, i) => value === reported[i])) {
      console.error('OFETCH_648_PATH_JOIN: /users is in the key query value in both cases');
      process.exitCode = 1;
    } else if (actual.every((value, i) => value === expected[i])) {
      console.log('PASS: /users is appended to the pathname in both cases');
    } else {
      console.error('Unexpected behavior; neither the reported bug nor expected output matched');
      process.exitCode = 2;
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  JS
```

Save the configuration as `ofetch-648.yml`. In a clean working directory with Node.js 22 or later, npm, Git, an authenticated GitHub CLI, and a Linux Docker engine, run:

```sh
npm init -y
npm install --ignore-scripts --save-exact contributorforge@0.4.0
docker pull node@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
npm exec --offline -- contributorforge doctor --config ofetch-648.yml
npm exec --offline -- contributorforge verify https://github.com/unjs/ofetch/issues/648 --commit 1dbc37fd1ceab832fc7c90cad81b1091c95ba563 --config ofetch-648.yml
```

## Scope and handoff

This run imported the pinned v2 TypeScript source directly using Node's type stripping. It installed no upstream runtime dependencies. The reporter also tested ofetch `1.5.1` and listed `ufo@1.6.4`. This pilot covers neither the reporter's exact dependency setup nor any published ofetch artifact. It exercised two URL cases at one revision. A proposed fix and later revisions remain untested.

The issue already provides a clear, short reproduction script. ContributorForge added a reusable check and a record of the exact revision, image, and assertions that another contributor can inspect or rerun. The pilot measured no maintainer time savings.
