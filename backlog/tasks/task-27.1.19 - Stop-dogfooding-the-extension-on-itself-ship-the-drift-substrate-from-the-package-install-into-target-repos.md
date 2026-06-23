---
id: TASK-27.1.19
title: >-
  Stop dogfooding the extension on itself: ship the drift substrate from the
  package, install into target repos
status: Done
assignee: []
created_date: "2026-06-23 10:44"
labels:
  - drift
  - dogfood
  - vscode
  - installer
dependencies: []
parent_task_id: TASK-27.1
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The repo conflated two roles: code-charter as PRODUCT SOURCE and code-charter as a repo UNDER ANALYSIS. The drift substrate (Stop hook + drift-reconciler sub-agent + drift-sync skill + /drift command) was committed into the repo-root .claude/ as installer OUTPUT, while its source of truth already lived in packages/drift/assets/. Three symptoms: (1) the committed copies had drifted from the assets they came from; (2) the Stop-hook command and the .drift_reconcile_bin sidecar used repo-relative paths that only resolve when the target repo IS code-charter; (3) the VS Code extension had no dependency on @code-charter/drift and never installed the substrate into the analyzed repo, so launching the debug host against another repo (bergamot) never wired drift there.

The fix makes packages/drift/assets/ (the prod package) the SOLE source of truth and removes drift from code-charter's own repo entirely — no Stop hook, and no committed drift-sync skill / drift-reconciler sub-agent / /drift command. code-charter is product source, not a repo under analysis, so it does not run drift on itself. Its .claude/settings.json is kept (emptied of the drift hook) as the home for non-drift settings. The substrate installs into EXTERNAL repos only: the installer writes ABSOLUTE bin paths (the bin lives in the installed drift package, outside the target repo) and the VS Code extension installs into the open workspace on diagram generation (guarding against installing onto code-charter itself), serving the dev (debug-launch into bergamot) and prod (.vsix) flows from one code path.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 code-charter does NOT run drift on itself: no drift Stop hook and no drift bundle (drift-sync skill, drift-reconciler sub-agent, /drift command) in its .claude/. The drift substrate's sole source of truth is packages/drift/assets/ (the prod package). .claude/settings.json is kept (now `{}` — the drift hook was its only content) as the home for non-drift settings. .gitignore stays narrow — only .claude/settings.local.json and .claude/worktrees/ are ignored
- [ ] #2 install_drift writes ABSOLUTE bin paths (Stop-hook command + .drift_reconcile_bin sidecar) into an EXTERNAL target repo, where the bin lives in the installed drift package outside that repo; the drift-sync skill resolves that absolute sidecar/env directly
- [ ] #3 The VS Code extension installs/refreshes the drift substrate into the open workspace on diagram generation, resolving the drift package via require.resolve, and refuses to install onto code-charter itself (self-dogfood guard)
- [ ] #4 The debug launch installs the substrate into the target repo (bergamot) via the "Install Drift Into Target Repo" preLaunchTask before the extension host starts
- [ ] #5 drift and vscode packages typecheck; installer + skill-contract test suites are green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Changes: install.ts (relative_bin removed; hook_command + sidecar write an ABSOLUTE path via bin_path; build_hook_specs drops the unused target_root param). drift_sync.js (resolves the absolute sidecar/env directly — no relative branch). extension.ts (+ensure_drift_installed: require.resolve("@code-charter/drift/package.json") -> install_drift into workspace_folders[0], guarded to skip when the workspace is the drift package`s own repo). packages/vscode/package.json (+@code-charter/drift dep). .vscode/tasks.json (+Install Drift Into Target Repo task, cwd=bergamot, dependsOn Build All Packages). .vscode/launch.json (preLaunchTask -> the install task). .gitignore narrow (only settings.local.json + worktrees/ ignored). Removed code-charter's own drift surface entirely: deleted the .claude/{agents,commands,skills} drift bundle and the drift Stop hook (.claude/settings.json emptied to {} and kept for non-drift settings); removed the working-tree .code-charter/ runtime dirs. install.test.ts asserts the installer's external output (sidecar + Stop command) is absolute.

<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

code-charter does not run drift on itself: the drift Stop hook and the drift-sync skill / drift-reconciler sub-agent / /drift command are removed from its .claude/, which now keeps only a (currently empty) settings.json for non-drift settings. The drift substrate lives solely in the prod package (packages/drift/assets/) and installs into EXTERNAL repos at runtime with absolute bin paths — by the VS Code extension (guarded against self-install) and the dev preLaunchTask (bergamot). End-to-end installer smoke test confirms an absolute Stop-hook command and sidecar land in an external target .claude/.

<!-- SECTION:FINAL_SUMMARY:END -->
