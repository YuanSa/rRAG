# rrag

`rrag` is a local CLI prototype for a filesystem-based, LLM-driven hierarchical knowledge system.

The current codebase provides:

- repository bootstrap for `skills/`, `categories/`, `staging/`, `archive/`, and `runs/`
- a runnable `rrag` CLI
- staging ingestion via text or copied files
- deterministic `update --apply`, `ask`, and `rebuild` starter flows
- run artifact generation for TODO/review/summary files
- run manifests with git environment metadata and parseable TODO items
- heuristic ask retrieval over skill summaries plus passage extraction
- heuristic update planning that can create or update skills and add category links
- soft-delete via archiving skills out of the active knowledge base

## Quick Start

```bash
node ./bin/rrag.js --help
node ./bin/rrag.js update "A note to learn later"
node ./bin/rrag.js update --file ./some-docs
node ./bin/rrag.js update --apply
node ./bin/rrag.js ask "What does the repo know?"
node ./bin/rrag.js rebuild --dry-run
node ./bin/rrag.js status
```

## Current Status

This is an executable scaffold, not the final system.

Implemented today:

- directory bootstrap
- config loading and writing
- staging text ingestion
- filtered file copying into staging
- run artifact generation
- structured `plan.json` artifacts alongside human-readable `TODO.md`
- git environment discovery for future branch/commit orchestration
- TODO artifact formatting that is ready for step-by-step execution later
- heuristic execution that can create categories, create skills, update skills, link skills, unlink skills, and archive skills
- deterministic skill retrieval from title/summary plus extracted matching passages
- rebuild planning with conservative cleanup suggestions and executable safe actions
- delete command that archives a skill and removes its category links
- status command for quick repository introspection

Still placeholder:

- LLM planning
- LLM-guided tree traversal for retrieval
- git commit-per-TODO execution and PR orchestration
- git branch / commit orchestration during apply and rebuild

## Spec

The current product spec lives in [README/spec.md](/Users/yangzihan/Projects/rrag/README/spec.md).
