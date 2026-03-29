# rrag — Spec v1.1

## 0. Core Idea

`rrag` is not traditional RAG.

It is a:

**LLM-driven hierarchical knowledge system using reasoning instead of embeddings**

Core properties:

- retrieval via hierarchical tree search
- write via retrieval-and-planning
- storage via filesystem
- continuous self-reorganization via rebuild

The system should behave like a human librarian:

- inspect new materials
- navigate the category tree
- inspect relevant skills
- decide what should be updated, created, relinked, or archived
- execute changes step by step under version control

## 1. Repository Layout

```bash
rrag/
  skills/
    <skill_id>/
      content.md
      meta.json

  categories/
    <category>/
      <sub_category>/
        <skill_id> -> ../../../skills/<skill_id>   # symlink

  staging/
    ... user-provided learning materials ...

  archive/
    staging/
      <uuid>/
        ... consumed staging snapshot ...
        manifest.json

  runs/
    <timestamp>/
      TODO.md
      review.md
      summary.json

  config.json
```

## 1.1 Skills

Each skill is stored under `skills/<skill_id>/`.

### `content.md`

```md
# Title

<knowledge content>
```

### `meta.json`

```json
{
  "id": "uuid",
  "title": "string",
  "summary": "short summary",
  "created_at": "iso",
  "updated_at": "iso"
}
```

Notes:

- `summary` is required and is used during retrieval before reading full content.
- skill content should be structured for passage extraction:
  - short sections
  - readable headings
  - avoid one giant paragraph

## 2. Categories

`categories/` stores the classification tree.

Rules:

- each folder is a category
- nested folders represent subcategories
- symlinks to `skills/<skill_id>` are leaf references
- one skill may be linked under multiple category paths

Categories are for navigation and retrieval, not content storage.

## 3. Staging and Archive

### 3.1 Staging

`staging/` is a controlled workspace for learning inputs.

Rules:

- all content under `staging/` is considered pending learning input
- users may edit `staging/` manually
- all text files under `staging/` are eligible for learning
- external `--file` inputs must first be copied into the workspace before learning
- LLM may only access workspace files, including:
  - `skills/`
  - `categories/`
  - `staging/`

### 3.2 Archive

After a successful `update --apply`, the full consumed `staging/` content is moved to:

```bash
archive/staging/<uuid>/
```

This archive should include `manifest.json`, recording at least:

- archived file list
- started_at
- finished_at
- run directory
- git branch
- final commit or MR reference if available
- status

If update fails, `staging/` remains intact.

## 4. CLI

```bash
rrag update "<text>"
rrag update --file <path>
rrag update --apply

rrag ask "<question>"

rrag rebuild [--dry-run]

rrag delete <skill_id>          # optional / conservative
rrag config set <key> <value>
```

Notes:

- `rrag update "<text>"` writes the text into `staging/`
- `rrag update --file <path>` copies a file or directory into `staging/`
- `rrag update --apply` consumes the entire current `staging/`

`review` is not a standalone command.

## 5. Config

```json
{
  "max_branches": 10,
  "max_depth": 5,
  "max_total_nodes": 50,
  "max_full_skill_reads": 12,
  "max_passages_per_skill": 5,
  "staging_max_file_size": 262144,
  "staging_max_total_files": 500
}
```

These are implementation guardrails, not necessarily user-facing concepts.

## 6. FileSystem API

LLM must not manipulate raw filesystem paths directly.

All file operations must go through a filesystem layer.

Required capabilities:

```ts
listCategories(path): string[]
listSkills(path): string[]

readSkillMeta(skill_id): SkillMeta
readSkillContent(skill_id): string

createSkill(title, content, summary): skill_id
updateSkill(skill_id, content, summary): void
archiveSkill(skill_id): void

createCategory(path): void

linkSkill(skill_id, category_path): void
unlinkSkill(skill_id, category_path): void

validateRepo(): ValidationResult
```

Optional later capabilities:

```ts
deleteSkill(skill_id): void
moveCategory(src, dst): void
mergeCategory(src, dst): void
```

