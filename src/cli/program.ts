import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';
import { CONFIG_TEMPLATE, loadConfig } from '../config/config.js';
import { checkoutIssue, confirmRepositoryRevision, fetchIssue, parseIssueUrl, validateComparisonShas, type Issue } from '../github/github.js';
import { runDocker, type RunnerResult } from '../runner/docker.js';
import { writeBundle } from '../tasks/bundle.js';
import { classify, exitCodes, type Verification } from '../verification/classify.js';
import { compareSources, type ComparisonStatus } from '../verification/compare.js';
import { writeComparison } from '../tasks/comparison.js';
import { redact } from '../reports/redact.js';
import { assertPullRequestBinding, parsePullRequestUrl } from '../github/pull-request.js';
import { comparePullRequest } from '../verification/pr-comparison.js';
import { inspectSetup } from './doctor.js';

interface Options { config: string; commit?: string }

const comparisonExits: Record<ComparisonStatus, number> = {
  REGRESSION_CHECK_PASSED: 0, BUG_STILL_REPRODUCED: 1, BASE_NOT_REPRODUCED: 1,
  CHECK_MISMATCH: 2, ENVIRONMENT_BLOCKED: 3, EVIDENCE_INCOMPLETE: 4, VERIFICATION_ERROR: 4,
};

async function handleComparePr(url: string, options: { config: string }): Promise<void> {
  let config: Awaited<ReturnType<typeof loadConfig>>;
  let ref: ReturnType<typeof parsePullRequestUrl>;
  try {
    ref = parsePullRequestUrl(url);
    config = await loadConfig(resolve(options.config));
    assertPullRequestBinding(ref, config);
  } catch (error) {
    console.error(`CHECK_MISMATCH — ${redact(error instanceof Error ? error.message : 'Invalid pull request comparison input.')}`);
    process.exitCode = 2;
    return;
  }
  try {
    const issue = await fetchIssue(`https://github.com/${ref.repository}/issues/${config.issue}`);
    console.error('Resolving pinned PR revisions and running the approved Docker comparison…');
    const { evidence, result } = await comparePullRequest(url, config);
    const { base, head } = evidence.pinned;
    const path = await writeComparison(process.cwd(), { issue, config, result, base: base.sha, head: head.sha, pullRequest: evidence });
    const current = evidence.freshness === 'UNCHANGED';
    console.log(`${current ? result.status : `PR_${evidence.freshness}`}\nComparison: ${path}`);
    process.exitCode = current ? comparisonExits[result.status] : 4;
  } catch (error) {
    console.error(`VERIFICATION_ERROR — ${redact(error instanceof Error ? error.message : 'Unable to compare pull request.')}`);
    process.exitCode = 4;
  }
}

