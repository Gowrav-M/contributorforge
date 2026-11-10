import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../types.js';
import { runProcess, type ProcessExecutor, type ProcessResult } from '../utils/process.js';

export interface RunnerResult {
  setup?: ProcessResult;
  reproduction?: ProcessResult;
  imageId?: string;
  dockerVersion?: string;
  platform?: string;
  error?: string;
  cleanupErrors: string[];
  environmentBlocked?: boolean;
  startedAt: string;
}

interface ContainerState { Running: boolean; OOMKilled: boolean; ExitCode: number; Error: string }
const proxyNames = ['HTTP_PROXY', 'HTTPS_PROXY', 'FTP_PROXY', 'NO_PROXY', 'ALL_PROXY'];
const infrastructureTimeout = 15_000;
function successful(result: ProcessResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.truncated && !result.error;
}
function detail(result: ProcessResult): string {
  return result.error ?? (result.timedOut ? 'command timed out' : result.output.trim().slice(0, 2048) || `exit ${result.exitCode}`);
}
function stateFrom(output: string): ContainerState {
  const state: unknown = JSON.parse(output);
  if (!state || typeof state !== 'object' || !('Running' in state) || typeof state.Running !== 'boolean'
    || !('OOMKilled' in state) || typeof state.OOMKilled !== 'boolean'
    || !('ExitCode' in state) || typeof state.ExitCode !== 'number'
    || !('Error' in state) || typeof state.Error !== 'string') throw new Error('Docker returned invalid container state');
  return state as ContainerState;
}

