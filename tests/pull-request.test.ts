import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config/config.js';
import { parseIssueUrl } from '../src/github/github.js';
import { fetchPullRequest, parsePullRequestUrl } from '../src/github/pull-request.js';
import { writeComparison } from '../src/tasks/comparison.js';
import type { ProcessExecutor } from '../src/utils/process.js';
import { compareSources } from '../src/verification/compare.js';
import { comparePullRequest } from '../src/verification/pr-comparison.js';

const url = 'https://github.com/owner/repo/pull/9';
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const newer = 'c'.repeat(40);
const repo = (full_name: string) => ({ full_name, private: false, visibility: 'public' });
const metadata = (source: ReturnType<typeof repo> | null = repo('fork/repo')) => ({
  number: 9, state: 'open', merged: false,
  base: { sha: base, repo: repo('owner/repo') }, head: { sha: head, repo: source },
});
const response = (value: unknown): ProcessExecutor => async () => ({
  exitCode: 0, output: JSON.stringify(value), timedOut: false, truncated: false, durationMs: 1,
});
const config = parseConfig({ version: 1, repository: 'owner/repo', issue: 4, pullRequest: 9, approved: true,
  reproduction: 'node check.mjs', comparisonCheck: { mode: 'inline' }, expectedFailure: 'ISSUE_4' });

it.each([
  'http://github.com/owner/repo/pull/9', 'https://github.com/owner/repo/issues/9',
  'https://github.com/owner/repo/pull/9?diff=split', 'https://github.com/owner/repo/pull/9\n',
  'https://github.com/owner/../pull/9', 'https://evil.test/owner/repo/pull/9',
])('rejects noncanonical PR URL %s', (value) => expect(() => parsePullRequestUrl(value)).toThrow('canonical'));

it.each([['owner/repo', false], ['fork/repo', true]] as const)('pins a public PR from %s', async (source, fork) => {
  const execute = vi.fn(response(metadata(repo(source))));
  await expect(fetchPullRequest(url, execute)).resolves.toMatchObject({
    fork, base: { repository: 'owner/repo', sha: base }, head: { repository: source, sha: head },
  });
  expect(execute).toHaveBeenCalledWith('gh', expect.arrayContaining(['GET', 'repos/owner/repo/pulls/9']), expect.anything());
});

it('refuses deleted forks, private metadata and hostile repository names', async () => {
  await expect(fetchPullRequest(url, response(metadata(null)))).rejects.toThrow('deleted or inaccessible');
  await expect(fetchPullRequest(url, response({ ...metadata(), head: { sha: head, repo: { ...repo('fork/repo'), private: true } } }))).rejects.toThrow('not public');
  await expect(fetchPullRequest(url, response(metadata(repo('evil/../../repo'))))).rejects.toThrow('invalid');
});

it('requires explicit local PR binding before any fetch', async () => {
  const fetch = vi.fn();
  await expect(comparePullRequest(url, { ...config, pullRequest: undefined }, { fetch })).rejects.toThrow('explicitly bind');
  expect(fetch).not.toHaveBeenCalled();
});

it('retains pinned evidence when the post-run metadata read fails', async () => {
  const pinned = await fetchPullRequest(url, response(metadata()));
  const fetch = vi.fn<typeof fetchPullRequest>().mockResolvedValueOnce(pinned)
    .mockRejectedValueOnce(new Error('Fork unavailable'));
  const { evidence } = await comparePullRequest(url, config, {
    fetch, checkout: async () => {},
    compare: (basePath, headPath, approved) => compareSources(basePath, headPath, approved, async () => ({
      startedAt: '2026-11-10T00:00:00Z', cleanupErrors: [], environmentBlocked: true,
    })),
  });
  expect(evidence).toMatchObject({ freshness: 'UNKNOWN', reason: 'Fork unavailable', pinned });
});

it.each([
  [0, {}, 'REGRESSION_CHECK_PASSED'],
  [1, {}, 'BUG_STILL_REPRODUCED'],
  [0, { platform: 'linux/arm64' }, 'ENVIRONMENT_BLOCKED'],
  [0, { reproduction: undefined }, 'EVIDENCE_INCOMPLETE'],
  [0, { cleanupErrors: ['cleanup failed'] }, 'EVIDENCE_INCOMPLETE'],
] as const)('preserves engine result for head exit %s and evidence override %j', async (exitCode, overrides, expected) => {
  const pinned = await fetchPullRequest(url, response(metadata()));
  const checkout = vi.fn<typeof import('../src/github/github.js').checkoutRevision>().mockResolvedValue(undefined);
  const result = await comparePullRequest(url, config, {
    fetch: async () => pinned,
    checkout,
    compare: (basePath, headPath, approved) => compareSources(basePath, headPath, approved, async (path) => {
      const isBase = path === basePath;
      return {
        startedAt: '2026-11-10T00:00:00Z', cleanupErrors: [], imageId: 'sha256:' + base, platform: 'linux/amd64', dockerVersion: '29',
        reproduction: { exitCode: isBase ? 1 : exitCode, output: 'ISSUE_4 token=hidden-value', durationMs: 1, timedOut: false, truncated: false },
        ...(isBase ? {} : overrides),
      };
    }),
  });
  expect(checkout).toHaveBeenNthCalledWith(1, pinned.base, expect.any(String));
  expect(checkout).toHaveBeenNthCalledWith(2, pinned.head, expect.any(String));
  expect(result.evidence.freshness).toBe('UNCHANGED');
  expect(result.result.status).toBe(expected);
});

it('preserves pinned fork evidence when the head changes and renders a stale report safely', async () => {
  const pinned = await fetchPullRequest(url, response(metadata()));
  const fetch = vi.fn<typeof fetchPullRequest>().mockResolvedValueOnce(pinned)
    .mockResolvedValueOnce({ ...pinned, head: { ...pinned.head, sha: newer } });
  const { result, evidence } = await comparePullRequest(url, config, {
    fetch, checkout: async () => {},
    compare: (basePath, headPath, approved) => compareSources(basePath, headPath, approved, async (path) => ({
      startedAt: '2026-11-10T00:00:00Z', cleanupErrors: [], imageId: 'sha256:' + base, platform: 'linux/amd64', dockerVersion: '29',
      reproduction: { exitCode: path === basePath ? 1 : 0, output: 'ISSUE_4 token=hidden-value', durationMs: 1, timedOut: false, truncated: false },
    })),
  });
  expect(evidence).toMatchObject({ freshness: 'HEAD_CHANGED', pinned: { head: { sha: head } }, observed: { head: { sha: newer } } });
  expect(result.status).toBe('REGRESSION_CHECK_PASSED');
  const root = await mkdtemp(join(tmpdir(), 'forge-pr-output-'));
  try {
    const issue = { ...parseIssueUrl('https://github.com/owner/repo/issues/4'), title: '<script>bad</script>', body: '', labels: [], state: 'open' as const, defaultBranch: 'main', commit: base };
    const directory = await writeComparison(root, { issue, config, result, base, head, pullRequest: evidence });
    const html = await readFile(join(directory, 'report.html'), 'utf8');
    const json = await readFile(join(directory, 'comparison.json'), 'utf8');
    expect(html).toContain('PR_HEAD_CHANGED');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain(`https://github.com/fork/repo/commit/${head}`);
    expect(json).not.toContain('hidden-value');
    expect(JSON.parse(await readFile(join(directory, 'head/task.json'), 'utf8'))).toMatchObject({ sourceRevision: { repository: 'fork/repo', sha: head } });
  } finally { await rm(root, { recursive: true, force: true }); }
});
