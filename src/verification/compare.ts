import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, win32 } from 'node:path';
import type { Config } from '../types.js';
import { runDocker, type RunnerResult } from '../runner/docker.js';
import { classify, type Verification } from './classify.js';

export type ComparisonStatus = 'REGRESSION_CHECK_PASSED' | 'BUG_STILL_REPRODUCED' | 'BASE_NOT_REPRODUCED'
  | 'ENVIRONMENT_BLOCKED' | 'EVIDENCE_INCOMPLETE' | 'CHECK_MISMATCH' | 'VERIFICATION_ERROR';
export interface ComparisonSide { run: RunnerResult; verification: Verification }
export interface CheckFileEvidence { path: string; sha256: string }
export interface Comparison {
  base: ComparisonSide;
  head: ComparisonSide;
  status: ComparisonStatus;
  reason: string;
  environmentDifferences: string[];
  checkEvidence?: { mode: 'inline' | 'files'; files?: CheckFileEvidence[] };
}
export type ComparisonRunner = (sourceDir: string, config: Config) => Promise<RunnerResult>;

function snapshotConfig(config: Config): Config {
  const snapshot = structuredClone(config);
  Object.freeze(snapshot.acceptanceCriteria);
  if (snapshot.comparisonCheck) {
    if (snapshot.comparisonCheck.mode === 'files') Object.freeze(snapshot.comparisonCheck.paths);
    Object.freeze(snapshot.comparisonCheck);
  }
  return Object.freeze(snapshot);
}

function errorEvidence(message: string): RunnerResult {
  return { startedAt: new Date().toISOString(), cleanupErrors: [], error: message };
}

function side(config: Config, run: RunnerResult): ComparisonSide {
  return { run, verification: classify(config, run) };
}

/** File proof is deliberately limited to declared, regular source files. It is
 * not a proof that setup or imported dependencies preserve test semantics. */
async function hashChecks(source: string, paths: string[]): Promise<CheckFileEvidence[]> {
  if (!paths.length || paths.length > 32) throw new Error('Declare between 1 and 32 invariant check files.');
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Source root cannot be a symlink.');
  const root = await realpath(source);
  const hashes: CheckFileEvidence[] = [];
  for (const path of paths) {
    const parts = path.split(/[\\/]/);
    if (!path || path.includes('\0') || isAbsolute(path) || win32.isAbsolute(path) || path.includes(':')
      || parts.some((part) => !part || part === '.' || part === '..' || part === '.git' || part === 'node_modules'
        || part === '.contributorforge' || part.startsWith('.env'))) {
      throw new Error(`Check path is unsafe or excluded from the sandbox: ${path}`);
    }
    let candidate = root;
    for (let index = 0; index < parts.length; index++) {
      candidate = resolve(candidate, parts[index]!);
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) throw new Error(`Check path contains a symlink: ${path}`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`Check path parent is not a directory: ${path}`);
      if (index === parts.length - 1 && (!stat.isFile() || stat.size > 16 * 1024 * 1024)) {
        throw new Error(`Check must be a regular file no larger than 16 MiB: ${path}`);
      }
    }
    const actual = await realpath(candidate);
    const within = relative(root, actual);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error(`Check path escapes source: ${path}`);
    hashes.push({ path: parts.join('/'), sha256: createHash('sha256').update(await readFile(actual)).digest('hex') });
  }
  return hashes;
}

function equalChecks(base: CheckFileEvidence[], head: CheckFileEvidence[]): boolean {
  return base.length === head.length && base.every((check, index) => check.path === head[index]?.path && check.sha256 === head[index]?.sha256);
}

function incompleteReason(label: string, run: RunnerResult): string | undefined {
  if (run.cleanupErrors.length) return `${label} sandbox cleanup failed; evidence is incomplete.`;
  for (const [phase, evidence] of [['setup', run.setup], ['reproduction', run.reproduction]] as const) {
    if (evidence?.timedOut) return `${label} ${phase} timed out; no before/after conclusion is valid.`;
    if (evidence?.truncated) return `${label} ${phase} output was truncated; complete evidence is required.`;
    if (evidence && evidence.exitCode === null && !evidence.error) return `${label} ${phase} has no exit status.`;
  }
  return undefined;
}

/** Runs the same frozen, operator-approved check at both sources. Success means
 * only that this regression check changed from the expected failure to a pass. */
