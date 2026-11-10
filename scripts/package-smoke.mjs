import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'contributorforge package smoke-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, ...options });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  let npmEntry;
  if (process.platform === 'win32') {
    const wrappers = run('where.exe', ['npm.cmd'], { cwd: root }).trim().split(/\r?\n/);
    npmEntry = wrappers.map((wrapper) => join(dirname(wrapper), 'node_modules', 'npm', 'bin', 'npm-cli.js')).find(existsSync);
    assert.ok(npmEntry, 'Install npm with Node.js to run the package smoke test.');
  }
  const npm = (args, cwd) => npmEntry ? run(process.execPath, [npmEntry, ...args], { cwd }) : run('npm', args, { cwd });
  npm(['run', 'build'], root);
  const [pack] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root));
  assert.ok(pack?.filename, 'npm pack did not report a tarball');

  const allowed = new Set(['LICENSE', 'README.md', 'package.json']);
  for (const file of pack.files) {
    const name = file.path.replaceAll('\\', '/');
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), `Unsafe package path: ${name}`);
    assert.ok(
      allowed.has(name) || name.startsWith('dist/') || /^examples\/[^/]+\.yml$/.test(name),
      `Unexpected file in published package: ${name}`,
    );
    assert.ok(!/(^|\/)(\.env(?:\.|$)|\.contributorforge|node_modules|tests?|fixtures|scripts)(\/|$)/i.test(name), `Excluded file was packaged: ${name}`);
  }
  assert.ok(pack.files.some(({ path }) => path === 'dist/cli/index.js'), 'Built CLI is missing from package');
  const examples = ['chalk-issue-624-pr-688.yml', 'chalk-issue-639-pr-642.yml', 'decamelize-issue-21.yml', 'escape-string-regexp-issue-20.yml'];
  for (const example of examples) {
    assert.ok(pack.files.some(({ path }) => path === `examples/${example}`), `Curated example is missing: ${example}`);
  }

  const install = join(temp, 'install');
  const tarball = join(temp, pack.filename);
  await mkdir(install);
  await writeFile(join(install, 'package.json'), JSON.stringify({ name: 'forge-package-smoke', private: true }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], install);
  const installed = join(install, 'node_modules', 'contributorforge');
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.engines.node, '>=22');
  for (const dependency of ['commander', 'yaml', 'zod']) {
    assert.ok(manifest.dependencies[dependency], `Missing runtime dependency: ${dependency}`);
  }
  for (const example of examples) {
    assert.match(await readFile(join(installed, 'examples', example), 'utf8'), /^approved: false$/m);
  }
  const bin = join(install, 'node_modules', '.bin', process.platform === 'win32' ? 'contributorforge.cmd' : 'contributorforge');
  assert.ok(existsSync(bin), 'npm did not install the contributorforge executable');
  const cli = (args) => npm(['exec', '--offline', '--', 'contributorforge', ...args], install);
  assert.equal(cli(['--version']).trim(), pack.version);
  assert.match(cli(['--help']), /Usage: contributorforge/);
  for (const command of ['init', 'verify', 'start', 'compare', 'compare-pr', 'doctor']) {
    assert.match(cli([command, '--help']), new RegExp(`Usage: contributorforge ${command}`));
  }

  const configPath = join(install, '.contributorforge.yml');
  const init = cli(['init']);
  assert.match(init, /Created .*\.contributorforge\.yml/);
  assert.match(await readFile(configPath, 'utf8'), /approved: false/);
  console.log('Package smoke passed: allowlisted tarball, clean npm install, CLI help, and init.');

  if (process.argv.includes('--public-start')) {
    // Opt-in network check of a reviewed historical example. The setup marker
    // would reveal accidental host execution, but start must only prepare source.
    const issue = 'https://github.com/sindresorhus/escape-string-regexp/issues/20';
    const sha = '5085b257c801507460270b747f645276fbc1d937';
    const example = await readFile(join(installed, 'examples', 'escape-string-regexp-issue-20.yml'), 'utf8');
    const marker = 'unexpected-host-setup';
    await writeFile(join(install, 'reviewed.yml'), example.replace(/^approved: false$/m, 'approved: true')
      + `\nsetup: node -e 'require("node:fs").writeFileSync("${marker}","ran")'\n`);
    const output = cli(['start', issue, '--commit', sha, '--config', 'reviewed.yml']);
    const workspace = /^Workspace: (.+)$/m.exec(output)?.[1]?.trim();
    assert.ok(workspace, 'Missing workspace path');
    const parent = await realpath(join(install, '.contributorforge', 'workspaces'));
    const child = relative(parent, await realpath(workspace)).replaceAll('\\', '/');
    assert.match(child, /^sindresorhus-escape-string-regexp-20-[^/]+\/source$/);
    assert.equal(run('git', ['rev-parse', 'HEAD'], { cwd: workspace }).trim(), sha);
    assert.equal(run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspace }).trim(), 'HEAD');
    assert.ok(existsSync(join(workspace, 'index.js')), 'Pinned checkout has no source file');
    assert.match(output, new RegExp(`Commit: ${sha}`));
    assert.match(output, /Approved commands \(run in Docker\):/);
    assert.ok(output.includes(`verify ${issue} --commit ${sha}`));
    assert.ok(!existsSync(join(install, marker)) && !existsSync(join(workspace, marker)), 'Setup ran on the host');
    console.log(`Installed start passed: public issue #20, detached HEAD ${sha}, workspace and instructions verified; host setup marker absent.`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
