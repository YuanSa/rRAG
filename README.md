# rrag

`rrag` is a local CLI prototype for a filesystem-based, LLM-driven hierarchical knowledge system.

The current codebase provides:

- repository bootstrap for `skills/`, `categories/`, `staging/`, `archive/`, and `runs/`
- a runnable `rrag` CLI
- staging ingestion via text or copied files
- deterministic `update --apply`, `ask`, and `rebuild` starter flows
- run artifact generation for TODO/review/summary files
- run manifests with git environment metadata and parseable TODO items
- ask runs persisted with `answer.md`, `run.json`, and `summary.json`
- heuristic ask retrieval over skill summaries plus passage extraction
- heuristic category-guided traversal before skill passage extraction
- heuristic update planning that can create or update skills and add category links
- soft-delete via archiving skills out of the active knowledge base
- optional OpenAI-compatible LLM integration for planning, review, and grounded answer synthesis
- taxonomy-aware status reporting with depth, leaf-category, and redundant-link signals

## Quick Start

```bash
node ./bin/rrag.js --help
node ./bin/rrag.js update "A note to learn later"
node ./bin/rrag.js update --file ./some-docs
node ./bin/rrag.js update --apply
node ./bin/rrag.js ask "What does the repo know?"
node ./bin/rrag.js rebuild --dry-run
node ./bin/rrag.js resume 2026-03-30T16-22-24.637Z
node ./bin/rrag.js runs
node ./bin/rrag.js status
```

## Optional LLM Mode

The prototype now supports an optional OpenAI-compatible chat endpoint.

Example:

```bash
export OPENAI_API_KEY=...
node ./bin/rrag.js config set llm_enabled true
node ./bin/rrag.js config set llm_model gpt-4.1-mini
node ./bin/rrag.js update --apply
```

Relevant config keys:

- `llm_enabled`
- `llm_provider`
- `llm_base_url`
- `llm_model`
- `llm_api_key_env`
- `branch_max_per_level`
- `branch_min_score`
- `branch_score_margin`

If the model is disabled or the request fails, the code falls back to deterministic heuristic behavior.

## Current Status

This is an executable scaffold, not the final system.

Implemented today:

- directory bootstrap
- config loading and writing
- staging text ingestion
- filtered file copying into staging
- run artifact generation
- structured `plan.json` artifacts alongside human-readable `TODO.md`
- resumable runs via `run.json` state tracking and `rrag resume <run_id>`
- run history inspection with `rrag runs`
- persisted ask traces and answers under `runs/`
- git environment discovery for future branch/commit orchestration
- TODO artifact formatting that is ready for step-by-step execution later
- heuristic execution that can create categories, create skills, update skills, link skills, unlink skills, and archive skills
- deterministic skill retrieval from title/summary plus extracted matching passages
- category-guided traversal traces during ask
- heuristic branch selection over category nodes before skill matching
- heuristic nested category path inference such as `Retrieval/Traversal` and `Knowledge-Base/Taxonomy`
- pluggable branch selector with optional LLM-assisted branch choice
- rebuild planning with conservative cleanup suggestions and executable safe actions
- delete command that archives a skill and removes its category links
- status command for quick repository introspection
- ask output now distinguishes real linked category paths from traversal paths used during retrieval
- optional model-backed planning and answer synthesis with automatic heuristic fallback
- resumable execution for planned runs that still have pending TODO items

Still placeholder:

- LLM planning
- LLM-guided tree traversal for retrieval
- git commit-per-TODO execution and PR orchestration
- git branch / commit orchestration during apply and rebuild

## Spec

The current product spec lives in [README/spec.md](/Users/yangzihan/Projects/rrag/README/spec.md).