## 7. Update Flow

### 7.1 Input Collection

#### `rrag update "<text>"`

- create a markdown file in `staging/`
- store raw user input as learning material

#### `rrag update --file <path>`

- copy the file or directory into `staging/`
- apply filtering rules during copy

#### Copy Filtering Rules

Must ignore or reject:

- binary files
- hidden system junk
- `.git/`
- `node_modules/`
- `dist/`
- `build/`
- oversized files
- excessive file counts

Traversal order should be stable.

### 7.2 Apply Flow

`rrag update --apply` runs the full learning workflow.

#### Step 1: Read staging materials

- scan all text files in `staging/`
- normalize them into a consistent internal material set

#### Step 2: Explore relevant categories and skills

The LLM should act like a librarian:

- navigate relevant category branches
- inspect candidate skills by summary first
- read full skill content only when needed
- form evolving judgments while exploring

#### Step 3: Produce TODO plan

The LLM must produce a natural-language `TODO.md`.

This is the main execution plan.

Each TODO item should be a single, concrete action.

Recommended format:

```md
- [ ] create_skill: Create a new skill for ...
- [ ] update_skill: Expand `skill_x` with ...
- [ ] create_category: Create `AI/Agentic-RAG`
- [ ] link_skill: Link `skill_x` under `AI/Agents`
- [ ] unlink_skill: Remove `skill_y` from `Programming/General`
- [ ] archive_skill: Archive `skill_z` after merging its useful content into `skill_x`
```

The label is lightweight and only meant to stabilize execution and review.

#### Step 4: Review TODO plan

This is an internal LLM step.

The system should review the full TODO list from a broader perspective and produce `review.md`, for example:

- what should be changed
- what is redundant
- whether a category is unnecessary
- whether a create should instead be an update
- whether an archive is too aggressive

After review, the final TODO list is updated before execution starts.

#### Step 5: Create branch

Create a dedicated git branch for this run.

#### Step 6: Execute TODO items sequentially

For each TODO item:

- perform the change
- update `TODO.md` to mark the item complete
- create a git commit for that item

One TODO item should map to one commit whenever practical.

#### Step 7: Finalize

After all items are done:

- validate repository consistency
- archive `staging/` into `archive/staging/<uuid>/`
- write run artifacts under `runs/<timestamp>/`
- create an MR / PR for human review before merging to `main`

If execution fails:

- stop
- preserve `staging/`
- use git rollback strategy as needed

## 8. Ask Flow

`ask` retrieves by reasoning over the category tree, not by vector similarity.

### 8.1 Retrieval Stages

#### Stage 1: Category-level search

Starting from `categories/` root:

- inspect candidate subcategories
- choose one or more relevant branches
- optionally inspect directly linked skills at the current node
- stop exploring irrelevant branches

This is a controlled multi-branch search.

#### Stage 2: Skill-level filtering

When a skill is encountered:

- read `meta.json` first
- use `title` and `summary` to decide relevance
- only read `content.md` if the skill appears sufficiently relevant

#### Stage 3: Passage extraction

A relevant skill should not be returned wholesale by default.

Instead:

- read the skill content
- extract the most relevant passages or sections
- use these passages as the retrieval result for that skill

The final retrieval unit is:

- relevant skill
- relevant passages from that skill

not the entire skill document unless necessary.

### 8.2 Answering

The final answer must:

- use only retrieved passages
- combine evidence across multiple skills when needed
- say `"I don't know"` if evidence is insufficient

## 9. Rebuild Flow

`rrag rebuild` is a full-knowledge-base maintenance operation.

It is not the same as the internal review step in `update --apply`.

### 9.1 Purpose

Rebuild inspects the existing knowledge base globally and may propose large-scale structural changes.

Typical goals:

- detect duplicated or near-duplicated categories
- detect bad hierarchy
- detect misplaced skill links
- detect empty or low-value categories
- suggest cleaner classification structure
- relink or archive skills conservatively

### 9.2 Flow

#### Step 1: Scan whole repository

Read:

- category tree
- skill summaries
- skill distribution across categories

