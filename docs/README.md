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

### 1. Install and initialize

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

```bash
rrag init
```

`init` is interactive. It guides you through the model connection setup and supports local Ollama.

If you want the `~/.rrag` knowledge repository to sync with a remote git repository, and you want `update --apply` to push branches and open PRs / MRs automatically, you can continue with:

```bash
rrag config set remote_git_enabled true
rrag config set remote_git_provider github
rrag config set remote_git_remote origin
rrag config set remote_git_repo_url git@github.com:YOUR_NAME/YOUR_REPO.git
rrag config set remote_git_token_env GITHUB_TOKEN
```

For GitLab, set `remote_git_provider` to `gitlab` and use `GITLAB_TOKEN` instead.

### 2. Try the core workflow

First, ask a question:

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

Since the knowledge base is still empty, no answer is expected yet.

Now add that piece of knowledge:

```bash
rrag update "Beam search should keep traversal branch budgets small."
```

Then run the full update flow:

```bash
rrag update --apply
rrag update --review
rrag update --merge
```

`rrag update --apply` integrates the staged knowledge into the current knowledge base.  
`rrag update --review` lets you inspect the diff between this update branch and `main`.  
`rrag update --merge` merges the reviewed update back into `main`.

Now ask the same question again:

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

At this point, `rrag` should be able to answer it.

`rrag update` can be used multiple times before `--apply`, and it also supports importing files directly with `--file <file_path>`.

If remote git workflow is enabled, `rrag update --apply` will also:

- push the current `update/...` branch to the remote
- try to create a GitHub pull request or GitLab merge request

In that mode, you should **not** use `rrag update --merge`; instead, finish review and merge on the remote platform.

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

### 4. Review knowledge changes through GitHub or GitLab

If your knowledge base is collaborative, or you want every knowledge update to go through a remote review workflow:

```bash
rrag config set remote_git_enabled true
rrag config set remote_git_provider github
rrag config set remote_git_repo_url git@github.com:YOUR_NAME/YOUR_REPO.git
rrag config set remote_git_token_env GITHUB_TOKEN

rrag update "Beam search should keep traversal branch budgets small."
rrag update --apply
```

In this mode, `rrag update --apply` will:

- create or reuse a local `update/...` branch in the data repo
- perform the knowledge update and commit it
- push the current branch to the remote
- create a PR / MR automatically when possible, or print a helpful next step otherwise

Note: when remote mode is enabled, `rrag update --merge` is no longer the final step. Merge the PR / MR on the remote platform instead.

### 5. Ask for just the answer

For a normal CLI experience, `ask` prints only the final answer:

```bash
rrag ask "What does the repo know about traversal?"
```

### 6. Debug how retrieval worked

If you want traversal details, matched skills, and evidence passages:

```bash
rrag ask --explain "What does the repo know about traversal?"
```

### 7. Clean up or inspect the knowledge base

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

### 8. Use the local web console

If you prefer a browser-based control room for `ask`, `update`, `review`, `merge`, `status`, and `runs`, `rrag` also ships with a React GUI built with Semi Design:

```bash
rrag gui
```

This starts a local GUI console, usually at `http://127.0.0.1:4317`.

### 9. Clear local cache and temporary artifacts

```bash
rrag clear
```

### 10. Soft-delete a skill

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

