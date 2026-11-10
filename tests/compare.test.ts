import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareSources } from '../src/verification/compare.js';
import { parseConfig } from '../src/config/config.js';
import type { RunnerResult } from '../src/runner/docker.js';

const config = () => parseConfig({ version: 1, repository: 'owner/repo', issue: 1, approved: true,
  reproduction: 'node regression.mjs', expectedFailure: 'ISSUE_1', comparisonCheck: { mode: 'inline' } });
const evidence = (exitCode = 1, output = 'ISSUE_1'): RunnerResult => ({ startedAt: '2026-11-10T00:00:00.000Z', cleanupErrors: [],
  imageId: `sha256:${'a'.repeat(64)}`, dockerVersion: '29.0', platform: 'linux/amd64',
  reproduction: { exitCode, output, timedOut: false, truncated: false, durationMs: 2 } });
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function sources(): Promise<[string, string]> {
  const root = await mkdtemp(join(tmpdir(), 'forge comparison '));
  roots.push(root);
  const pair: [string, string] = [join(root, 'base'), join(root, 'head')];
  for (const dir of pair) { await mkdir(dir); await writeFile(join(dir, 'regression.mjs'), 'same invariant check'); }
  return pair;
}
function runner(base: RunnerResult, head: RunnerResult) {
  return vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce(head);
}
describe('before/after source comparison', () => {
  it('requires reproduced base and passing head under identical recorded environment', async () => {
    const run = runner(evidence(), evidence(0, 'PASS'));
    const result = await compareSources('base', 'head', config(), run);
    expect(result.status).toBe('REGRESSION_CHECK_PASSED');
    expect(result.base.verification.status).toBe('REPRODUCED');
    expect(result.head.verification.status).toBe('NOT_REPRODUCED');
    expect(result.environmentDifferences).toEqual([]);
    expect(run.mock.calls[0]?.[1]).toBe(run.mock.calls[1]?.[1]);
    expect(Object.isFrozen(run.mock.calls[0]?.[1])).toBe(true);
    expect(Object.isFrozen(run.mock.calls[0]?.[1].acceptanceCriteria)).toBe(true);
    expect(Object.isFrozen(run.mock.calls[0]?.[1].comparisonCheck)).toBe(true);
  });
  it.each([
    ['BUG_STILL_REPRODUCED', evidence(), evidence()],
    ['BASE_NOT_REPRODUCED', evidence(0, 'PASS'), evidence(0, 'PASS')],
    ['VERIFICATION_ERROR', evidence(), evidence(1, 'UNEXPECTED')],
    ['VERIFICATION_ERROR', evidence(1, 'UNEXPECTED'), evidence(0, 'PASS')],
    ['ENVIRONMENT_BLOCKED', { ...evidence(), environmentBlocked: true, error: 'Docker missing' }, evidence(0)],
    ['VERIFICATION_ERROR', evidence(), { ...evidence(), error: 'unexpected runner error' }],
    ['EVIDENCE_INCOMPLETE', { ...evidence(), cleanupErrors: ['remove failed'] }, evidence(0)],
    ['EVIDENCE_INCOMPLETE', evidence(), { ...evidence(), reproduction: { ...evidence().reproduction!, timedOut: true } }],
    ['EVIDENCE_INCOMPLETE', { ...evidence(), reproduction: { ...evidence().reproduction!, truncated: true } }, evidence(0)],
    ['EVIDENCE_INCOMPLETE', evidence(), { ...evidence(), reproduction: undefined }],
    ['ENVIRONMENT_BLOCKED', evidence(), { ...evidence(), reproduction: { ...evidence().reproduction!, exitCode: 137 } }],
  ])('classifies %s honestly', async (status, base, head) => {
    expect((await compareSources('base', 'head', config(), runner(base as RunnerResult, head as RunnerResult))).status).toBe(status);
  });
  it.each(['imageId', 'dockerVersion', 'platform'] as const)('rejects %s drift', async (field) => {
    const result = await compareSources('base', 'head', config(), runner(evidence(), { ...evidence(0), [field]: 'different' }));
    expect(result.status).toBe('ENVIRONMENT_BLOCKED');
    expect(result.environmentDifferences.join(' ')).toContain(field);
  });
  it('rejects missing environment provenance', async () => {
    expect((await compareSources('base', 'head', config(), runner(evidence(), { ...evidence(0), imageId: undefined }))).status).toBe('EVIDENCE_INCOMPLETE');
  });
  it('requires an expected failure marker and check attestation before execution', async () => {
    const run = runner(evidence(), evidence(0));
    const noMarker = { ...config(), expectedFailure: undefined };
    expect((await compareSources('base', 'head', noMarker, run)).status).toBe('CHECK_MISMATCH');
    expect((await compareSources('base', 'head', { ...config(), comparisonCheck: undefined }, run)).status).toBe('CHECK_MISMATCH');
    expect(run).not.toHaveBeenCalled();
  });
  it('identical tracked check files establish the check evidence', async () => {
    const [base, head] = await sources();
    const result = await compareSources(base, head, { ...config(), comparisonCheck: { mode: 'files', paths: ['regression.mjs'] } }, runner(evidence(), evidence(0)));
    expect(result.status).toBe('REGRESSION_CHECK_PASSED');
  });
  it('rejects changed or missing check files before execution', async () => {
    const [base, head] = await sources();
    const run = runner(evidence(), evidence(0));
    const configured = { ...config(), comparisonCheck: { mode: 'files' as const, paths: ['regression.mjs'] } };
    await writeFile(join(head, 'regression.mjs'), 'weakened test');
    expect((await compareSources(base, head, configured, run)).status).toBe('CHECK_MISMATCH');
    await rm(join(head, 'regression.mjs'));
    expect((await compareSources(base, head, configured, run)).status).toBe('CHECK_MISMATCH');
    expect(run).not.toHaveBeenCalled();
  });
  it.each(['../escape', '/absolute', 'C:\\secret', 'nested/../../secret', '.env', '.git/check', 'node_modules/check', ''])('rejects unsafe/excluded check path %s', async (path) => {
    const [base, head] = await sources();
    const run = runner(evidence(), evidence(0));
    const result = await compareSources(base, head, { ...config(), comparisonCheck: { mode: 'files', paths: [path] } }, run);
    expect(result.status).toBe('CHECK_MISMATCH');
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects symlink check paths', async (context) => {
    const [base, head] = await sources();
    try { await symlink(base, join(head, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'EPERM') { context.skip('Host forbids symlink creation'); return; }
      throw error;
    }
    expect((await compareSources(base, head, { ...config(), comparisonCheck: { mode: 'files', paths: ['linked/regression.mjs'] } }, runner(evidence(), evidence(0)))).status).toBe('CHECK_MISMATCH');
  });
  it('setup failure is blocked, not a passing comparison', async () => {
    const setup = { ...evidence().reproduction!, exitCode: 2, output: 'install failed' };
    const result = await compareSources('base', 'head', { ...config(), setup: 'npm ci' }, runner({ ...evidence(), setup }, { ...evidence(0), setup }));
    expect(result.status).toBe('ENVIRONMENT_BLOCKED');
  });
  it('runner exceptions become explicit comparison errors', async () => {
    const run = vi.fn().mockRejectedValue(new Error('runner crashed'));
    const result = await compareSources('base', 'head', config(), run);
    expect(result.status).toBe('VERIFICATION_ERROR');
    expect(result.base.run.error).toContain('runner crashed');
  });
});
