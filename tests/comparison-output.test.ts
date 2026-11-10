import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config/config.js';
import { confirmRepositoryRevision, parseIssueUrl, validateComparisonShas } from '../src/github/github.js';
import { writeComparison } from '../src/tasks/comparison.js';
import { compareSources } from '../src/verification/compare.js';
import type { ProcessExecutor } from '../src/utils/process.js';

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const issue = { ...parseIssueUrl('https://github.com/owner/repo/issues/1'), title: '<script>test</script>', body: '', labels: [], state: 'closed' as const, defaultBranch: 'main', commit: head };

it('requires distinct full SHAs', () => {
  expect(() => validateComparisonShas(base, head)).not.toThrow();
  expect(() => validateComparisonShas(base, base)).toThrow('different');
  expect(() => validateComparisonShas('main', head)).toThrow('full lowercase');
});

it('requires repository history or branch-tip evidence', async () => {
  const response = (output: string) => ({ output, exitCode: 0, timedOut: false, truncated: false, durationMs: 1 });
  const ancestor = vi.fn<ProcessExecutor>().mockResolvedValue(response(base));
  await confirmRepositoryRevision(issue, base, ancestor);
  expect(ancestor).toHaveBeenCalledWith('gh', expect.arrayContaining([`repos/owner/repo/compare/${base}...${head}`]), expect.anything());
  const foreign = vi.fn<ProcessExecutor>().mockResolvedValueOnce(response(head)).mockResolvedValueOnce(response('0'));
  await expect(confirmRepositoryRevision(issue, base, foreign)).rejects.toThrow('Cannot confirm');
  const branch = vi.fn<ProcessExecutor>().mockResolvedValueOnce(response(head)).mockResolvedValueOnce(response('1'));
  await expect(confirmRepositoryRevision(issue, base, branch)).resolves.toBeUndefined();
});

it('writes independent evidence, escapes HTML and keeps a stable comparison ID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-compare-output-'));
  try {
    const config = parseConfig({ version: 1, approved: true, repository: 'owner/repo', issue: 1, reproduction: 'node check.mjs', expectedFailure: 'BUG', comparisonCheck: { mode: 'inline' } });
    const result = await compareSources('base', 'head', config, async (source) => ({
      startedAt: '2026-01-01T00:00:00Z', imageId: 'sha256:' + base, platform: 'linux/amd64', dockerVersion: '29', cleanupErrors: [],
      reproduction: { output: source === 'base' ? 'BUG token=do-not-share' : 'PASS', exitCode: source === 'base' ? 1 : 0, timedOut: false, truncated: false, durationMs: 1 },
    }));
    const input = { issue, base, head, config, result };
    const first = await writeComparison(root, input);
    const second = await writeComparison(root, input);
    const read = (directory: string, name: string) => readFile(join(directory, name), 'utf8');
    const json = JSON.parse(await read(first, 'comparison.json')) as { id: string; result: { status: string } };
    expect(json.result.status).toBe('REGRESSION_CHECK_PASSED');
    expect(JSON.parse(await read(second, 'comparison.json'))).toMatchObject({ id: json.id });
    expect(first).not.toBe(second);
    expect(await read(first, 'report.html')).toContain('&lt;script&gt;test&lt;/script&gt;');
    expect(await read(first, 'report.html')).not.toContain('<script>');
    expect(await read(first, 'base/logs.txt')).toContain('BUG token=[REDACTED]');
    expect(await read(first, 'head/logs.txt')).toContain('PASS');
    expect(await read(first, 'comparison.json')).not.toContain('do-not-share');
    expect(await read(first, 'COMPARISON.md')).toContain('Captured reproduction output differs');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
