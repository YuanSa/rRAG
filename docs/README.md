# rrag

English | [简体中文](README.zh-CN.md)

`rrag` is a local CLI for a filesystem-native knowledge base.  
Instead of relying on vector similarity first, it organizes and retrieves knowledge through LLM-guided reasoning over a category tree and skill files.

## Highlights

- Reasoning-first retrieval
  The system navigates categories step by step and decides what to inspect, instead of relying purely on embeddings and top-k similarity.

- Filesystem-native knowledge base
  Knowledge is stored as readable `skills/`, `categories/`, and `staging/` files and folders.

- Lightweight day-to-day workflow
  Add knowledge with one command, review the generated update branch, then merge it back into `main`.

- Git-managed knowledge evolution
  The runtime data directory is its own git repository, so knowledge changes are reviewable and auditable.

- Works with local or remote models
  Supports local Ollama, local `llama.cpp`, and OpenAI-compatible endpoints.

## Quick Start

### 1. Install

Requirements:

- Node.js `>= 18`

From the repo root:

```bash
npm install -g .
```

Check that the command is available:

```bash
rrag --help
```

### 2. Initialize the model connection

```bash
rrag init
```

`init` is interactive. It asks for:

- LLM provider
- base URL
- model
- API key env var

If a config already exists, current values are used as defaults.

### 3. Try the smallest possible flow

Add a single piece of knowledge:

```bash
rrag update "Beam search should keep traversal branch budgets small."
```

Apply the staged update:

```bash
rrag update --apply
```

Review what changed:

```bash
rrag update --review
```

Merge it into `main`:

```bash
rrag update --merge
```

Now ask a question:

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

## Typical Use Cases

### 1. Learn a quick fact

When you just want to teach one short fact or note:

```bash
rrag update "My preferred deployment region is us-west-2."
rrag update --apply
```

### 2. Learn from existing files

When you already have notes, docs, or a small folder of material:

```bash
rrag update --file ./notes/architecture.md
rrag update --file ./research/
rrag update --apply
```

### 3. Review knowledge changes before merging

When you want a git-style review flow for knowledge changes:

```bash
rrag update --apply
rrag update --review
rrag update --merge
```

### 4. Ask for just the answer

For a normal CLI experience, `ask` prints only the final answer:

```bash
rrag ask "What does the repo know about traversal?"
```

### 5. Debug how retrieval worked

If you want traversal details, matched skills, and evidence passages:

```bash
rrag ask --explain "What does the repo know about traversal?"
```

### 6. Clean up or inspect the knowledge base

View current status:

```bash
rrag status
```

See recent run history:

```bash
rrag runs
rrag runs 10
```

Rebuild the taxonomy conservatively:

```bash
rrag rebuild --dry-run
rrag rebuild
```

### 7. Clear local cache and temporary artifacts

```bash
rrag clear
```

### 8. Soft-delete a skill

```bash
rrag delete <skill_id>
```

This removes active links and archives the skill instead of hard-deleting it.

## Runtime Data

By default, runtime data lives in:

```bash
~/.rrag
```

Override it with:

```bash
RRAG_HOME=~/.rrag-demo rrag status
```

Typical contents:

- `skills/`
- `categories/`
- `staging/`
- `archive/`
- `runs/`
- `config.json`

This directory is initialized as its own git repository, separate from the source repo.

## Important Config Keys

- `llm_provider`
- `llm_base_url`
- `llm_model`
- `llm_api_key_env`
- `runs_enabled`
- `archive_enabled`
- `ask_no_answer_behavior`
- `branch_max_per_level`
- `branch_min_score`
- `branch_score_margin`

`ask_no_answer_behavior` supports:

- `error`
- `reply`
- `empty`

More concretely:

- `llm_provider`
  Chooses the model backend. Current supported values:
  - `ollama`
  - `llama.cpp`
  - `openai-compatible`

- `llm_base_url`
  The endpoint for the model service.
  Typical examples:
  - Ollama: `http://127.0.0.1:11434`
  - `llama.cpp`: `http://127.0.0.1:8080/v1`
  - OpenAI-compatible: your remote API base URL

- `llm_model`
  The actual model name to use, for example:
  - `qwen2.5:7b`
  - `gpt-4.1-mini`

- `llm_api_key_env`
  The environment variable used to read the API key.
  For local Ollama, this usually remains unused, but it can still stay configured.

- `runs_enabled`
  Whether to record execution traces under `runs/`.
  Enable it if you want better observability and debugging; disable it if you want a cleaner data directory.

- `archive_enabled`
  Whether `update --apply` should archive consumed `staging/` input into `archive/`.
  Enable it for traceability; disable it if you prefer a simpler working directory.

- `ask_no_answer_behavior`
  Controls what `ask` does when no skill matches, or when no grounded answer can be derived:
  - `error`: throw an error
  - `reply`: print `I don't know.`
  - `empty`: print nothing

- `branch_max_per_level`
  Limits how many category branches retrieval can continue exploring at each tree level.
  Higher values widen recall; lower values make retrieval more conservative.

- `branch_min_score`
  The minimum relevance score a category branch must have before it is explored further.

- `branch_score_margin`
  Controls how far a branch may fall behind the best-scoring branch while still being kept.
  Higher values keep more branches alive; lower values favor the strongest branch only.

## Full Command List

```bash
rrag init
rrag update "<text>"
rrag update --file <path>
rrag update --apply
rrag update --review
rrag update --merge
rrag ask "<question>"
rrag ask --explain "<question>"
rrag rebuild [--dry-run]
rrag config show
rrag config set <key> <value>
rrag config --file <path>
rrag status
rrag runs [limit]
rrag resume <run_id>
rrag clear
rrag delete <skill_id>
```

## More

- [简体中文文档](README.zh-CN.md)
- [Spec](spec.md)
- [Example test cases](../examples/test-cases/README.md)