/** Never follows repository symlinks or copies local credentials into the sandbox. */
async function copySource(source: string, destination: string): Promise<void> {
  let files = 0;
  let bytes = 0;
  const visit = async (from: string, to: string): Promise<void> => {
    await mkdir(to, { recursive: true, mode: 0o777 });
    await chmod(to, 0o777);
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.contributorforge' || entry.name.startsWith('.env')) continue;
      const input = join(from, entry.name);
      const output = join(to, entry.name);
      const stat = await lstat(input);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsupported source entry: ${entry.name}; symlinks and special files are not copied`);
      if (++files > 10_000) throw new Error('Source exceeds 10,000-entry limit');
      if (stat.isDirectory()) await visit(input, output);
      else {
        bytes += stat.size;
        if (bytes > 256 * 1024 * 1024) throw new Error('Source exceeds 256 MiB limit');
        await copyFile(input, output);
        // Disposable files only: allow the non-root container UID to write on Linux.
        await chmod(output, 0o666 | (stat.mode & 0o111));
      }
    }
  };
  await visit(await realpath(source), destination);
}

/** Only trusted Docker infrastructure executes on the host. Repository commands
 * are argv passed to /bin/sh inside separately created, non-root containers. */
export async function runDocker(sourceDir: string, config: Config, execute: ProcessExecutor = runProcess): Promise<RunnerResult> {
  const result: RunnerResult = { startedAt: new Date().toISOString(), cleanupErrors: [] };
  let scratch: string | undefined;
  const containers = new Set<string>();
  const docker = (args: string[], timeoutMs = infrastructureTimeout): Promise<ProcessResult> => execute('docker', args, { timeoutMs });
  const blocked = (message: string): void => { result.environmentBlocked = true; result.error = message; };
  const removeContainer = async (name: string): Promise<boolean> => {
    try {
      const removed = await docker(['rm', '-f', '-v', name]);
      const alreadyGone = !removed.timedOut && !removed.truncated && !removed.error && /No such container/i.test(removed.output);
      if (!successful(removed) && !alreadyGone) {
        result.cleanupErrors.push(`Cannot remove container ${name}: ${detail(removed)}`);
        return false;
      }
      containers.delete(name);
      return true;
    } catch (error: unknown) {
      result.cleanupErrors.push(`Cannot remove container ${name}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  };
  try {
    if (process.env.DOCKER_HOST && !/^(unix|npipe):\/\//.test(process.env.DOCKER_HOST)) {
      blocked('Remote DOCKER_HOST is unsupported; select a local Docker engine.');
      return result;
    }
    const context = await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
    if (!successful(context)) {
      blocked(`Docker is unavailable: ${detail(context)}. Install/start Docker; host execution is never used.`);
      return result;
    }
    if (!/^(unix|npipe):\/\//.test(context.output.trim())) {
      blocked('Remote Docker contexts are unsupported; select a local Docker engine.');
      return result;
    }
    const version = await docker(['version', '--format', '{{.Server.Version}}|{{.Server.Os}}|{{.Server.Arch}}']);
    if (!successful(version)) {
      blocked(`Docker engine is unavailable: ${detail(version)}. Start Docker and retry.`);
      return result;
    }
    const [versionNumber, os, arch] = version.output.trim().split('|');
    result.dockerVersion = versionNumber;
    result.platform = `${os}/${arch}`;
    if (!versionNumber || os !== 'linux' || !arch) {
      blocked('A local Linux Docker engine is required.');
      return result;
    }
    const image = await docker(['image', 'inspect', '--format', '{{.Id}}', config.image]);
    if (!successful(image) || !/^sha256:[a-f0-9]{64}$/.test(image.output.trim())) {
      blocked(`Image unavailable. Review the configured image, then run: docker pull ${config.image}`);
      return result;
    }
    result.imageId = image.output.trim();
    scratch = await mkdtemp(join(tmpdir(), 'contributorforge-'));
    if (/[",\r\n]/.test(scratch)) throw new Error('Temporary directory contains unsupported mount characters; set TMPDIR/TEMP to a simple local path.');
    await copySource(sourceDir, scratch);
    const uid = process.getuid?.() || 1000;
    const gid = process.getgid?.() || 1000;
    const phase = async (label: 'setup' | 'reproduction', command: string, network: boolean): Promise<ProcessResult | undefined> => {
      const name = `contributorforge-${label}-${randomUUID()}`;
      containers.add(name);
      const args = ['create', '--name', name, '--pull=never', '--read-only', '--log-driver=none', '--cap-drop=ALL', '--security-opt=no-new-privileges',
        '--user', `${uid}:${gid}`, '--pids-limit=128', '--memory', `${config.memoryMb}m`, '--memory-swap', `${config.memoryMb}m`,
        '--cpus', String(config.cpus), network ? '--network=bridge' : '--network=none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
        '--no-healthcheck', '--init', '--entrypoint', '/bin/sh', '--workdir', '/workspace', '--mount', `type=bind,src=${scratch},dst=/workspace`,
        '--env', 'HOME=/tmp', '--env', 'CI=true', '--env', 'NPM_CONFIG_CACHE=/tmp/npm-cache'];
      for (const key of proxyNames.flatMap((key) => [key, key.toLowerCase()])) args.push('--env', `${key}=`);
      args.push(result.imageId!, '-c', command);
      const created = await docker(args);
      if (!successful(created)) {
        blocked(`Cannot create ${label} container: ${detail(created)}`);
        await removeContainer(name);
        return undefined;
      }
      const execution = await docker(['start', '--attach', name], config.timeoutSeconds * 1000);
      if (!execution.timedOut && !execution.error) {
        const inspected = await docker(['inspect', '--format', '{{json .State}}', name]);
        if (!successful(inspected)) blocked(`Cannot inspect ${label} container: ${detail(inspected)}`);
        else {
          const state = stateFrom(inspected.output);
          if (state.OOMKilled) blocked(`${label} exceeded the container memory limit.`);
          else if (state.Running || state.Error) blocked(`${label} container did not complete cleanly: ${state.Error || 'still running'}`);
          else if (state.ExitCode !== execution.exitCode) blocked(`${label} Docker client/container exit codes disagree.`);
        }
      }
      await removeContainer(name);
      return execution;
    };
    if (config.setup) {
      result.setup = await phase('setup', config.setup, config.setupNetwork);
      if (!result.setup || !successful(result.setup) || result.error || result.cleanupErrors.length) return result;
    }
    result.reproduction = await phase('reproduction', config.reproduction, config.reproductionNetwork);
  } catch (error: unknown) {
    result.error = error instanceof Error ? error.message : 'Unexpected Docker runner error';
  } finally {
    for (const name of containers) await removeContainer(name);
    if (scratch) {
      if (containers.size) {
        result.cleanupErrors.push(`Scratch retained at ${scratch}: container removal was not confirmed.`);
      } else {
        try { await rm(scratch, { recursive: true, force: true }); }
        catch (error: unknown) {
          result.cleanupErrors.push(`Cannot remove scratch ${scratch}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
    }
  }
  return result;
}