export async function compareSources(baseSource: string, headSource: string, config: Config, run: ComparisonRunner = runDocker): Promise<Comparison> {
  const approved = snapshotConfig(config);
  const placeholder = 'Comparison has not executed.';
  const comparison: Comparison = {
    base: side(approved, errorEvidence(placeholder)), head: side(approved, errorEvidence(placeholder)),
    status: 'VERIFICATION_ERROR', reason: placeholder, environmentDifferences: [],
  };
  const finish = (status: ComparisonStatus, reason: string): Comparison => {
    comparison.status = status;
    comparison.reason = reason;
    return comparison;
  };
  if (!approved.expectedFailure?.trim() || !approved.comparisonCheck) {
    return finish('CHECK_MISMATCH', 'An expected failure marker and explicit invariant comparisonCheck are required. No commands were run.');
  }
  let hashes: CheckFileEvidence[] | undefined;
  const check = approved.comparisonCheck;
  try {
    if (check.mode === 'files') {
      hashes = await hashChecks(baseSource, check.paths);
      const headHashes = await hashChecks(headSource, check.paths);
      if (!equalChecks(hashes, headHashes)) return finish('CHECK_MISMATCH', 'Declared regression check files differ between base and head. No commands were run.');
      comparison.checkEvidence = { mode: 'files', files: hashes };
    } else comparison.checkEvidence = { mode: 'inline' };
  } catch (error: unknown) {
    return finish('CHECK_MISMATCH', `Cannot establish identical check files: ${error instanceof Error ? error.message : 'unknown error'}. No commands were run.`);
  }
  const execute = async (source: string): Promise<RunnerResult> => {
    try { return await run(source, approved); }
    catch (error: unknown) { return errorEvidence(error instanceof Error ? error.message : 'Runner threw an unknown error'); }
  };
  comparison.base = side(approved, await execute(baseSource));
  if (hashes && check.mode === 'files') {
    try {
      if (!equalChecks(hashes, await hashChecks(baseSource, check.paths)) || !equalChecks(hashes, await hashChecks(headSource, check.paths))) {
        return finish('CHECK_MISMATCH', 'Declared regression checks changed during base execution; head was not run.');
      }
    } catch (error: unknown) {
      return finish('CHECK_MISMATCH', `Check file validation failed after base execution: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  comparison.head = side(approved, await execute(headSource));
  if (hashes && check.mode === 'files') {
    try {
      if (!equalChecks(hashes, await hashChecks(baseSource, check.paths)) || !equalChecks(hashes, await hashChecks(headSource, check.paths))) {
        return finish('CHECK_MISMATCH', 'Declared regression check files changed during comparison.');
      }
    } catch (error: unknown) {
      return finish('CHECK_MISMATCH', `Check file validation failed after head execution: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  const entries = [['Base', comparison.base], ['Head', comparison.head]] as const;
  for (const [label, evidence] of entries) {
    const reason = incompleteReason(label, evidence.run);
    if (reason) return finish('EVIDENCE_INCOMPLETE', reason);
  }
  for (const [label, evidence] of entries) {
    if (evidence.verification.status === 'ENVIRONMENT_BLOCKED') return finish('ENVIRONMENT_BLOCKED', `${label}: ${evidence.verification.reason}`);
    if (evidence.run.error || evidence.run.reproduction?.error || evidence.run.setup?.error) {
      return finish('VERIFICATION_ERROR', `${label}: ${evidence.run.error ?? evidence.run.reproduction?.error ?? evidence.run.setup?.error}`);
    }
    if ((evidence.run.reproduction?.exitCode ?? 0) >= 125) return finish('ENVIRONMENT_BLOCKED', `${label} runtime failed with an infrastructure or signal exit code.`);
    if (!evidence.run.reproduction) return finish('EVIDENCE_INCOMPLETE', `${label} has no reproduction execution evidence.`);
  }
  for (const key of ['imageId', 'dockerVersion', 'platform'] as const) {
    const base = comparison.base.run[key];
    const head = comparison.head.run[key];
    if (!base || !head) comparison.environmentDifferences.push(`${key}: missing ${!base ? 'base' : 'head'} provenance`);
    else if (base !== head) comparison.environmentDifferences.push(`${key}: base=${base}; head=${head}`);
  }
  if (entries.some(([, value]) => !value.run.imageId || !value.run.dockerVersion || !value.run.platform)) {
    return finish('EVIDENCE_INCOMPLETE', 'Both runs must record immutable image, Docker version, and platform.');
  }
  if (comparison.environmentDifferences.length) return finish('ENVIRONMENT_BLOCKED', 'Execution environments differ; a passing comparison cannot be established.');
  if (comparison.base.verification.status === 'NOT_REPRODUCED') return finish('BASE_NOT_REPRODUCED', 'The base check passed, so the reported failure was not established.');
  if (comparison.base.verification.status !== 'REPRODUCED') return finish('VERIFICATION_ERROR', `Base: ${comparison.base.verification.reason}`);
  if (comparison.head.verification.status === 'REPRODUCED') return finish('BUG_STILL_REPRODUCED', 'The same expected failure remains at the head source.');
  if (comparison.head.verification.status !== 'NOT_REPRODUCED') return finish('VERIFICATION_ERROR', `Head: ${comparison.head.verification.reason}`);
  return finish('REGRESSION_CHECK_PASSED', 'The invariant approved check reproduced the expected failure at base and passed at head under matching recorded environments. This does not prove every aspect of the bug is fixed.');
}
