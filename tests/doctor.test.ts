import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { inspectSetup } from '../src/cli/doctor.js';
import type { ProcessExecutor, ProcessResult } from '../src/utils/process.js';

function reply(output = '', exitCode = 0): ProcessResult {
  return { output, exitCode, timedOut: false, truncated: false, durationMs: 1 };
}

const local: ProcessExecutor = async (command, args) => {
  if (command === 'gh' && args[0] === 'auth') return reply('sensitive tool output');
  if (args[0] === 'context') return reply('unix:///var/run/docker.sock');
  if (args[0] === 'version') return reply('linux');
  return reply();
};

it('checks only infrastructure and the configured image, without executing commands or showing auth output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-doctor-'));
  try {
    const configPath = join(root, 'reviewed.yml');
    await writeFile(configPath, 'version: 1\nrepository: owner/repo\nissue: 1\napproved: true\nimage: node:24\nreproduction: never-run-me\nexpectedFailure: EXPECTED\ncomparisonCheck: { mode: inline }\n');
    const execute = vi.fn(local);
    const results = await inspectSetup({ configPath, execute, dockerHost: '', nodeVersion: '22.1.0' });
    expect(results.every(({ level }) => level === 'PASS')).toBe(true);
    expect(execute.mock.calls.map(([command, args]) => [command, ...args])).toEqual([
      ['git', '--version'], ['gh', '--version'], ['docker', '--version'],
      ['gh', 'auth', 'status', '--hostname', 'github.com', '--active'],
      ['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      ['docker', 'version', '--format', '{{.Server.Os}}'],
      ['docker', 'image', 'inspect', '--format', '{{.Id}}', 'node:24'],
    ]);
    expect(JSON.stringify(results)).not.toContain('sensitive tool output');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('warns for absent default config and fails for an explicitly selected missing config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-doctor-'));
  try {
    const configPath = join(root, 'missing.yml');
    for (const explicitConfig of [false, true]) {
      const rows = await inspectSetup({ configPath, explicitConfig, execute: local, dockerHost: '' });
      expect(rows).toContainEqual(expect.objectContaining({ name: 'Configuration', level: explicitConfig ? 'FAIL' : 'WARNING' }));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects unapproved configuration, older Node and a remote Docker host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-doctor-'));
  try {
    const configPath = join(root, 'unapproved.yml');
    await writeFile(configPath, 'version: 1\nrepository: owner/repo\nissue: 1\napproved: false\nreproduction: never-run-me\n');
    const execute = vi.fn(local);
    const rows = await inspectSetup({ configPath, execute, nodeVersion: '20.0.0', dockerHost: 'tcp://remote:2375' });
    for (const name of ['Node.js', 'Configuration', 'Docker engine']) {
      expect(rows).toContainEqual(expect.objectContaining({ name, level: 'FAIL' }));
    }
    expect(execute.mock.calls.filter(([command]) => command === 'docker')).toHaveLength(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each([
  ['gh', 'auth', 'GitHub authentication'],
  ['docker', '--version', 'Docker CLI'],
  ['docker', 'version', 'Docker engine'],
  ['docker', 'image', 'Default Docker image'],
] as const)('reports %s %s failures without leaking raw output', async (binary, arg, name) => {
  const root = await mkdtemp(join(tmpdir(), 'forge-doctor-'));
  try {
    const rows = await inspectSetup({ configPath: join(root, 'missing.yml'), dockerHost: '',
      execute: (command, args) => command === binary && args[0] === arg
        ? Promise.resolve(reply('raw diagnostic with token', 1))
        : local(command, args),
    });
    expect(rows).toContainEqual(expect.objectContaining({ name, level: 'FAIL' }));
    expect(JSON.stringify(rows)).not.toContain('raw diagnostic with token');
  } finally { await rm(root, { recursive: true, force: true }); }
});
