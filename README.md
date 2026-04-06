# rrag

English | [简体中文](README/README.zh-CN.md)

`rrag` is a local CLI for a filesystem-based knowledge base organized by categories and skills, with retrieval and update flows guided by LLM reasoning.

## What It Is

`rrag` stores knowledge as readable files instead of hiding it inside a vector database:

- `skills/` stores knowledge content
- `categories/` stores the taxonomy tree
- `staging/` stores pending input to learn

The runtime data lives outside this source repository and is managed in its own git repository.

## Install

Requirements:

- Node.js `>= 18`

Install globally from the repo root:

```bash
npm install -g .
```

Then verify:

```bash
rrag --help
```

For local development, `npm link` also works.

## Data Directory

By default, runtime data is stored in:

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

That data directory is initialized as its own git repo, separate from this code repo.

## Quick Start

1. Initialize configuration:

```bash
rrag init
```

`init` is interactive. It asks for:

- LLM provider
- base URL
- model
- API key env var

If config already exists, current values are used as defaults. On a fresh setup, recommended defaults are used.

2. Add one note to learn:

```bash
rrag update "Beam search should keep traversal branch budgets small."
```

3. Apply the update:

```bash
rrag update --apply
```

4. Review the diff against `main`:

```bash
rrag update --review
```

5. Merge the current update branch back into `main`:

```bash
rrag update --merge
```

6. Ask a question:

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

## Core Commands

### Learn Knowledge

Add inline text into `staging/`:

```bash
rrag update "A note to learn later"
```

Copy a file or directory into `staging/`:

```bash
rrag update --file ./docs/some-note.md
rrag update --file ./docs/
```

Apply staged input:

```bash
rrag update --apply
```

Review the current update branch:

```bash
rrag update --review
```

Merge it into `main`:

```bash
rrag update --merge
```

### Ask Questions

Default output shows only the final answer:

```bash
rrag ask "What does the repo know about traversal?"
```

Explain mode includes traversal, matched skills, and evidence passages:

```bash
rrag ask --explain "What does the repo know about traversal?"
```

### Rebuild Taxonomy

Preview only:

```bash
rrag rebuild --dry-run
```

Execute a conservative rebuild:

```bash
rrag rebuild
```

### Configure

Show the active config:

```bash
rrag config show
```

Set one config value:

```bash
rrag config set llm_provider ollama
rrag config set llm_base_url http://127.0.0.1:11434
rrag config set llm_model qwen2.5:7b
```

Import an existing JSON config:

```bash
rrag config --file ./config/rrag.local.json
```

### Inspect and Maintain

Show repository status:

```bash
rrag status
```

Show recent runs:

```bash
rrag runs
rrag runs 10
```

Resume an unfinished run:

```bash
rrag resume <run_id>
```

Clear cache, archive, and run artifacts:

```bash
rrag clear
```

Soft-delete a skill:

```bash
rrag delete <skill_id>
```

## Recommended LLM Setups

### Ollama

Start Ollama and the model, then run:

```bash
rrag init
```

Recommended values:

- provider: `ollama`
- base URL: `http://127.0.0.1:11434`
- model: for example `qwen2.5:7b`

### llama.cpp

```bash
rrag init
```

Recommended values:

- provider: `llama.cpp`
- base URL: for example `http://127.0.0.1:8080/v1`
- model: your local model name

### OpenAI-Compatible Endpoints

Set your API key env var first, then run:

```bash
rrag init
```

Recommended values:

- provider: `openai-compatible`
- base URL: for example `https://api.openai.com/v1`
- model: for example `gpt-4.1-mini`
- API key env var: for example `OPENAI_API_KEY`

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
- `blank`

The recommended default is `error`, which is usually better for automation and scripts.

## Demo

Run the included demo cases:

```bash
npm run demo:testcases
```

This uses an isolated temporary `RRAG_HOME`, so it does not affect your real `~/.rrag`.

See also:

- [Chinese README](README/README.zh-CN.md)
- [English README copy](README/README.en.md)
- [Spec](README/spec.md)
- [Example test cases](examples/test-cases/README.md)
