import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutIssue, fetchIssue, parseIssueUrl } from '../src/github/github.js';
import type { ProcessResult } from '../src/utils/process.js';

const success = (value: unknown): ProcessResult => ({ output: typeof value === 'string' ? value : JSON.stringify(value), exitCode: 0, timedOut: false, truncated: false, durationMs: 1 });
const sha = 'a'.repeat(40);
describe('public issue ingestion', () => {
  it('parses a canonical issue URL', () => {
    expect(parseIssueUrl('https://github.com/owner/repo/issues/42')).toEqual({ owner: 'owner', repo: 'repo', number: 42, url: 'https://github.com/owner/repo/issues/42' });
  });
  it.each(['http://github.com/o/r/issues/1', 'https://github.com/o/r/pull/1', 'https://evil.com/o/r/issues/1', 'https://u:p@github.com/o/r/issues/1', 'https://github.com/o/r/issues/1?q=x', 'https://github.com/o/r/issues/1#x', 'https://github.com/o/r/issues/0', 'https://github.com/o/r/issues/9007199254740992', 'https://github.com/o/../r/issues/1', 'https://github.com/o/r/issues/01', 'https://github.com/o/r/issues/1/', 'https://github.com:443/o/r/issues/1'])('rejects unsafe or ambiguous URL %s', (url) => {
    expect(() => parseIssueUrl(url)).toThrow('Expected');
  });
  it('retrieves metadata and a full pinned commit through read-only calls', async () => {
    const calls: string[][] = [];
    const responses = [{ private: false, default_branch: 'main' }, { number: 42, title: 'Bug', body: 'Steps', labels: [{ name: 'bug' }], state: 'open' }, { sha }];
    const issue = await fetchIssue('https://github.com/owner/repo/issues/42', async (command, args) => { expect(command).toBe('gh'); calls.push(args); return success(responses.shift()); });
    expect(issue).toMatchObject({ commit: sha, defaultBranch: 'main', title: 'Bug', labels: ['bug'] });
    expect(calls).toHaveLength(3);
    expect(calls.every((args) => args.includes('GET'))).toBe(true);
  });
  it.each([
    [{ private: true, default_branch: 'main' }],
    [{ private: false, default_branch: 'main' }, { number: 42, title: 'PR', body: '', labels: [], state: 'open', pull_request: {} }],
    [{ private: false, default_branch: 'main' }, { number: 42, title: 'Bug', body: '', labels: [], state: 'open' }, { sha: 'main' }],
  ])('rejects private repositories, PRs and invalid commit metadata', async (...responses) => {
    const values = [...responses];
    await expect(fetchIssue('https://github.com/owner/repo/issues/42', async () => success(values.shift()))).rejects.toThrow();
  });
  it('rejects truncated API output', async () => {
    await expect(fetchIssue('https://github.com/owner/repo/issues/42', async () => ({ ...success({}), truncated: true }))).rejects.toThrow();
  });
  it('pins checkout and disables ambient git execution/configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge checkout '));
    const calls: string[][] = [];
    try {
      await checkoutIssue({ ...parseIssueUrl('https://github.com/owner/repo/issues/42'), title: 'Bug', body: '', labels: [], state: 'open', defaultBranch: 'main', commit: sha }, join(root, 'source'), async (command, args, options) => {
        expect(command).toBe('git');
        expect(options?.env?.GIT_CONFIG_NOSYSTEM).toBe('1');
        expect(options?.env?.GIT_TERMINAL_PROMPT).toBe('0');
        expect(options?.env?.GIT_CONFIG_GLOBAL).toMatch(/NUL|\/dev\/null/);
        calls.push(args);
        return success(args.includes('rev-parse') ? sha : '');
      });
      expect(calls.some((args) => args.includes('fetch') && args.includes(sha))).toBe(true);
      expect(calls.some((args) => args.includes('checkout') && args.includes('--detach') && args.includes(sha))).toBe(true);
      expect(calls.every((args) => args.includes('core.hooksPath=/dev/null'))).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each(['120000 blob aaaa\tlink', '160000 commit aaaa\tsubmodule', 'head-mismatch'])('rejects unsupported/inexact source %s', async (entry) => {
    const root = await mkdtemp(join(tmpdir(), 'forge checkout '));
    try {
      await expect(checkoutIssue({ ...parseIssueUrl('https://github.com/owner/repo/issues/42'), title: 'Bug', body: '', labels: [], state: 'open', defaultBranch: 'main', commit: sha }, join(root, 'source'), async (_command, args) => {
        if (args.includes('rev-parse')) return success(entry === 'head-mismatch' ? 'b'.repeat(40) : sha);
        return success(args.includes('ls-tree') ? entry : '');
      })).rejects.toThrow(/unsupported|does not match/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
