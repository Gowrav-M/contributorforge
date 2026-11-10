import { stat } from 'node:fs/promises';
import { loadConfig } from '../config/config.js';
import { runProcess, type ProcessExecutor, type ProcessResult } from '../utils/process.js';

type Level = 'PASS' | 'WARNING' | 'FAIL';
export interface Diagnostic { name: string; level: Level; message: string }
interface DoctorOptions {
  configPath: string;
  explicitConfig?: boolean;
  nodeVersion?: string;
  dockerHost?: string;
  execute?: ProcessExecutor;
}

const localEndpoint = /^(unix|npipe):\/\//;
const defaultImage = 'node:22-bookworm-slim';

function passed(result: ProcessResult): boolean {
  return result.exitCode === 0 && !result.error && !result.timedOut && !result.truncated;
}

export async function inspectSetup(options: DoctorOptions): Promise<Diagnostic[]> {
  const execute = options.execute ?? runProcess;
  const rows: Diagnostic[] = [];
  const add = (name: string, level: Level, message: string) => rows.push({ name, level, message });
  const probe = (command: string, ...args: string[]) =>
    execute(command, args, { timeoutMs: 8000, maxOutputBytes: 8192 });
  const node = options.nodeVersion ?? process.versions.node;
  const major = Number(node.split('.')[0]);
  if (Number.isInteger(major) && major >= 22) add('Node.js', 'PASS', `Node.js ${node} meets the package minimum.`);
  else add('Node.js', 'FAIL', 'Install Node.js 22 or newer.');

  const [git, github, docker] = await Promise.all([
    probe('git', '--version'), probe('gh', '--version'), probe('docker', '--version'),
  ]);
  add('Git', passed(git) ? 'PASS' : 'FAIL', passed(git) ? 'Available.' : 'Install Git and add it to PATH.');
  add('GitHub CLI', passed(github) ? 'PASS' : 'FAIL', passed(github) ? 'Available.' : 'Install GitHub CLI and add gh to PATH.');
  if (passed(github)) {
    const auth = await probe('gh', 'auth', 'status', '--hostname', 'github.com', '--active');
    add('GitHub authentication', passed(auth) ? 'PASS' : 'FAIL', passed(auth)
      ? 'Active github.com authentication verified.'
      : 'Check network access and run gh auth status --hostname github.com or gh auth login.');
  }

  let image = defaultImage;
  let usesDefault = true;
  try {
    const entry = await stat(options.configPath);
    if (!entry.isFile() || entry.size > 64 * 1024) throw new Error('Invalid config file.');
    const config = await loadConfig(options.configPath);
    image = config.image;
    usesDefault = false;
    add('Configuration', 'PASS', 'Schema and explicit local approval are present. Review commands and source yourself.');
    if (!config.expectedFailure || !config.comparisonCheck) {
      add('Comparison configuration', 'WARNING', 'For compare and compare-pr, configure expectedFailure and comparisonCheck.');
    }
    if (config.setupNetwork || config.reproductionNetwork) {
      add('Container network', 'WARNING', 'A phase opts into networking. Confirm the check needs it before running.');
    }
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    add('Configuration', missing && !options.explicitConfig ? 'WARNING' : 'FAIL', missing
      ? 'Run contributorforge init or pass --config with a reviewed local file.'
      : 'Check the YAML against the init template. Fill in the issue and reproduction command, review them, then set approved: true.');
  }

  if (!passed(docker)) {
    add('Docker CLI', 'FAIL', 'Install Docker Desktop or Docker Engine and add docker to PATH.');
    return rows;
  }
  add('Docker CLI', 'PASS', 'Available.');
  const host = options.dockerHost ?? process.env.DOCKER_HOST;
  if (host && !localEndpoint.test(host)) {
    add('Docker engine', 'FAIL', 'Remote DOCKER_HOST is unsupported. Select a local Linux Docker engine.');
    return rows;
  }
  const context = await probe('docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}');
  if (!passed(context) || !localEndpoint.test(context.output.trim())) {
    add('Docker engine', 'FAIL', 'Select a local Docker context with docker context use, then start the engine.');
    return rows;
  }
  const engine = await probe('docker', 'version', '--format', '{{.Server.Os}}');
  if (!passed(engine) || engine.output.trim() !== 'linux') {
    add('Docker engine', 'FAIL', 'Start the local engine and select Linux containers. Check docker version for details.');
    return rows;
  }
  add('Docker engine', 'PASS', 'Local Linux engine is responding.');
  const found = await probe('docker', 'image', 'inspect', '--format', '{{.Id}}', image);
  const label = usesDefault ? 'Default Docker image' : 'Configured Docker image';
  add(label, passed(found) ? 'PASS' : 'FAIL', passed(found)
    ? `${image} is present locally.`
    : `Review the image, then run docker pull ${image}.`);
  return rows;
}
