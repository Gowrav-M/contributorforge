import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocker } from '../src/runner/docker.js';
import { parseConfig } from '../src/config/config.js';
import type { ProcessExecutor, ProcessResult } from '../src/utils/process.js';

const config = parseConfig({ version: 1, repository: 'owner/repo', issue: 1, approved: true, reproduction: 'node test.mjs', expectedFailure: 'ISSUE_1' });
const ok = (output = '', exitCode = 0): ProcessResult => ({ output, exitCode, timedOut: false, truncated: false, durationMs: 1 });
const imageId = `sha256:${'a'.repeat(64)}`;
const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function source(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'forge runner test '));
  dirs.push(dir);
  await writeFile(join(dir, 'test.mjs'), 'throw new Error("ISSUE_1");');
  return dir;
}
function executor(overrides: Partial<Record<string, ProcessResult>> = {}): { execute: ProcessExecutor; calls: string[][] } {
  const calls: string[][] = [];
  const execute: ProcessExecutor = async (_binary, args) => {
    calls.push(args);
    const verb = args[0] ?? '';
    if (overrides[verb]) return overrides[verb];
    if (verb === 'context') return ok('unix:///var/run/docker.sock');
    if (verb === 'version') return ok('29.0|linux|amd64');
    if (verb === 'image') return ok(imageId);
    if (verb === 'inspect') return ok(JSON.stringify({ Running: false, OOMKilled: false, ExitCode: 1, Error: '' }));
    if (verb === 'start') return ok('ISSUE_1', 1);
    return ok();
  };
  return { execute, calls };
}
describe('isolated Docker runner', () => {
  it('blocks missing Docker without host execution', async () => {
    const mock = executor({ context: { ...ok('', 1), error: 'spawn docker ENOENT' } });
    const result = await runDocker(await source(), config, mock.execute);
    expect(result.environmentBlocked).toBe(true);
    expect(result.reproduction).toBeUndefined();
    expect(mock.calls.some((args) => args[0] === 'create')).toBe(false);
  });
  it('blocks remote engines and missing images', async () => {
    const remote = executor({ context: ok('ssh://remote') });
    expect((await runDocker(await source(), config, remote.execute)).environmentBlocked).toBe(true);
    const missing = executor({ image: ok('No such image', 1) });
    expect((await runDocker(await source(), config, missing.execute)).error).toContain('docker pull');
    expect(missing.calls.some((args) => args[0] === 'pull')).toBe(false);
  });
  it('rejects remote DOCKER_HOST before contacting Docker', async () => {
    vi.stubEnv('DOCKER_HOST', 'tcp://example.com:2375');
    const mock = executor();
    expect((await runDocker(await source(), config, mock.execute)).environmentBlocked).toBe(true);
    expect(mock.calls).toHaveLength(0);
  });
  it('copies only safe source, applies isolation, captures evidence, and cleans scratch', async () => {
    const dir = await source();
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'nested', '.env.local'), 'SECRET=yes');
    await mkdir(join(dir, '.git'));
    await writeFile(join(dir, '.git', 'config'), 'credential');
    const mock = executor();
    let scratch = '';
    const execute: ProcessExecutor = async (binary, args, options) => {
      if (args[0] === 'create') {
        const mount = args[args.indexOf('--mount') + 1] ?? '';
        scratch = mount.replace('type=bind,src=', '').replace(',dst=/workspace', '');
        expect(scratch).not.toBe(dir);
        expect(await readFile(join(scratch, 'test.mjs'), 'utf8')).toContain('ISSUE_1');
        await expect(access(join(scratch, 'nested', '.env.local'))).rejects.toThrow();
        await expect(access(join(scratch, '.git'))).rejects.toThrow();
      }
      return mock.execute(binary, args, options);
    };
    const result = await runDocker(dir, config, execute);
    expect(result.reproduction?.exitCode).toBe(1);
    expect(result.imageId).toBe(imageId);
    expect(result.cleanupErrors).toEqual([]);
    const create = mock.calls.find((args) => args[0] === 'create') ?? [];
    for (const flag of ['--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--network=none', '--pull=never', '--no-healthcheck']) expect(create).toContain(flag);
    expect(create).toContain('HTTP_PROXY=');
    expect(create).toContain(imageId);
    expect(create.at(-1)).toBe(config.reproduction);
    expect(create[create.indexOf('--user') + 1]).not.toBe('0:0');
    await expect(access(scratch)).rejects.toThrow();
  });
  it('uses separate setup and reproduction containers with separate network consent', async () => {
    const mock = executor({ start: ok(), inspect: ok(JSON.stringify({ Running: false, OOMKilled: false, ExitCode: 0, Error: '' })) });
    const result = await runDocker(await source(), { ...config, setup: 'npm ci', setupNetwork: true }, mock.execute);
    expect(result.setup?.exitCode).toBe(0);
    const creates = mock.calls.filter((args) => args[0] === 'create');
    expect(creates).toHaveLength(2);
    expect(creates[0]).toContain('--network=bridge');
    expect(creates[1]).toContain('--network=none');
    expect(creates[0]?.[creates[0].indexOf('--name') + 1]).not.toBe(creates[1]?.[creates[1].indexOf('--name') + 1]);
    expect(mock.calls.findIndex((args) => args[0] === 'rm')).toBeLessThan(mock.calls.lastIndexOf(creates[1]!));
  });
  it('does not reproduce after setup failure', async () => {
    const mock = executor();
    const result = await runDocker(await source(), { ...config, setup: 'npm ci' }, mock.execute);
    expect(result.setup?.exitCode).toBe(1);
    expect(result.reproduction).toBeUndefined();
  });
  it('removes timed-out containers', async () => {
    const mock = executor({ start: { ...ok('ISSUE_1', 137), timedOut: true } });
    const result = await runDocker(await source(), config, mock.execute);
    expect(result.reproduction?.timedOut).toBe(true);
    expect(mock.calls.some((args) => args[0] === 'rm' && args[1] === '-f')).toBe(true);
  });
  it('blocks OOM and records cleanup failures', async () => {
    const mock = executor({ inspect: ok(JSON.stringify({ Running: false, OOMKilled: true, ExitCode: 137, Error: '' })), rm: ok('daemon unavailable', 1) });
    const result = await runDocker(await source(), config, mock.execute);
    expect(result.environmentBlocked).toBe(true);
    expect(result.error).toContain('memory');
    expect(result.cleanupErrors.length).toBeGreaterThan(0);
    const create = mock.calls.find((args) => args[0] === 'create')!;
    dirs.push(create[create.indexOf('--mount') + 1]!.replace('type=bind,src=', '').replace(',dst=/workspace', ''));
  });
  it('reports create failure as infrastructure failure', async () => {
    const mock = executor({ create: ok('invalid mount', 125) });
    const result = await runDocker(await source(), config, mock.execute);
    expect(result.environmentBlocked).toBe(true);
    expect(result.reproduction).toBeUndefined();
  });
  it('rejects symlinks before creating a container', async (context) => {
    const dir = await source();
    const target = await source();
    try { await symlink(target, join(dir, 'outside'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'EPERM') { context.skip('Host does not permit symlink creation'); return; }
      throw error;
    }
    const mock = executor();
    const result = await runDocker(dir, config, mock.execute);
    expect(result.error).toContain('symlinks');
    expect(mock.calls.some((args) => args[0] === 'create')).toBe(false);
  });
  it('does not continue after incomplete setup output', async () => {
    const mock = executor({ start: { ...ok(), truncated: true }, inspect: ok(JSON.stringify({ Running: false, OOMKilled: false, ExitCode: 0, Error: '' })) });
    const result = await runDocker(await source(), { ...config, setup: 'npm ci' }, mock.execute);
    expect(result.setup?.truncated).toBe(true);
    expect(result.reproduction).toBeUndefined();
  });
  it('reports container/client exit disagreement', async () => {
    const mock = executor({ inspect: ok(JSON.stringify({ Running: false, OOMKilled: false, ExitCode: 0, Error: '' })) });
    const result = await runDocker(await source(), config, mock.execute);
    expect(result.environmentBlocked).toBe(true);
    expect(result.error).toContain('disagree');
  });
});
