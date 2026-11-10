import type { Config } from '../types.js';
import type { ProcessResult } from '../utils/process.js';

export interface Verification {
  status: 'REPRODUCED' | 'NOT_REPRODUCED' | 'NEEDS_REPRO_STEPS' | 'ENVIRONMENT_BLOCKED' | 'VERIFICATION_ERROR';
  reason: string;
}

interface Evidence {
  setup?: ProcessResult;
  reproduction?: ProcessResult;
  error?: string;
  environmentBlocked?: boolean;
  cleanupErrors: string[];
}

function incomplete(result: ProcessResult): boolean {
  return result.timedOut || result.truncated || Boolean(result.error) ||
    result.exitCode === null || result.exitCode >= 125;
}

export function classify(config: Config, evidence: Evidence): Verification {
  if (evidence.cleanupErrors.length) return { status: 'VERIFICATION_ERROR', reason: 'Sandbox cleanup failed.' };
  if (evidence.environmentBlocked) return { status: 'ENVIRONMENT_BLOCKED', reason: evidence.error ?? 'Docker is unavailable.' };
  if (evidence.error) return { status: 'VERIFICATION_ERROR', reason: evidence.error };
  if (config.setup && (!evidence.setup || incomplete(evidence.setup) || evidence.setup.exitCode !== 0)) {
    return { status: 'ENVIRONMENT_BLOCKED', reason: 'Setup did not complete successfully.' };
  }
  const reproduction = evidence.reproduction;
  if (!reproduction || incomplete(reproduction)) {
    return { status: 'VERIFICATION_ERROR', reason: 'Reproduction did not produce complete execution evidence.' };
  }
  if (reproduction.exitCode === 0) return { status: 'NOT_REPRODUCED', reason: 'The approved check passed.' };
  if (!config.expectedFailure) return { status: 'NEEDS_REPRO_STEPS', reason: 'Configure an issue-specific expected failure marker.' };
  if (reproduction.output.includes(config.expectedFailure)) {
    return { status: 'REPRODUCED', reason: 'The approved check failed with the expected marker.' };
  }
  return { status: 'VERIFICATION_ERROR', reason: 'The check failed without the expected marker.' };
}

export const exitCodes: Record<Verification['status'], number> = {
  REPRODUCED: 0,
  NOT_REPRODUCED: 1,
  NEEDS_REPRO_STEPS: 2,
  ENVIRONMENT_BLOCKED: 3,
  VERIFICATION_ERROR: 4,
};