#### Step 2: Analyze structure

The LLM evaluates:

- taxonomy quality
- repeated or drifting categories
- whether skills are linked reasonably
- where categories are too broad or too narrow

#### Step 3: Produce TODO plan

As with update, rebuild should produce a natural-language TODO list.

#### Step 4: Execute on branch

Execution follows the same pattern:

- branch
- TODO-by-TODO commit
- final MR for human review

#### Step 5: Support dry run

`rrag rebuild --dry-run` should generate plan artifacts without executing changes.

## 10. Action Types for v1

Allowed automatic action labels in TODO items:

- `create_skill`
- `update_skill`
- `create_category`
- `link_skill`
- `unlink_skill`
- `archive_skill`

Not automatically executed in v1, or only as suggestions:

- `delete_skill`
- `split_skill`
- `move_category`
- `merge_category`
- `rename_category`

Default policy:

- prefer conservative changes
- prefer creating over over-merging
- prefer archiving over deleting

## 11. Decision Rules

### 11.1 `update_skill`

Use only when:

- new material belongs to the same core question as the existing skill
- the skill remains a coherent single knowledge unit after update
- the change is a supplement, correction, or focused expansion

Do not use when the new content would broaden the skill too much.

### 11.2 `create_skill`

Use when:

- the material can stand alone as a reusable knowledge unit
- it answers a distinct question
- merging would create a bloated or mixed-topic skill

When uncertain, prefer `create_skill` over `update_skill`.

### 11.3 `link_skill`

Use when:

- the skill content is already correct
- the main issue is that the skill should also appear under another category path

### 11.4 `unlink_skill`

Use when:

- the skill is clearly misplaced under a category
- removing the link improves retrieval quality

Do not leave a skill with no valid category path unless part of a coordinated change.

### 11.5 `archive_skill`

Use only when:

- the skill has been materially subsumed by other skills
- keeping it active would create harmful duplication

Be very conservative.

## 12. Category Rules

### 12.1 Naming

Categories should be:

- short
- stable
- reusable
- topic labels, not sentences

Recommended:

- 1-3 words
- consistent naming style
- English for v1

Avoid:

- sentence-like names
- temporary labels
- versioned names unless truly necessary
- categories differing only by plurality or formatting

### 12.2 Creation

Only create a category when:

- existing paths are clearly insufficient
- the category is likely to be reusable
- multiple links are not a better solution

Prefer reusing existing categories.

Prefer multiple links over unnecessarily deep hierarchy.

## 13. Prompt Constraints

LLM outputs should follow these rules:

- TODO plans are natural language markdown
- review output is natural language markdown
- no extra chatter outside the expected artifact
- keep TODO items concrete and single-purpose

Not all outputs must be strict JSON anymore.

JSON is still allowed for internal metadata if needed, but plan artifacts are markdown-first.

## 14. Git Workflow

Git is the primary safety mechanism.

Rules:

- create a dedicated branch per apply/rebuild run
- commit after each completed TODO item
- final result should be reviewed through MR / PR before merge to `main`
- failed runs may be reset or rolled back using git history
- successful runs preserve a clear commit trail of what changed

This workflow is part of the product design, not just an implementation detail.

## 15. Error Handling

Must support:

- safe failure during execution
- git-based rollback strategy
- logging
- repository validation after changes
- preservation of `staging/` on failed apply

If LLM output is malformed or unusable:

- stop execution
- preserve artifacts
- do not partially continue blindly

## 16. Implementation Priority

Build in this order:

1. filesystem abstraction
2. staging ingestion
3. `update --apply` with TODO generation
4. category navigation
5. ask with summary-first retrieval
6. passage extraction from skill content
7. sequential TODO execution with git commits
8. archive staging after successful apply
9. rebuild
10. optional delete / advanced taxonomy operations later

## 17. One-Sentence Goal

Build a CLI tool that allows an LLM to:

- learn from staged materials
- organize knowledge into a category tree
- retrieve by reasoning over categories and skill passages
- evolve the knowledge base through conservative, reviewable filesystem changes
