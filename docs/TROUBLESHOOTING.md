# Troubleshooting

Run `contributorforge doctor` first. It checks prerequisites and local image
availability without running repository commands or changing machine state.
For a specific file, use `contributorforge doctor --config path/to/config.yml`.

| Symptom | Likely cause | Next step |
| --- | --- | --- |
| Default config warning | No `.contributorforge.yml` was supplied and none exists in the current directory. | Run `contributorforge init`, review the template, or pass the intended file with `--config`. |
| Explicit config missing or invalid | The given path cannot be read or YAML does not match the supported schema. | Check the path, YAML syntax, allowed keys, repository, issue, and command fields. |
| Config is not approved | `approved` is false or absent. | Review every command and field; change it to true locally only after approval. |
| Docker is unavailable or not a Linux engine | Docker Desktop may be stopped or selected for Windows containers. | Start Docker Desktop and switch to Linux containers, then rerun doctor. |
| Configured image is unavailable | Image has not been pulled locally. | Review the image and pull it explicitly with `docker pull <image>`. |
| `gh` authentication check fails | GitHub CLI is missing or is not authenticated. | Install `gh`, then complete `gh auth login` and rerun doctor. |
| `NEEDS_REPRO_STEPS` | No approved issue-specific config is available or the expected marker is missing. | Provide a reviewed command and a unique literal failure marker. |
| `NOT_REPRODUCED` | The approved command passed at the tested revision. | Check that the selected issue/revision is expected to reproduce and inspect the command and captured output. |
| `ENVIRONMENT_BLOCKED` | Docker or another required execution capability could not complete the run. | Inspect the task packet's environment details, resolve the local prerequisite, then retry. |
| `VERIFICATION_ERROR` | An unexpected execution or evidence problem occurred. | Inspect the task packet and logs; report a sanitized minimal reproduction. |
| `BASE_NOT_REPRODUCED` | The proposed baseline did not exhibit the configured failure. | Recheck the base SHA, command assumptions, ambient environment and marker. Do not interpret this as a successful fix. |
| `CHECK_MISMATCH` | Comparison check identity or issue binding could not be established. | Verify repository and issue binding; use identical check files or explicitly reviewed inline mode. |
| `EVIDENCE_INCOMPLETE` | One side lacks evidence required by comparison gates. | Inspect both sides for timeout, truncation, setup, cleanup or environment differences. |
| `PR_HEAD_CHANGED`, `PR_BASE_CHANGED`, or `PR_UNKNOWN` | The PR metadata changed or could not be confirmed across the run. | Review the pinned packet and rerun against the current PR only after confirming the intended revisions. |

Network access defaults to off independently for setup and reproduction. If
dependency installation needs network access, review the exact setup command
and enable only `setupNetwork`; do not enable reproduction networking by
default. The CLI never executes downloaded source on the host as a fallback.

Before sharing a task or comparison packet, inspect its JSON, Markdown, HTML
and captured logs. Redaction is best effort. See [SECURITY.md](../SECURITY.md)
for the execution boundary and artifact risks.
