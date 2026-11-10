import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Issue } from '../github/github.js';
import { repositoryName, validateComparisonShas } from '../github/github.js';
import { parsePullRequestUrl } from '../github/pull-request.js';
import { escapeHtml as e } from '../reports/html.js';
import { redact } from '../reports/redact.js';
import type { Config } from '../types.js';
import type { Comparison } from '../verification/compare.js';
import type { PullRequestEvidence } from '../verification/pr-comparison.js';
import { ensureDirectory, fence, taskId, writeBundle } from './bundle.js';

interface ComparisonInput {
  issue: Issue;
  base: string;
  head: string;
  config: Config;
  result: Comparison;
  fixture?: boolean;
  pullRequest?: PullRequestEvidence;
}

export async function writeComparison(root: string, raw: ComparisonInput): Promise<string> {
  validateComparisonShas(raw.base, raw.head);
  if (raw.pullRequest) {
    const { pinned } = raw.pullRequest;
    const ref = parsePullRequestUrl(pinned.url);
    if (ref.repository.toLowerCase() !== `${raw.issue.owner}/${raw.issue.repo}`.toLowerCase()
      || ref.repository.toLowerCase() !== pinned.base.repository.toLowerCase()
      || ref.number !== pinned.number || !repositoryName.test(pinned.head.repository)
      || pinned.base.sha !== raw.base || pinned.head.sha !== raw.head) {
      throw new Error('PR report identity does not match its pinned comparison.');
    }
  }
  const configurationHash = createHash('sha256').update(JSON.stringify(raw.config)).digest('hex');
  const identity = [taskId(raw.issue), raw.base, raw.head, configurationHash];
  if (raw.pullRequest) identity.push(raw.pullRequest.pinned.url, raw.pullRequest.pinned.head.repository);
  const id = createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24);
  const input = JSON.parse(JSON.stringify(raw, (_key, value: unknown) => typeof value === 'string' ? redact(value) : value)) as ComparisonInput;
  const { issue, config, result, fixture, pullRequest } = input;
  const status = pullRequest && pullRequest.freshness !== 'UNCHANGED' ? `PR_${pullRequest.freshness}` : result.status;
  const freshness = pullRequest
    ? `PR #${pullRequest.pinned.number} · ${pullRequest.pinned.merged ? 'merged' : pullRequest.pinned.state} · ${pullRequest.pinned.fork ? 'fork' : 'same repository'} · ${pullRequest.freshness}\nChecked at: ${pullRequest.checkedAt}\nObserved base: ${pullRequest.observed?.base.sha ?? 'Unavailable'}\nObserved head: ${pullRequest.observed?.head.sha ?? 'Unavailable'}\nPinned comparison result: ${result.status}\n${pullRequest.reason ?? ''}${pullRequest.checkoutCleanupError ? `\nCheckout cleanup failed: ${pullRequest.checkoutCleanupError}` : ''}`
    : '';
  const baseOutput = result.base.run.reproduction?.output;
  const headOutput = result.head.run.reproduction?.output;
  const logDifference = baseOutput === undefined || headOutput === undefined
    ? 'One or both reproduction logs are unavailable.'
    : baseOutput === headOutput ? 'Captured reproduction output is identical after redaction.' : 'Captured reproduction output differs after redaction.';
  const forge = join(resolve(root), '.contributorforge');
  const comparisons = join(forge, 'comparisons');
  await ensureDirectory(forge);
  await ensureDirectory(comparisons);
  const destination = await mkdtemp(join(comparisons, `${id}-`));
  const sides = ['base', 'head'] as const;
  const repository = (side: 'base' | 'head') => pullRequest?.pinned[side].repository ?? `${issue.owner}/${issue.repo}`;
  const commitUrl = (side: 'base' | 'head') => `https://github.com/${repository(side)}/commit/${input[side]}`;
  try {
    for (const side of sides) {
      await writeBundle(destination, { issue: { ...raw.issue, commit: raw[side] }, config: raw.config, ...raw.result[side], fixture, sourceRevision: raw.pullRequest?.pinned[side] }, side);
    }
    const recordedAt = new Date().toISOString();
    const data = { schemaVersion: 1, id, configurationHash, recordedAt, logDifference, ...input, status };
    const summary = sides.map((side) => {
      const run = result[side].run;
      return `## ${side === 'base' ? 'Base' : 'Head'}\n\n${repository(side)} · ${fixture ? input[side] : `[${input[side]}](${commitUrl(side)})`}\n\n${result[side].verification.status} · setup exit ${run.setup?.exitCode ?? 'unavailable'} · reproduction exit ${run.reproduction?.exitCode ?? 'unavailable'}\n\n[Task](${side}/TASK.md) · [Logs](${side}/logs.txt) · [Environment](${side}/environment.json)`;
    }).join('\n\n');
    const environment = result.environmentDifferences.join('\n') || 'No differences reported in the checked Docker metadata. Check whether both phases ran below.';
    const caveat = 'This comparison concerns the approved check only. Dependencies, external services, source behavior and test coverage can still differ. It does not establish general correctness, security or merge approval.';
    const check = JSON.stringify(result.checkEvidence ?? null, null, 2);
    const prMd = pullRequest ? `\n[Pull request](${pullRequest.pinned.url})\n\n${fence(freshness)}\n` : '';
    const md = `# Regression comparison\n\n${fixture ? 'Authored local fixture' : issue.url}\n${prMd}\n${status}\n\n${fence(result.reason)}\n\n${caveat}\n\n## Approved commands\n\n${fence(`Setup: ${config.setup ?? 'None'}\nReproduction: ${config.reproduction}`)}\n\n${summary}\n\n## Observed differences\n\n${logDifference}\n\n${fence(environment)}\n\n## Check identity\n\n${fence(check)}\n`;
    const panels = sides.map((side) => {
      const { run, verification } = result[side];
      const phase = (value: typeof run.setup) => value ? `exit ${value.exitCode ?? 'unknown'} · ${value.durationMs} ms` : 'unavailable';
      const sha = input[side];
      return `<section><h2>${side === 'base' ? 'Base' : 'Head'}</h2><p>${e(repository(side))}</p><p class="commit">${fixture ? e(sha) : `<a href="${e(commitUrl(side))}">${e(sha)}</a>`}</p>
        <p><strong>${e(verification.status)}</strong></p><p>${e(verification.reason)}</p>
        <dl><dt>Setup</dt><dd>${phase(run.setup)}</dd><dt>Reproduction</dt><dd>${phase(run.reproduction)}</dd>
        <dt>Started</dt><dd>${e(run.startedAt || 'Unavailable')}</dd><dt>Docker / platform</dt><dd>${e(run.dockerVersion ?? 'Unavailable')} / ${e(run.platform ?? 'Unavailable')}</dd>
        <dt>Image ID</dt><dd>${e(run.imageId ?? 'Unavailable')}</dd></dl>
        <p><a href="${side}/task.json">Evidence JSON</a> · <a href="${side}/environment.json">Environment</a> · <a href="${side}/logs.txt">Full logs</a></p>
        <details open><summary>Reproduction output</summary><pre>${e(run.reproduction?.output ?? 'Unavailable')}</pre></details></section>`;
    }).join('');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Regression comparison · ContributorForge</title><style>
:root { color-scheme: dark; --bg:#0a0a0a; --panel:#141414; --line:#383838; --text:#ededed; --muted:#b4b4b4; --accent:#94e4c1; --space:8px; --radius:6px; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font: 1rem/1.55 Geist,system-ui,sans-serif; overflow-wrap:anywhere; }
main { max-width:1120px; margin:auto; padding:32px 24px; animation:enter .3s cubic-bezier(.16,1,.3,1); }
header { border-bottom:1px solid var(--line); padding-bottom:24px; }
.kicker, dt { color:var(--muted); font: .8rem/1.5 'JetBrains Mono',monospace; text-transform:uppercase; letter-spacing:.08em; }
h1 { font-size:clamp(1.8rem,5vw,3rem); line-height:1.15; margin:8px 0 24px; }
.status { display:inline-block; color:var(--accent); padding:4px 8px; border:1px solid var(--line); border-radius:var(--radius); }
.grid { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; margin:24px 0; }
section { min-width:0; padding:16px; border:1px solid var(--line); border-radius:var(--radius); background:var(--panel); }
h2 { margin:0 0 8px; font-size:1.2rem; }
dd { margin:0 0 8px; }
pre, .commit { font-family:'JetBrains Mono',Consolas,monospace; font-size:.85rem; }
pre { white-space:pre-wrap; padding:12px; background:var(--bg); border:1px solid var(--line); max-height:32rem; overflow:auto; }
a { color:var(--accent); text-underline-offset:4px; } a:hover, summary:hover { color:white; }
a:focus-visible, summary:focus-visible { outline:2px solid var(--accent); outline-offset:4px; }
summary { cursor:pointer; }
@media (min-width:720px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@keyframes enter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion:reduce) { main { animation:none; } }
</style></head><body><main><header><p class="kicker">ContributorForge / ${fixture ? 'Local fixture' : `<a href="${e(issue.url)}">${e(issue.owner)}/${e(issue.repo)} #${issue.number}</a>`}</p>
<h1>${e(issue.title)}</h1><strong class="status">${e(status)}</strong><p>${e(result.reason)}</p><p>${caveat}</p>
${pullRequest ? `<p><a href="${e(pullRequest.pinned.url)}">Pull request #${pullRequest.pinned.number}</a></p><pre>${e(freshness)}</pre>` : ''}</header>
<div class="grid">${panels}</div><section><h2>Observed differences</h2><p>${logDifference}</p><pre>${e(environment)}</pre>
<h2>Approved commands</h2><pre>${e(`Setup: ${config.setup ?? 'None'}\nReproduction: ${config.reproduction}`)}</pre>
<h2>Check identity</h2><pre>${e(check)}</pre>
<p><a href="comparison.json">Comparison JSON</a> · <a href="COMPARISON.md">Markdown summary</a></p></section></main></body></html>`;
    for (const [file, content] of [['comparison.json', JSON.stringify(data, null, 2) + '\n'], ['COMPARISON.md', md], ['report.html', html]] as const) {
      await writeFile(join(destination, file), content, { flag: 'wx' });
    }
  } catch (error) {
    try { await rm(destination, { recursive: true, force: true }); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Comparison write and cleanup failed.'); }
    throw error;
  }
  return destination;
}
