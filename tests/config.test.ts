import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, parseConfig } from '../src/config/config.js';

const valid = { version: 1, repository: 'owner/repo', issue: 42, approved: true, reproduction: 'node regression.mjs' };
describe('maintainer configuration', () => {
  it('applies conservative defaults', () => {
    expect(parseConfig(valid)).toMatchObject({ image: 'node:22-bookworm-slim', setupNetwork: false, reproductionNetwork: false, timeoutSeconds: 60 });
  });
  it.each([{}, { ...valid, approved: false }, { ...valid, issue: 0 }, { ...valid, repository: '../bad' }, { ...valid, reproduction: '' }, { ...valid, timeoutSeconds: 601 }, { ...valid, unknown: true }])('rejects invalid config %j', (input) => {
    expect(() => parseConfig(input)).toThrow();
  });
  it('loads YAML from a path with spaces and reports missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forge config '));
    try {
      const path = join(dir, 'config.yml');
      await expect(loadConfig(path)).rejects.toThrow('Cannot read configuration');
      await writeFile(path, 'version: 1\nrepository: owner/repo\nissue: 42\napproved: true\nreproduction: node regression.mjs\n');
      expect((await loadConfig(path)).issue).toBe(42);
      await writeFile(path, 'broken: [');
      await expect(loadConfig(path)).rejects.toThrow('Invalid YAML');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it.each(['--privileged', 'node:22 --privileged', '$(bad)', ''])('rejects unsafe image %s', (image) => {
    expect(() => parseConfig({ ...valid, image })).toThrow();
  });
  it('rejects empty markers and oversized commands', () => {
    expect(() => parseConfig({ ...valid, expectedFailure: ' ' })).toThrow();
    expect(() => parseConfig({ ...valid, reproduction: 'a'.repeat(8193) })).toThrow();
  });
});
