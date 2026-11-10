import { mkdir, lstat } from 'node:fs/promises';
import { z } from 'zod';
import { runProcess, type ProcessExecutor } from '../utils/process.js';

export interface IssueRef { owner: string; repo: string; number: number; url: string }
export interface Issue extends IssueRef {
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
  defaultBranch: string;
  commit: string;
}

export function parseIssueUrl(input: string): IssueRef {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_][A-Za-z0-9_.-]{0,99})\/issues\/([1-9][0-9]*)$/.exec(input);
  const number = Number(match?.[3]);
  if (!match?.[1] || !match[2] || !Number.isSafeInteger(number) || number < 1) {
    throw new Error('Expected a public issue URL: https://github.com/owner/repository/issues/123 (no query or fragment).');
  }
  return { owner: match[1], repo: match[2], number, url: input };
}

const repositorySchema = z.object({ private: z.literal(false), default_branch: z.string().min(1).max(255) });
const issueSchema = z.object({ number: z.number().int().positive(), title: z.string().max(4096), body: z.string().max(1024 * 1024).nullable(), labels: z.array(z.object({ name: z.string() })), state: z.enum(['open', 'closed']), pull_request: z.unknown().optional() });
const commitSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) });

export async function fetchIssue(url: string, execute: ProcessExecutor = runProcess): Promise<Issue> {
  const ref = parseIssueUrl(url);
  const endpoint = `repos/${ref.owner}/${ref.repo}`;
  const get = async (path: string): Promise<unknown> => {
    const result = await execute('gh', ['api', '--hostname', 'github.com', '--method', 'GET', path], { timeoutMs: 30_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (result.exitCode !== 0 || result.timedOut || result.truncated || result.error) {
      throw new Error(`GitHub read failed for ${path}. Check gh auth status and network access. ${result.error ?? result.output}`);
    }
    try { return JSON.parse(result.output) as unknown; } catch { throw new Error(`GitHub returned malformed JSON for ${path}`); }
  };
  const repository = repositorySchema.safeParse(await get(endpoint));
  if (!repository.success) throw new Error('Only public repositories with a valid default branch are supported.');
  const details = issueSchema.safeParse(await get(`${endpoint}/issues/${ref.number}`));
  if (!details.success || details.data.number !== ref.number || details.data.pull_request !== undefined) {
    throw new Error('GitHub response is not the requested issue; pull requests are not supported.');
  }
  const commit = commitSchema.safeParse(await get(`${endpoint}/commits/${encodeURIComponent(repository.data.default_branch)}`));
  if (!commit.success) throw new Error('GitHub did not return a complete commit SHA.');
  return { ...ref, title: details.data.title, body: details.data.body ?? '', labels: details.data.labels.map((label) => label.name), state: details.data.state, defaultBranch: repository.data.default_branch, commit: commit.data.sha };
}

/** No ambient Git configuration, credentials, hooks, prompts, submodules or filters. */
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_LFS_SKIP_SMUDGE: '1' };
}

export async function checkoutIssue(issue: Issue, destination: string, execute: ProcessExecutor = runProcess): Promise<void> {
  const checked = parseIssueUrl(issue.url);
  if (checked.owner !== issue.owner || checked.repo !== issue.repo || checked.number !== issue.number || !/^[a-f0-9]{40}$/.test(issue.commit)) throw new Error('Invalid pinned issue source.');
  try {
    await lstat(destination);
    throw new Error(`Checkout destination already exists: ${destination}`);
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await mkdir(destination, { recursive: true });
  const base = ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-c', 'core.attributesFile=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.symlinks=false', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always'];
  const git = async (args: string[]): Promise<string> => {
    const result = await execute('git', [...base, ...args], { cwd: destination, env: gitEnvironment(), timeoutMs: 120_000, maxOutputBytes: 1024 * 1024 });
    if (result.exitCode !== 0 || result.timedOut || result.truncated || result.error) throw new Error(`Pinned checkout failed: ${result.error ?? result.output}`);
    return result.output.trim();
  };
  await git(['init', '--template=']);
  await git(['fetch', '--depth=1', '--no-tags', '--no-recurse-submodules', `https://github.com/${issue.owner}/${issue.repo}.git`, issue.commit]);
  await git(['checkout', '--detach', issue.commit]);
  if (await git(['rev-parse', 'HEAD']) !== issue.commit) throw new Error('Checkout HEAD does not match the requested commit.');
  const tree = await git(['ls-tree', '-r', 'HEAD']);
  if (/^(120000|160000) /m.test(tree)) {
    throw new Error('Symlinks and submodules are unsupported in v0.1; refusing an incomplete or altered reproduction source.');
  }
}
