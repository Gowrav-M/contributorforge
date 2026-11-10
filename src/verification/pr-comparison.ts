import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutRevision, validateComparisonShas } from '../github/github.js';
import { assertPullRequestBinding, fetchPullRequest, parsePullRequestUrl, type PullRequest } from '../github/pull-request.js';
import type { Config } from '../types.js';
import { compareSources, type Comparison } from './compare.js';

export interface PullRequestEvidence {
  pinned: PullRequest;
  freshness: 'UNCHANGED' | 'HEAD_CHANGED' | 'BASE_CHANGED' | 'UNKNOWN';
  checkedAt: string;
  observed?: PullRequest;
  reason?: string;
  checkoutCleanupError?: string;
}

interface Dependencies {
  fetch?: typeof fetchPullRequest;
  checkout?: typeof checkoutRevision;
  compare?: typeof compareSources;
}

export async function comparePullRequest(url: string, config: Config, dependencies: Dependencies = {}) {
  assertPullRequestBinding(parsePullRequestUrl(url), config);
  const fetch = dependencies.fetch ?? fetchPullRequest;
  const checkout = dependencies.checkout ?? checkoutRevision;
  const compare = dependencies.compare ?? compareSources;
  const pinned = await fetch(url);
  validateComparisonShas(pinned.base.sha, pinned.head.sha);
  const temp = await mkdtemp(join(tmpdir(), 'contributorforge-pr-'));
  let completed: { result: Comparison; evidence: PullRequestEvidence } | undefined;
  let failure: unknown;
  try {
    const basePath = join(temp, 'base');
    const headPath = join(temp, 'head');
    await checkout(pinned.base, basePath);
    await checkout(pinned.head, headPath);
    const result = await compare(basePath, headPath, config);
    const evidence: PullRequestEvidence = { pinned, freshness: 'UNKNOWN', checkedAt: '' };
    try {
      const observed = await fetch(url);
      evidence.observed = observed;
      const same = (a: PullRequest['head'], b: PullRequest['head']) =>
        a.sha === b.sha && a.repository.toLowerCase() === b.repository.toLowerCase();
      evidence.freshness = !same(pinned.head, observed.head) ? 'HEAD_CHANGED'
        : !same(pinned.base, observed.base) ? 'BASE_CHANGED' : 'UNCHANGED';
    } catch (error) {
      evidence.reason = error instanceof Error ? error.message : 'Unable to recheck pull request revisions.';
    }
    evidence.checkedAt = new Date().toISOString();
    completed = { result, evidence };
  } catch (error) {
    failure = error;
  }
  try { await rm(temp, { recursive: true, force: true }); }
  catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown cleanup error.';
    if (!completed) {
      const primary = failure instanceof Error ? failure.message : 'PR comparison did not complete.';
      throw new AggregateError([failure, error], `${primary} Temporary checkout cleanup also failed: ${detail}`);
    }
    completed.evidence.checkoutCleanupError = detail;
    completed.result.status = 'EVIDENCE_INCOMPLETE';
    completed.result.reason = 'Failed to clean temporary PR checkouts.';
  }
  if (!completed) throw failure instanceof Error ? failure : new Error('PR comparison did not complete.', { cause: failure });
  return completed;
}
