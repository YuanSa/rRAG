# rrag

`rrag` is a local CLI prototype for a filesystem-based, LLM-driven hierarchical knowledge system.

Runtime knowledge data is stored outside this code repository by default:

- default data root: `~/.rrag`
- override with: `RRAG_HOME=/some/path`

That shared data root contains:

- `skills/`
- `categories/`
- `staging/`
- `archive/`
- `runs/`
- `config.json`

The data root is managed as its own git repository, separate from this source repo.

The current codebase provides:

- repository bootstrap for `skills/`, `categories/`, `staging/`, `archive/`, and `runs/`
- a runnable `rrag` CLI
- staging ingestion via text or copied files
- deterministic `update --apply`, `ask`, and `rebuild` starter flows
- run artifact generation for TODO/review/summary files
- executed runs now also persist `steps.jsonl`, a per-TODO action log for later diff/commit orchestration
- executed runs now also generate `changes.md`, a readable change summary derived from the step log
- executed runs now also generate `commit-message.txt` and `pr-summary.md` drafts from the same step log
- update runs now also generate `decisions.md`, a readable record of planner decisions and rationales
- run manifests with git environment metadata and parseable TODO items
- ask runs persisted with `answer.md`, `run.json`, and `summary.json`
- heuristic ask retrieval over skill summaries plus passage extraction
- heuristic category-guided traversal before skill passage extraction
- traversal budgeting now respects `max_total_nodes` and records when a search is truncated
- traversal now caches subtree hints during a run and exposes cache hit/miss signals in ask history
- heuristic update planning that can create or update skills and add category links
- LLM update planning now gets related skill excerpts, category reuse context, and decision rationales
- soft-delete via archiving skills out of the active knowledge base
- optional remote and local LLM integration for planning, review, grounded answers, and branch selection
- taxonomy-aware status reporting with depth, leaf-category, and redundant-link signals

## Quick Start

```bash
node ./bin/rrag.js --help
node ./bin/rrag.js update "A note to learn later"
node ./bin/rrag.js update --file ./some-docs
node ./bin/rrag.js update --apply
node ./bin/rrag.js update --review
node ./bin/rrag.js update --merge
node ./bin/rrag.js ask "What does the repo know?"
node ./bin/rrag.js ask --explain "What does the repo know?"
node ./bin/rrag.js rebuild --dry-run
node ./bin/rrag.js init
node ./bin/rrag.js resume 2026-03-30T16-22-24.637Z
node ./bin/rrag.js runs
node ./bin/rrag.js status
node ./bin/rrag.js clear
```

If you want to use a custom shared data root:

```bash
RRAG_HOME=~/.rrag-demo node ./bin/rrag.js status
```

`node ./bin/rrag.js init` launches an interactive setup guide in a real terminal. It uses your current config as defaults when one exists, and recommended defaults for a fresh setup. For scripted changes, use `config --file` or `config set`.

## Demo Test Cases

The fastest way to see the prototype work end-to-end is:

```bash
npm run demo:testcases
```

This runs in an isolated temporary workspace and will:

- ingest the numbered sample files under [examples/test-cases](/Users/yangzihan/Projects/rrag/examples/test-cases)
- run `update --apply`
- ask a couple of retrieval questions
- run `rebuild --dry-run`
- print `status` and recent `runs`

If you want to run the same cases manually, see [examples/test-cases/README.md](/Users/yangzihan/Projects/rrag/examples/test-cases/README.md).

## Optional LLM Mode

The prototype now supports:

- remote OpenAI-compatible chat endpoints
- local Ollama servers
- local `llama.cpp` HTTP servers

Example:

```bash
export OPENAI_API_KEY=...
node ./bin/rrag.js init
node ./bin/rrag.js update --apply
```

Ollama example:

```bash
node ./bin/rrag.js init
node ./bin/rrag.js ask "How should traversal cost be narrowed in retrieval systems?"
```

`llama.cpp` server example:

```bash
node ./bin/rrag.js init
node ./bin/rrag.js ask "How should traversal cost be narrowed in retrieval systems?"
```

You can also import an existing JSON file directly:

```bash
node ./bin/rrag.js config --file ./config/rrag.local.json
node ./bin/rrag.js config show
```

It now only asks for:

- LLM provider
- base URL
- model
- API key env var

Other config values keep their current values or recommended defaults.

For fresh setups, the recommended defaults keep `runs` and `archive` disabled, set `ask_no_answer_behavior` to `error`, and use local Ollama defaults for the LLM connection.

Relevant config keys:

- `llm_provider`
- `llm_base_url`
- `llm_model`
- `llm_api_key_env`
- `runs_enabled`
- `archive_enabled`
- `ask_no_answer_behavior` (`error`, `reply`, or `blank`)
- `branch_max_per_level`
- `branch_min_score`
- `branch_score_margin`

If the configured model request fails, the code falls back to deterministic heuristic behavior where supported.

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
- resume now reconstructs staged-to-skill mappings from prior completed TODO items so dependent link steps can continue safely
- run history inspection with `rrag runs`
- `rrag runs` now shows completed step counts so execution progress is easier to inspect
- persisted ask traces and answers under `runs/`
- shared knowledge data now lives under `~/.rrag` by default, with its own git repository
- data-repo gitignore now excludes `staging/`, `runs/`, and `archive/`
- TODO artifact formatting that is ready for step-by-step execution later
- heuristic execution that can create categories, create skills, update skills, link skills, unlink skills, and archive skills
- deterministic skill retrieval from title/summary plus extracted matching passages
- category-guided traversal traces during ask
- heuristic branch selection over category nodes before skill matching
- heuristic nested category path inference such as `Retrieval/Traversal` and `Knowledge-Base/Taxonomy`
- pluggable branch selector with optional LLM-assisted branch choice
- LLM-guided category traversal now works when a remote or local provider is configured
- rebuild planning with conservative cleanup suggestions and executable safe actions
- rebuild can now propose and execute removal of empty category directories
- unlink operations now prune empty category directories so taxonomy cleanup leaves fewer empty shells
- delete command that archives a skill and removes its category links
- clear command that removes staging, archived staging snapshots, and run artifacts
- status command for quick repository introspection
- ask output now distinguishes real linked category paths from traversal paths used during retrieval
- optional model-backed planning and answer synthesis with automatic heuristic fallback
- resumable execution for planned runs that still have pending TODO items
- update apply now creates or reuses an update branch in the data repo and commits the resulting knowledge changes
- update review now shows the current update branch diff against `main`
- update merge now merges the current update branch into `main` and switches back

Still placeholder:

- fully semantic planner/executor behavior beyond the current conservative update flow
- git commit-per-TODO execution and PR orchestration
- update-branch cleanup after merge
- branch / commit orchestration during rebuild

## Spec

The current product spec lives in [README/spec.md](/Users/yangzihan/Projects/rrag/README/spec.md).
