# Test Cases

These sample files are intended for quick end-to-end demos of the current `rrag` prototype.

## Included Cases

- `01-traversal-note.md`
  Shows how traversal budgeting and branch selection notes are ingested.

- `02-passage-note.md`
  Shows how passage-oriented retrieval notes are ingested and later recalled by `ask`.

- `03-taxonomy-note.md`
  Shows how taxonomy cleanup ideas can be ingested and later surfaced by `rebuild`.

## Fastest Way To Run

From the repository root:

```bash
npm run demo:testcases
```

This creates an isolated temporary workspace, ingests the three sample files, runs a few `ask` queries, performs `rebuild --dry-run`, and prints the resulting `status` and `runs`.

## Manual Flow

If you want to inspect the behavior step by step in your own workspace:

```bash
node ./bin/rrag.js update --file ./examples/test-cases/01-traversal-note.md
node ./bin/rrag.js update --file ./examples/test-cases/02-passage-note.md
node ./bin/rrag.js update --file ./examples/test-cases/03-taxonomy-note.md
node ./bin/rrag.js update --apply
node ./bin/rrag.js ask "How should traversal cost be controlled in retrieval systems?"
node ./bin/rrag.js ask "Why should a system extract passages instead of returning whole skills?"
node ./bin/rrag.js rebuild --dry-run
node ./bin/rrag.js status
node ./bin/rrag.js runs 5
```
