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
  The LLM path now receives related skill excerpts and existing category inventory, which makes update-vs-create decisions much better grounded than plain summary-only prompts.

- `src/lib/executor.js`
  Generic safe-action executor. This keeps execution separate from planning so the planner can later become LLM-backed without rewriting file operations.
  Unlink-driven cleanup is now a bit smarter because empty category directories are pruned after link removal.
  Rebuild can also issue `remove_empty_category` actions for empty taxonomy shells that should disappear even without an unlink in the same run.

- `src/lib/run-artifacts.js`
  Responsible for all run outputs such as `TODO.md`, `review.md`, `summary.json`, and `run.json`.
  It now also appends `steps.jsonl` so each executed TODO item leaves behind a structured action trace.
  Those step traces now also roll up into `changes.md`, which is a much better handoff artifact for future commit and PR generation.
  The same trace now also feeds `commit-message.txt` and `pr-summary.md` drafts, so git-native execution has starter text available before we automate commits.
  Update runs also emit `decisions.md`, which is the easiest place to inspect planner rationales without digging through `run.json`.

- `src/lib/retrieval.js`
  Contains the current deterministic retrieval logic. This is the right place to later add category-level beam search and model-guided passage selection.
  It now also keeps actual linked category paths separate from traversal paths so retrieval debugging does not confuse navigation with taxonomy state.
  Subtree hint collection is now cached per traversal so category scoring does not repeatedly rescan the same subtrees within one ask run.

## Known Gaps

These are the highest-value missing pieces:

1. LLM integration
- an OpenAI-compatible model client now exists
- the LLM client now also supports local Ollama and local `llama.cpp` HTTP servers
- planner/review/answer synthesis can optionally use it
- category traversal can now use LLM-guided branch selection when an LLM provider is configured
- semantic execution is still mostly heuristic

2. Git-native execution workflow
- apply/rebuild do not yet create a branch per run
- TODO items are not committed one-by-one
- no PR/MR orchestration exists yet
- `steps.jsonl` now gives us a stable per-step execution journal that can later feed commit messages and PR summaries
- `changes.md` now gives us a human-readable run summary without needing to inspect raw JSON artifacts
- commit and PR draft text can now be derived directly from executed step logs even before real git orchestration lands

3. Tree-guided retrieval
- ask now traverses category nodes first and records traversal traces
- branch selection can now be model-guided through the pluggable selector path
- the branch selector is now isolated, so swapping heuristic selection for model-guided selection no longer requires rewriting traversal
- category scoring now uses a normalized blend of label match, subtree-hint match, and question-token coverage instead of raw overlap only
- heuristic planning now emits nested category paths such as `Retrieval/Traversal` and `Knowledge-Base/Taxonomy`, rather than only flat top-level buckets
- retrieval now enforces `max_total_nodes` as a real traversal budget and records truncation in ask run artifacts and status output
- ask history and status now surface subtree-hint cache hit/miss signals for traversal debugging

4. Better skill evolution
- updates currently append a new section
- there is no semantic rewrite, dedupe merge, or split behavior yet

5. Plan resumability
- `rrag resume <run_id>` now exists
- run manifests track planned/executing/executed/failed
- resume now reconstructs staged-to-skill mappings from previously completed `create_skill` and `update_skill` steps
- next improvement would be persisting even richer executor state for more complex multi-step runs

## Suggested Next Steps

### Near-Term

- Add a model abstraction layer for planner, reviewer, and ask synthesizer.
- Persist a dedicated `plan.json` artifact so plan data survives independent of markdown formatting.
- Add a repository status command to inspect skills, categories, active links, and archived items.
- Improve rebuild cleanup rules so ancestor fallback links can be removed when a deeper category path already exists for the same skill.
- Add a higher-level input sanity layer so suspicious free-text update inputs such as flag-like strings (`--aply`) trigger a clarification request instead of being blindly treated as knowledge content.

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
