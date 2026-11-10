import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProgram, initializeConfig } from '../src/cli/program.js';
import { runProcess } from '../src/utils/process.js';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

describe('CLI', () => {
  it('reports mismatched approval before contacting GitHub or Docker', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'forge verify '));
    try {
      await writeFile(join(cwd, '.contributorforge.yml'), 'version: 1\nrepository: owner/repo\nissue: 2\napproved: true\nreproduction: node check.mjs\n');
      const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
      const cli = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
      const result = await runProcess(process.execPath, ['--import', tsx, cli, 'verify', 'https://github.com/owner/repo/issues/1'], { cwd });
      expect(result.exitCode, result.output).toBe(2);
      expect(result.output).toContain('NEEDS_REPRO_STEPS');
      const tasks = join(cwd, '.contributorforge', 'tasks');
      const [id] = await readdir(tasks);
      expect(id).toBeTruthy();
      const report = JSON.parse(await readFile(join(tasks, id!, 'task.json'), 'utf8')) as { execution: unknown };
      expect(report.execution).toBeNull();
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
  it('documents all three commands', () => {
    const help = createProgram().helpInformation();
    for (const command of ['init', 'verify', 'start']) expect(help).toContain(command);
  });
  it('creates an unapproved template without overwriting files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forge init '));
    try {
      const path = join(dir, '.contributorforge.yml');
      await initializeConfig(path);
      expect(await readFile(path, 'utf8')).toContain('approved: false');
      await expect(initializeConfig(path)).rejects.toThrow('already exists');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
