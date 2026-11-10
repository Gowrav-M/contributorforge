import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runProcess } from '../src/utils/process.js';

it('authored buggy and fixed parsers exercise exactly the same regression', async () => {
  const buggy = resolve('fixtures/buggy');
  const fixed = resolve('fixtures/fixed');
  expect(await readFile(resolve(buggy, 'regression.mjs'), 'utf8')).toBe(await readFile(resolve(fixed, 'regression.mjs'), 'utf8'));
  const before = await runProcess(process.execPath, ['regression.mjs'], { cwd: buggy });
  const after = await runProcess(process.execPath, ['regression.mjs'], { cwd: fixed });
  expect(before.exitCode).toBe(1);
  expect(before.output).toContain('ISSUE_1_TRAILING_COMMA');
  expect(after.exitCode).toBe(0);
  expect(after.output).toContain('PASS');
});