| Key | Description | Common values / examples |
| --- | --- | --- |
| `llm_provider` | Chooses the model backend. | `ollama` / `llama.cpp` / `openai-compatible` |
| `llm_base_url` | The endpoint for the model service. | `http://127.0.0.1:11434` / `http://127.0.0.1:8080/v1` |
| `llm_model` | The actual model name to use. | `qwen2.5:7b` / `gpt-4.1-mini` |
| `llm_api_key_env` | The environment variable used to read the API key. For local Ollama this usually remains unused, but it can still stay configured. | `OPENAI_API_KEY` |
| `remote_git_enabled` | Whether to enable remote knowledge-repo workflow. When enabled, `update --apply` will push the update branch and attempt to create a remote PR / MR after committing locally. | `true` / `false` |
| `remote_git_provider` | The remote git platform type. `auto` will infer it from the repository URL; you can also pin it explicitly. | `auto` / `github` / `gitlab` |
| `remote_git_remote` | The git remote name used by the local data repo. Usually `origin`. | `origin` |
| `remote_git_repo_url` | The remote repository URL for the knowledge repo. If set, rrag will add or update the remote before pushing. | `git@github.com:YOUR_NAME/YOUR_REPO.git` |
| `remote_git_api_base_url` | Optional remote API base URL for GitHub Enterprise or self-hosted GitLab. | `https://github.example.com/api/v3` |
| `remote_git_token_env` | The environment variable that stores the token used to create a remote PR / MR. Leave it empty to push only, without automatic review creation. | `GITHUB_TOKEN` / `GITLAB_TOKEN` |
| `runs_enabled` | Whether to record execution traces under `runs/`. Enable it for observability and debugging; disable it for a cleaner data directory. | `true` / `false` |
| `archive_enabled` | Whether `update --apply` should archive consumed `staging/` input into `archive/`. | `true` / `false` |
| `ask_no_answer_behavior` | Controls what `ask` does when no skill matches, or when no grounded answer can be derived. | `error` / `reply` / `empty` |
| `branch_max_per_level` | Limits how many category branches retrieval can continue exploring at each tree level. Higher values widen recall; lower values make retrieval more conservative. | `3` |
| `branch_min_score` | The minimum relevance score a category branch must have before it is explored further. | `1` |
| `branch_score_margin` | Controls how far a branch may fall behind the best-scoring branch while still being kept. Higher values keep more branches alive; lower values favor the strongest branch only. | `3` |

## Full Command List

| Command | What it does | Typical use |
| --- | --- | --- |
| `rrag init` | Interactively initialize model connection settings. | First-time setup, switching model backends |
| `rrag update "<text>"` | Add a text note into `staging/`. | Teaching one small fact or note |
| `rrag update --file <path>` | Copy a file or directory into `staging/`. | Learning from existing docs or note folders |
| `rrag update --apply` | Apply staged input into the knowledge base. In remote mode, it also pushes the branch and tries to open a PR / MR. | Finish a knowledge update |
| `rrag update --review` | Show the current update branch diff against `main`. | Review changes before merging |
| `rrag update --merge` | Merge the current update branch back into `main`. Only for local workflow; in remote mode you merge the PR / MR instead. | Finalize a reviewed update |
| `rrag ask "<question>"` | Ask a question and print only the final answer. | Normal daily usage |
| `rrag ask --explain "<question>"` | Ask a question and include retrieval explanation, matched skills, and evidence passages. | Debug retrieval behavior |
| `rrag gui` | Start the local React + Semi browser console for `ask`, `update`, `review`, `merge`, `status`, and `runs`. | Web-based daily operation |
| `rrag rebuild [--dry-run]` | Rebuild or preview taxonomy maintenance actions. | Clean up or reorganize the knowledge base |
| `rrag config show` | Show the active config. | Verify current settings |
| `rrag config set <key> <value>` | Update one config value. | Fine-tune behavior |
| `rrag config --file <path>` | Import config from a JSON file. | Load a prepared config in one step |
| `rrag status` | Show overall repository status. | Quick health check |
| `rrag runs [limit]` | Show recent run history. | Inspect recent executions |
| `rrag resume <run_id>` | Resume an unfinished run. | Continue an interrupted flow |
| `rrag clear` | Clear cache, run records, and archive artifacts. | Reset temporary state |
| `rrag delete <skill_id>` | Soft-delete a skill. | Remove outdated or incorrect knowledge |

## More

- [简体中文文档](README.zh-CN.md)
- [Spec](spec.md)
- [Example test cases](../examples/test-cases/README.md)
