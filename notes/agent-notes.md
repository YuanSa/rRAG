# Agent Notes

## Current State

The repository now has a runnable local prototype with these properties:

- `staging/` is the controlled input workspace.
- `update --apply` scans all staged text files, builds a heuristic plan, executes safe actions, writes run artifacts, and archives the consumed staging snapshot.
- `ask` retrieves by skill summary first, then extracts relevant passages from matching skill content.
- `rebuild` can generate a heuristic maintenance plan and execute conservative actions such as `unlink_skill`.
- `delete` performs soft deletion by removing active links and moving the skill into `archive/skills/`.

## Why The Current Architecture Looks Like This

The implementation is intentionally split into small layers:

- `src/lib/planner.js`
  Heuristic stand-in for the future LLM planner. It decides whether staged material should create a new skill or update an existing one, and which categories to attach.

- `src/lib/executor.js`
  Generic safe-action executor. This keeps execution separate from planning so the planner can later become LLM-backed without rewriting file operations.

- `src/lib/run-artifacts.js`
  Responsible for all run outputs such as `TODO.md`, `review.md`, `summary.json`, and `run.json`.

- `src/lib/retrieval.js`
  Contains the current deterministic retrieval logic. This is the right place to later add category-level beam search and model-guided passage selection.

## Known Gaps

These are the highest-value missing pieces:

1. LLM integration
- no actual model client exists yet
- planner, review, and ask synthesis are still heuristic

2. Git-native execution workflow
- apply/rebuild do not yet create a branch per run
- TODO items are not committed one-by-one
- no PR/MR orchestration exists yet

3. Tree-guided retrieval
- ask currently ranks by summary/category token overlap
- it does not yet do true category-by-category reasoning or branching

4. Better skill evolution
- updates currently append a new section
- there is no semantic rewrite, dedupe merge, or split behavior yet

5. Plan resumability
- the run manifest stores the plan, but there is no command yet to resume a partially executed run

## Suggested Next Steps

### Near-Term

- Add a model abstraction layer for planner, reviewer, and ask synthesizer.
- Persist a dedicated `plan.json` artifact so plan data survives independent of markdown formatting.
- Add a repository status command to inspect skills, categories, active links, and archived items.
- Improve category inference to use nested category paths rather than only top-level buckets.

### Medium-Term

- Create a branch per run.
- Commit one change per completed TODO item.
- Generate a PR summary from run artifacts.
- Add a rebuild execution policy that can safely archive obviously duplicated skills.

### Longer-Term

- Replace heuristic retrieval with model-guided category traversal.
- Add passage-grounded answer synthesis rather than simple retrieval display.
- Add configurable model backends and prompt templates.

## Practical Reminder

When touching the planning/execution flow, prefer to keep the separation:

- planner decides
- executor mutates
- run artifacts explain

That separation is the main thing making the current prototype easy to evolve.
