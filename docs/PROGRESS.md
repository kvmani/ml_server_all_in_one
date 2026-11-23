# Progress ledger

The resume point for all work in this repository (AGENTS.md, cardinal rule 3). Claim a task in
**Active** before coding, checkpoint in **Task log** after each meaningful step, and move the row
to **Done** with its commit when finished. Newest entries first; keep them short and factual.

## Active

| Task | Who | Started | Status | Next step |
| --- | --- | --- | --- | --- |

## Task log

<!-- Copy this block for each task:
### YYYY-MM-DD — <task>
- Goal:
- Plan (files, tests, docs):
- Done (commits):
- Tests run (command → result):
- Decisions / assumptions:
- Blockers / open questions:
- Next step:
-->

### 2026-11-23 — Legacy status and agent instructions (done)
- The repository is marked legacy: its tools live in dedicated repositories (`ml_server`,
  `pdf_tools`, `tabular_ml`, `scientific_calculator`, `unit_converter`, `pytex`,
  `HydrideSegmentation`) and the suite installer `ml_server_deploy`.
- AGENTS.md: legacy notice, the owner's cardinal rules and a targeted-test block were added above
  the original playbook, which is kept in place because the plugin specifications and
  `docs/DEVELOPER_GUIDE.md` cite it. Its branch/PR rules (§12), acceptance checklist (§11) and task
  template artifacts (§17) now say: work on `main`, targeted tests per change, full suite before a
  release.
- `plugins/crystallography_tools/agents.md` renamed to `AGENTS.md` (scoped plugin rules, content
  unchanged). Note: the implemented plugin lives in `plugins/crystallographic_tools/`.
- `backend.yml` and `playwright.yml` now run only by hand (they ran on push and pull requests).
- Added this ledger and `.gemini/settings.json`. Tests run: none needed (documentation and CI
  triggers only).

## Done

| Date | Task | Commit |
| --- | --- | --- |
| 2026-11-23 | Legacy status and agent instructions | see git log |
