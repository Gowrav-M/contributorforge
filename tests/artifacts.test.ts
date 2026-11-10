import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskId, writeBundle } from '../src/tasks/bundle.js';
import { redact } from '../src/reports/redact.js';
import { parseConfig } from '../src/config/config.js';

const issue = { owner: 'owner', repo: 'repo', number: 1, url: 'https://github.com/owner/repo/issues/1', title: '<script>alert(1)</script>', body: 'token=super-secret-value', commit: 'a'.repeat(40) };
describe('portable artifacts', () => {
  it('uses deterministic safe IDs and rejects traversal', () => {
    expect(taskId(issue)).toBe(taskId({ ...issue }));
    expect(taskId(issue)).toMatch(/^[a-z0-9-]+$/);
    expect(() => taskId({ ...issue, owner: '../../escape' })).toThrow();
    expect(taskId(issue)).not.toBe(taskId({ ...issue, number: 2, url: 'https://github.com/owner/repo/issues/2' }));
  });
  it('writes all files, redacts every artifact, escapes HTML and never overwrites', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge artifacts '));
    try {
      const input = { issue, verification: { status: 'NEEDS_REPRO_STEPS' as const, reason: 'No approved config' } };
      const first = await writeBundle(root, input);
      const second = await writeBundle(root, input);
      expect(second).not.toBe(first);
      const names = await readdir(first);
      expect(names.sort()).toEqual(['AGENT_TASK.md', 'TASK.md', 'environment.json', 'logs.txt', 'report.html', 'reproduction.md', 'task.json'].sort());
      for (const name of names) expect(await readFile(join(first, name), 'utf8')).not.toContain('super-secret-value');
      const html = await readFile(join(first, 'report.html'), 'utf8');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain('prefers-reduced-motion');
      expect(html).not.toMatch(/<script|https:\/\/fonts/);
      const task = JSON.parse(await readFile(join(first, 'task.json'), 'utf8'));
      expect(task.verification.status).toBe('NEEDS_REPRO_STEPS');
      expect(task.issue.commit).toBe(issue.commit);
      expect(await readFile(join(first, 'AGENT_TASK.md'), 'utf8')).toContain('untrusted');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('refuses a symlinked output ancestor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge link '));
    const outside = await mkdtemp(join(tmpdir(), 'forge outside '));
    try {
      await symlink(outside, join(root, '.contributorforge'), process.platform === 'win32' ? 'junction' : 'dir');
      await expect(writeBundle(root, { issue, verification: { status: 'NEEDS_REPRO_STEPS', reason: 'No config' } })).rejects.toThrow(/symlink|directory/);
      expect(await readdir(outside)).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
  it('preserves real phase metadata while redacting captured logs in every format', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge evidence '));
    try {
      const config = parseConfig({ version: 1, repository: 'owner/repo', issue: 1, approved: true, reproduction: 'node regression.mjs', expectedFailure: 'ISSUE_1', expectedBehavior: 'Two items', acceptanceCriteria: ['Regression passes'] });
      const destination = await writeBundle(root, { issue, config, verification: { status: 'REPRODUCED', reason: 'Expected failure observed' }, run: { startedAt: '2026-11-09T00:00:00Z', cleanupErrors: [], imageId: 'sha256:abc', reproduction: { exitCode: 1, output: 'ISSUE_1\nAuthorization: Bearer captured-secret', timedOut: false, truncated: false, durationMs: 40 } } });
      for (const name of await readdir(destination)) expect(await readFile(join(destination, name), 'utf8')).not.toContain('captured-secret');
      const task = JSON.parse(await readFile(join(destination, 'task.json'), 'utf8'));
      expect(task.execution.reproduction.exitCode).toBe(1);
      expect(task.environment.configurationHash).toMatch(/^[a-f0-9]{64}$/);
      expect(await readFile(join(destination, 'logs.txt'), 'utf8')).toContain('durationMs=40');
      expect(await readFile(join(destination, 'reproduction.md'), 'utf8')).toContain(`--commit ${issue.commit}`);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('handles adversarial backtick-heavy issue text without argument stack overflow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge fences '));
    try {
      const destination = await writeBundle(root, { issue: { ...issue, body: '`x'.repeat(150000) }, verification: { status: 'NEEDS_REPRO_STEPS', reason: 'No config' } });
      expect(await readFile(join(destination, 'TASK.md'), 'utf8')).toContain('`x`x');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('best-effort redaction', () => {
  it.each([
    ['token=secret-value', 'secret-value'],
    ['Authorization: Bearer secret-value', 'secret-value'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['https://user:password@example.com/path', 'password'],
    ['-----BEGIN PRIVATE KEY-----\nsecret material\n-----END PRIVATE KEY-----', 'secret material'],
  ])('redacts %s', (text, secret) => { expect(redact(text)).not.toContain(secret); });
});
