import { z } from 'zod';
import type { Config } from '../types.js';
import { runProcess, type ProcessExecutor } from '../utils/process.js';
import { repositoryName, type SourceRevision } from './github.js';

export interface PullRequestRef { url: string; repository: string; number: number }
export interface PullRequest extends PullRequestRef {
  base: SourceRevision;
  head: SourceRevision;
  state: 'open' | 'closed';
  merged: boolean;
  fork: boolean;
}

export function parsePullRequestUrl(url: string): PullRequestRef {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/([1-9][0-9]*)$/.exec(url);
  const repository = match?.[1];
  const number = Number(match?.[2]);
  if (!repository || !repositoryName.test(repository) || !Number.isSafeInteger(number) || match?.[0] !== url) {
    throw new Error('Expected a canonical public GitHub pull request URL: https://github.com/owner/repository/pull/123');
  }
  return { url, repository, number };
}

export function assertPullRequestBinding(ref: PullRequestRef, config: Config): void {
  if (config.repository.toLowerCase() !== ref.repository.toLowerCase() || config.pullRequest !== ref.number || !config.approved) {
    throw new Error('Approved config must explicitly bind the repository, issue number, and pullRequest number.');
  }
}

const revision = z.object({
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  repo: z.object({ full_name: z.string().regex(repositoryName), private: z.literal(false), visibility: z.literal('public').optional() }).nullable(),
});
const payload = z.object({
  number: z.number().int().positive(),
  state: z.enum(['open', 'closed']),
  merged: z.boolean(),
  base: revision,
  head: revision,
});

export async function fetchPullRequest(url: string, execute: ProcessExecutor = runProcess): Promise<PullRequest> {
  const ref = parsePullRequestUrl(url);
  const response = await execute('gh', ['api', '--hostname', 'github.com', '--method', 'GET', `repos/${ref.repository}/pulls/${ref.number}`], {
    timeoutMs: 30_000, maxOutputBytes: 2 * 1024 * 1024,
  });
  if (response.exitCode !== 0 || response.error || response.timedOut || response.truncated) {
    throw new Error('Unable to read public pull request metadata. Check GitHub CLI authentication and repository access.');
  }
  let data: unknown;
  try { data = JSON.parse(response.output); }
  catch { throw new Error('GitHub returned malformed pull request metadata.'); }
  const parsed = payload.safeParse(data);
  if (!parsed.success) throw new Error('Pull request metadata is invalid or a source repository is not public.');
  const { base, head, state, merged, number } = parsed.data;
  if (!base.repo || base.repo.full_name.toLowerCase() !== ref.repository.toLowerCase() || number !== ref.number) {
    throw new Error('GitHub metadata does not match the requested base repository and pull request.');
  }
  if (!head.repo) throw new Error('Pull request head repository is deleted or inaccessible.');
  return {
    ...ref, state, merged,
    base: { repository: base.repo.full_name, sha: base.sha },
    head: { repository: head.repo.full_name, sha: head.sha },
    fork: head.repo.full_name.toLowerCase() !== base.repo.full_name.toLowerCase(),
  };
}
