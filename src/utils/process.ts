import { spawn } from 'node:child_process';
import { join } from 'node:path';

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ProcessResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  error?: string;
}

export type ProcessExecutor = (command: string, args: string[], options?: ProcessOptions) => Promise<ProcessResult>;

/** Executes trusted infrastructure binaries, never repository commands on the host.
 * Killing the local tree does not stop a container; callers still own its cleanup.
 */
export const runProcess: ProcessExecutor = async (command, args, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const limit = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('Invalid process capture limits');
  }
  const started = Date.now();
  return new Promise<ProcessResult>((resolve) => {
    const buffers: Buffer[] = [];
    let captured = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let error: string | undefined;
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const append = (chunk: Buffer): void => {
      const available = Math.max(0, limit - captured);
      if (chunk.length > available) truncated = true;
      if (available) {
        const part = chunk.subarray(0, available);
        buffers.push(part);
        captured += part.length;
      }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      // Decode once so chunks split inside a multibyte character remain intact.
      let output = Buffer.concat(buffers).toString('utf8');
      while (Buffer.byteLength(output) > limit) output = output.slice(0, -1);
      resolve({ exitCode, output, timedOut, truncated, durationMs: Date.now() - started, ...(error ? { error } : {}) });
    };
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
        const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
        const killTimer = setTimeout(() => { killer.kill(); child.kill('SIGKILL'); }, 750);
        killer.once('close', (code) => {
          clearTimeout(killTimer);
          if (code !== 0) { error = `Process tree cleanup failed (taskkill exit ${code}); stopped direct child`; child.kill('SIGKILL'); }
        });
        killer.once('error', (cause) => { error = `Process tree cleanup failed: ${cause.message}`; child.kill('SIGKILL'); });
      } else if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (cause: unknown) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) error = 'Process group cleanup failed';
          child.kill('SIGKILL');
        }
      }
      // Descendants can retain inherited pipes. Bound capture even in that case.
      fallback = setTimeout(() => { child.kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); finish(null); }, 1000);
    }, timeoutMs);
    child.once('error', (cause) => { error = cause.message; finish(null); });
    child.once('close', (code) => finish(code));
  });
};
