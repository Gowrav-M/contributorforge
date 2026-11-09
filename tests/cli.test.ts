import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProgram, initializeConfig } from '../src/cli/program.js';

describe('CLI', () => {
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
