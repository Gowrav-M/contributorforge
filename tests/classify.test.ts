import { expect, it } from 'vitest';
import { classify } from '../src/verification/classify.js';
import { parseConfig } from '../src/config/config.js';
import type { ProcessResult } from '../src/utils/process.js';

const config = parseConfig({ version: 1, repository: 'demo/parser', issue: 1, approved: true, reproduction: 'node regression.mjs', expectedFailure: 'BUG_MARKER' });
const failed: ProcessResult = { exitCode: 1, output: 'BUG_MARKER', timedOut: false, truncated: false, durationMs: 20 };
it.each([
  [failed, 'REPRODUCED'],
  [{ ...failed, exitCode: 0 }, 'NOT_REPRODUCED'],
  [{ ...failed, timedOut: true }, 'VERIFICATION_ERROR'],
  [{ ...failed, truncated: true }, 'VERIFICATION_ERROR'],
  [{ ...failed, exitCode: 125 }, 'VERIFICATION_ERROR'],
  [{ ...failed, output: 'unexpected failure' }, 'VERIFICATION_ERROR'],
] as const)('classifies reproduction evidence %#', (reproduction, status) => {
  expect(classify(config, { reproduction, cleanupErrors: [] }).status).toBe(status);
});
it('never classifies failed setup or cleanup as reproduction', () => {
  expect(classify({ ...config, setup: 'npm ci' }, { setup: failed, reproduction: failed, cleanupErrors: [] }).status).toBe('ENVIRONMENT_BLOCKED');
  expect(classify(config, { reproduction: failed, cleanupErrors: ['remove failed'] }).status).toBe('VERIFICATION_ERROR');
  expect(classify(config, { cleanupErrors: [], environmentBlocked: true }).status).toBe('ENVIRONMENT_BLOCKED');
  expect(classify({ ...config, expectedFailure: undefined }, { reproduction: failed, cleanupErrors: [] }).status).toBe('NEEDS_REPRO_STEPS');
});
