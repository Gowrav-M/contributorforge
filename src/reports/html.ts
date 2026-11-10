export interface HtmlReport {
  title: string;
  repository: string;
  issueNumber: number;
  status: string;
  reason: string;
  commit: string;
  createdAt: string;
  command: string;
  expected: string;
  criteria: string[];
  logs: string;
  environment: string;
  fixture: boolean;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

/** Offline, inert report: no remote resources, executable markup or inline scripts. */
export function renderHtml(report: HtmlReport): string {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${e(report.title)} — ContributorForge</title>
<style>
:root{color-scheme:dark;--bg:#0a0a0a;--surface:#111;--elevated:#1a1a1a;--text:#ededed;--muted:#aaa;--line:#333;--accent:#94e4c1;--space:8px;--radius:4px;font-family:'JetBrains Mono','Cascadia Code',Consolas,monospace;font-size:14px}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);line-height:1.65}a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .15s,color .15s}a:hover{border-color:var(--accent)}a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:4px}a:active{color:var(--text)}header{border-bottom:1px solid var(--line);padding:24px 32px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}header strong{letter-spacing:-.04em}header span,.eyebrow,dt{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}main{max-width:1120px;margin:auto;padding:48px 24px;animation:enter .35s cubic-bezier(.16,1,.3,1)}.eyebrow{margin:0 0 16px}h1{font-family:'Geist','Segoe UI',sans-serif;font-size:clamp(1.8rem,4vw,3rem);font-weight:600;line-height:1.15;letter-spacing:-.04em;margin:0 0 24px;overflow-wrap:anywhere}h2{font-size:1rem;margin:0 0 16px}p{margin:0 0 16px}.status{display:inline-block;padding:8px 12px;border:1px solid var(--accent);border-radius:var(--radius);color:var(--accent);font-size:.8rem}.summary{padding-bottom:32px;border-bottom:1px solid var(--line)}.grid{display:grid;grid-template-columns:1fr;gap:32px;margin-top:32px}section{min-width:0}dl{margin:0;display:grid;gap:16px}dd{margin:4px 0 0;overflow-wrap:anywhere}pre{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px;overflow:auto;max-height:640px;font:inherit;font-size:.85rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 16px}ul{padding-left:24px}li{margin-bottom:8px}.evidence{margin-top:32px;padding-top:32px;border-top:1px solid var(--line)}.note{color:var(--muted);font-size:.85rem}.packet{display:flex;gap:16px;flex-wrap:wrap;margin-top:24px}summary{cursor:pointer;padding:12px 0;transition:color .15s}summary:hover,summary:active{color:var(--accent)}footer{max-width:1120px;margin:auto;padding:24px;border-top:1px solid var(--line);color:var(--muted);font-size:.75rem}@media(min-width:760px){.grid{grid-template-columns:2fr 1fr}main{padding:48px 32px}}@media(prefers-reduced-motion:reduce){main{animation:none}a,summary{transition:none}}@keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style></head><body>
<header><strong>ContributorForge <span>/ v0.2</span></strong><span>Local verification record</span></header>
<main><div class="summary"><p class="eyebrow">${e(report.repository)} · Issue #${report.issueNumber}${report.fixture ? ' · Authored local fixture' : ''}</p><h1>${e(report.title)}</h1><p><span class="status">${e(report.status)}</span></p><p>${e(report.reason)}</p><p class="note">Evidence of this approved check only. Reproduction does not establish that a bug is fixed.</p></div>
<div class="grid"><section><h2>Reproduction check</h2><pre>${e(report.command)}</pre><h2>Expected behavior · maintainer supplied</h2><p>${e(report.expected)}</p><h2>Acceptance criteria · maintainer supplied</h2><ul>${report.criteria.map((item) => `<li>${e(item)}</li>`).join('') || '<li>No acceptance criteria supplied.</li>'}</ul></section>
<section><h2>Source &amp; provenance</h2><dl><div><dt>Exact commit</dt><dd>${e(report.commit)}</dd></div><div><dt>Recorded at</dt><dd>${e(report.createdAt)}</dd></div><div><dt>Execution boundary</dt><dd>Docker only; no host reproduction commands.</dd></div></dl><nav class="packet" aria-label="Task packet"><a href="TASK.md">Task</a><a href="AGENT_TASK.md">Agent handoff</a><a href="task.json">JSON</a><a href="logs.txt">Logs</a></nav></section></div>
<section class="evidence"><h2>Captured execution evidence</h2><pre>${e(report.logs)}</pre><details><summary>Environment and phase metadata</summary><pre>${e(report.environment)}</pre></details></section>
</main><footer>Local-first · No telemetry · Redaction is best effort; review the packet before sharing.</footer></body></html>`;
}
