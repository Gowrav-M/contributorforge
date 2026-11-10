import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Config } from '../types.js';

const command = z.string().trim().min(1).max(8192).refine((value) => !value.includes('\0'), 'Command must not contain NUL');
export const configSchema = z.object({
  version: z.literal(1),
  repository: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/),
  issue: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  approved: z.literal(true),
  setup: command.optional(),
  reproduction: command,
  expectedFailure: z.string().trim().min(1).max(1024).optional(),
  comparisonCheck: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('inline') }).strict(),
    z.object({ mode: z.literal('files'), paths: z.array(z.string().min(1).max(512)).min(1).max(32) }).strict(),
  ]).optional(),
  image: z.string().max(256).regex(/^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)?(?:@sha256:[a-f0-9]{64})?$/).default('node:22-bookworm-slim'),
  setupNetwork: z.boolean().default(false),
  reproductionNetwork: z.boolean().default(false),
  timeoutSeconds: z.number().int().min(1).max(600).default(60),
  memoryMb: z.number().int().min(256).max(4096).default(512),
  cpus: z.number().min(0.25).max(4).default(1),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(2048)).max(100).default([]),
  expectedBehavior: z.string().trim().min(1).max(8192).optional(),
}).strict();

export function parseConfig(input: unknown): Config {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')}`);
  }
  return result.data;
}

export async function loadConfig(path: string): Promise<Config> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Cannot read configuration at ${path}. Run contributorforge init and approve issue-specific commands.`);
  }
  if (Buffer.byteLength(source) > 64 * 1024) throw new Error('Configuration exceeds 64 KiB limit');
  let input: unknown;
  try {
    input = parse(source, { maxAliasCount: 10, uniqueKeys: true });
  } catch {
    throw new Error(`Invalid YAML in ${path}`);
  }
  return parseConfig(input);
}

export const CONFIG_TEMPLATE = `# ContributorForge v1 configuration. Review every command before approval.
# Bind the check to one issue; a generic failing test suite is not proof.
version: 1
repository: owner/repository
issue: 1
approved: false
# setup: pnpm install --frozen-lockfile
reproduction: node regression.mjs
# Required to classify a failure as REPRODUCED: a literal issue-specific marker.
expectedFailure: ISSUE_1_REGRESSION
image: node:22-bookworm-slim
# Network access is separately approved for each phase.
setupNetwork: false
reproductionNetwork: false
timeoutSeconds: 60
memoryMb: 512
cpus: 1
expectedBehavior: Describe the intended behavior.
acceptanceCriteria:
  - The issue-specific regression test passes after the fix.
`;
