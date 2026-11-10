import { describe, expect, it } from 'vitest';
import { runProcess } from '../src/utils/process.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('bounded subprocess capture', () => {
  it('captures real output and an exit code without shell interpolation', async () => {
    const result = await runProcess(process.execPath, ['-e', 'console.log(process.argv[1]);process.exit(3)', 'hello & echo unsafe']);
    expect(result.output).toContain('hello & echo unsafe');
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
  });
  it('bounds execution time', async () => {
    const result = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 });
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(5000);
  });
  it('bounds logs and marks truncation', async () => {
    const result = await runProcess(process.execPath, ['-e', 'console.log("a".repeat(100000))'], { maxOutputBytes: 100 });
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(100);
    expect(result.truncated).toBe(true);
  });
  it('reports executable failures', async () => {
    const result = await runProcess('contributorforge-does-not-exist', []);
    expect(result.error).toBeTruthy();
    expect(result.exitCode).toBeNull();
  });
  it('kills the process tree on timeout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge tree '));
    const pidPath = join(root, 'pid');
    let pid: number | undefined;
    try {
      const script = 'const {spawn}=require("node:child_process");const fs=require("node:fs");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});fs.writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},1000)';
      const result = await runProcess(process.execPath, ['-e', script, pidPath], { timeoutMs: 1000 });
      pid = Number(await readFile(pidPath, 'utf8'));
      expect(result.timedOut).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(() => process.kill(pid!, 0)).toThrow();
    } finally {
      if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* Process already gone. */ } }
      await rm(root, { recursive: true, force: true });
    }
  });
});
