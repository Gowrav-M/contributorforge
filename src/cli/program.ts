import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';
import { CONFIG_TEMPLATE, loadConfig } from '../config/config.js';
import { checkoutIssue, fetchIssue, parseIssueUrl, type Issue } from '../github/github.js';
import { runDocker, type RunnerResult } from '../runner/docker.js';
import { writeBundle } from '../tasks/bundle.js';
import { classify, exitCodes, type Verification } from '../verification/classify.js';

interface Options { config: string; commit?: string }

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
  program.name('contributorforge').description('Turn a GitHub issue into a verified contributor task bundle.').version('0.1.0');
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