async function handleCompare(url: string, options: { config: string; base: string; head: string }): Promise<void> {
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    const ref = parseIssueUrl(url);
    validateComparisonShas(options.base, options.head);
    config = await loadConfig(resolve(options.config));
    if (config.repository.toLowerCase() !== `${ref.owner}/${ref.repo}`.toLowerCase() || config.issue !== ref.number) {
      throw new Error('Approved configuration must match the requested repository and issue.');
    }
  } catch (error) {
    console.error(`CHECK_MISMATCH — ${redact(error instanceof Error ? error.message : 'Invalid comparison input.')}`);
    process.exitCode = 2;
    return;
  }
  const issue = await fetchIssue(url);
  await confirmRepositoryRevision(issue, options.base);
  await confirmRepositoryRevision(issue, options.head);
  const temp = await mkdtemp(join(tmpdir(), 'contributorforge-compare-'));
  try {
    const baseSource = join(temp, 'base');
    const headSource = join(temp, 'head');
    console.error('Preparing separate pinned base and head checkouts…');
    await checkoutIssue({ ...issue, commit: options.base }, baseSource);
    await checkoutIssue({ ...issue, commit: options.head }, headSource);
    console.error('Evaluating the approved comparison in Docker…');
    const result = await compareSources(baseSource, headSource, config);
    const path = await writeComparison(process.cwd(), { issue, config, result, base: options.base, head: options.head });
    console.log(`${result.status}\nComparison: ${path}`);
    process.exitCode = comparisonExits[result.status];
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function directory(path: string): Promise<void> {
  try { await mkdir(path); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Unsafe directory: ${path}`);
}

async function handle(name: 'verify' | 'start', url: string, options: Options): Promise<void> {
  let ref: ReturnType<typeof parseIssueUrl>;
  try {
    ref = parseIssueUrl(url);
    if (options.commit && !/^[a-f0-9]{40}$/.test(options.commit)) throw new Error('Provide a full lowercase commit SHA.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid issue URL.');
    process.exitCode = 2;
    return;
  }
  const root = process.cwd();
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(resolve(options.config));
    if (config.repository.toLowerCase() !== `${ref.owner}/${ref.repo}`.toLowerCase() || config.issue !== ref.number) {
      throw new Error('Approved configuration must match the requested repository and issue.');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Configuration unavailable.';
    console.error(`NEEDS_REPRO_STEPS — ${reason}`);
    if (name === 'verify') console.log(await writeBundle(root, { issue: ref, verification: { status: 'NEEDS_REPRO_STEPS', reason } }));
    process.exitCode = 2;
    return;
  }
  console.error('Reading public issue metadata…');
  let issue: Issue | undefined;
  let run: RunnerResult | undefined;
  let verification: Verification;
  try {
    issue = await fetchIssue(url);
    if (options.commit) issue.commit = options.commit;
    console.error(`Checking out ${issue.commit}…`);
    if (name === 'start') {
      const forge = join(root, '.contributorforge');
      const workspaces = join(forge, 'workspaces');
      await directory(forge);
      await directory(workspaces);
      const workspace = await mkdtemp(join(workspaces, `${ref.owner}-${ref.repo}-${ref.number}-`));
      const source = join(workspace, 'source');
      try { await checkoutIssue(issue, source); }
      catch (error) { await rm(workspace, { recursive: true, force: true }); throw error; }
      console.log(`Workspace: ${source}\nCommit: ${issue.commit}\nApproved commands (run in Docker):`);
      if (config.setup) console.log(`Setup: ${JSON.stringify(config.setup)}`);
      console.log(`Reproduction: ${JSON.stringify(config.reproduction)}`);
      console.log(`Use contributorforge verify ${ref.url} --commit ${issue.commit} with your reviewed config.`);
      return;
    }
    const temp = await mkdtemp(join(tmpdir(), 'contributorforge-source-'));
    try {
      const source = join(temp, 'source');
      await checkoutIssue(issue, source);
      console.error('Running the approved check in Docker…');
      run = await runDocker(source, config);
      verification = classify(config, run);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  } catch (error) {
    verification = { status: 'VERIFICATION_ERROR', reason: error instanceof Error ? error.message : 'Unknown verification error.' };
    if (name === 'start') throw error;
  }
  const path = await writeBundle(root, { issue: issue ?? ref, config, run, verification });
  console.log(`${verification.status}\nTask bundle: ${path}`);
  process.exitCode = exitCodes[verification.status];
}

export async function initializeConfig(path: string): Promise<void> {
  try {
    await writeFile(path, CONFIG_TEMPLATE, { flag: 'wx' });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`Configuration already exists at ${path}; refusing to overwrite it.`);
    }
    throw error;
  }
}

export function createProgram(): Command {
  const program = new Command();
  program.name('contributorforge').description('Turn GitHub issues and pull requests into evidence-backed contributor tasks.').version('0.4.0');
  program.command('doctor')
    .description('Check local prerequisites, Docker image and configuration')
    .option('-c, --config <path>', 'Configuration path')
    .action(async (options: { config?: string }) => {
      const results = await inspectSetup({ configPath: resolve(options.config ?? '.contributorforge.yml'), explicitConfig: options.config !== undefined });
      for (const result of results) console.log(`${result.level} ${result.name} — ${result.message}`);
      process.exitCode = results.some((result) => result.level === 'FAIL') ? 1 : 0;
    });
  program.command('compare-pr <github-pr-url>')
    .description('Compare pinned public GitHub PR revisions with an approved issue check')
    .requiredOption('-c, --config <path>', 'Locally approved issue and pull request configuration')
    .action(handleComparePr);
  program.command('compare <issue-url>')
    .description('Compare the same approved regression check at two pinned commits')
    .requiredOption('--base <sha>', 'Full base commit SHA')
    .requiredOption('--head <sha>', 'Full head commit SHA')
    .option('-c, --config <path>', 'Locally approved configuration', '.contributorforge.yml')
    .action(handleCompare);
  program.command('init').description('Create a documented, unapproved configuration template')
    .option('-c, --config <path>', 'Configuration path', '.contributorforge.yml')
    .action(async (options: { config: string }) => {
      const path = resolve(options.config);
      await initializeConfig(path);
      console.log(`Created ${path}. Review commands, bind the issue, then set approved: true.`);
    });
  for (const name of ['verify', 'start'] as const) {
    program.command(`${name} <issue-url>`)
      .description(name === 'verify' ? 'Verify an issue inside Docker and generate evidence' : 'Prepare a contributor workspace without running repository commands')
      .option('-c, --config <path>', 'Maintainer-approved configuration', '.contributorforge.yml')
      .option('--commit <sha>', 'Use an exact source commit instead of the current default branch')
      .action((url: string, options: Options) => handle(name, url, options));
  }
  return program;
}
