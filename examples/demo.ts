import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseConfig } from '../src/config/config.js';
import { gitEnvironment, type Issue } from '../src/github/github.js';
import { runDocker } from '../src/runner/docker.js';
import { writeBundle } from '../src/tasks/bundle.js';
import { runProcess } from '../src/utils/process.js';
import { classify } from '../src/verification/classify.js';

const config = parseConfig({
  version: 1, repository: 'contributorforge-fixture/parser', issue: 1, approved: true,
  reproduction: 'node regression.mjs', expectedFailure: 'ISSUE_1_TRAILING_COMMA',
  expectedBehavior: 'A trailing delimiter does not create an empty item.',
  acceptanceCriteria: ['The same regression check passes after the fix.'],
});
const root = process.cwd();
const source = await mkdtemp(join(tmpdir(), 'contributorforge-demo-'));
const git = async (...args: string[]) => {
  const result = await runProcess('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: source,
    env: {
      ...gitEnvironment(), GIT_AUTHOR_NAME: 'ContributorForge Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'ContributorForge Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  if (result.exitCode !== 0 || result.timedOut || result.truncated || result.error) throw new Error(result.error ?? result.output);
  return result.output.trim();
};
try {
  await git('init', '--initial-branch=main', '--template=');
  for (const variant of ['buggy', 'fixed'] as const) {
    for (const file of ['parser.mjs', 'regression.mjs']) {
      await copyFile(resolve('fixtures', variant, file), join(source, file));
    }
    await git('add', '--', 'parser.mjs', 'regression.mjs');
    await git('commit', '-m', variant);
    const commit = await git('rev-parse', 'HEAD');
    const issue: Issue = {
      owner: 'contributorforge-fixture', repo: 'parser', number: 1,
      url: 'https://github.com/contributorforge-fixture/parser/issues/1',
      title: 'Trailing delimiter creates an empty item',
      body: 'Local synthetic issue for the authored parser fixture. Input: alpha,beta,',
      state: 'open', labels: ['fixture'], defaultBranch: 'main', commit,
    };
    const run = await runDocker(source, config);
    const verification = classify(config, run);
    const path = await writeBundle(root, { issue, config, run, verification, fixture: true });
    console.log(`${variant}: ${verification.status} (exit ${run.reproduction?.exitCode ?? 'unavailable'})`);
    console.log(run.reproduction?.output.trim() || verification.reason);
    console.log(`Commit: ${commit}\nTask bundle: ${path}`);
    if (verification.status !== (variant === 'buggy' ? 'REPRODUCED' : 'NOT_REPRODUCED')) process.exitCode = 1;
  }
} finally {
  await rm(source, { recursive: true, force: true });
}
