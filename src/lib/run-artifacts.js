import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function createRunDirectory(runsRoot) {
  const runId = new Date().toISOString().replaceAll(":", "-");
  const runPath = path.join(runsRoot, runId);
  await mkdir(runPath, { recursive: true });
  return { runId, runPath };
}

export async function writeTodo(runPath, items) {
  const content = formatTodo(items);
  const todoPath = path.join(runPath, "TODO.md");
  await writeFile(todoPath, content, "utf8");
  return todoPath;
}

export async function writeReview(runPath, reviewText) {
  const reviewPath = path.join(runPath, "review.md");
  await writeFile(reviewPath, `${reviewText.trim()}\n`, "utf8");
  return reviewPath;
}

export async function writeMarkdownArtifact(runPath, filename, content) {
  const artifactPath = path.join(runPath, filename);
  await writeFile(artifactPath, `${content.trim()}\n`, "utf8");
  return artifactPath;
}

export async function appendStepLog(runPath, entry) {
  const logPath = path.join(runPath, "steps.jsonl");
  await writeFile(logPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" });
  return logPath;
}

export async function readStepLog(runPath) {
  const logPath = path.join(runPath, "steps.jsonl");
  try {
    const raw = await readFile(logPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeChangesSummary(runPath, metadata = {}) {
  const steps = await readStepLog(runPath);
  const content = renderChangesSummary(steps, metadata);
  return writeMarkdownArtifact(runPath, "changes.md", content);
}

export async function writeCommitArtifacts(runPath, metadata = {}) {
  const steps = await readStepLog(runPath);
  const commitMessage = renderCommitMessage(steps, metadata);
  const prSummary = renderPrSummary(steps, metadata);
  await writeMarkdownArtifact(runPath, "commit-message.txt", commitMessage);
  await writeMarkdownArtifact(runPath, "pr-summary.md", prSummary);
}

export async function writeSummary(runPath, summary) {
  const summaryPath = path.join(runPath, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summaryPath;
}

export async function readSummary(runPath) {
  const summaryPath = path.join(runPath, "summary.json");
  const content = await readFile(summaryPath, "utf8");
  return JSON.parse(content);
}

export async function writeRunManifest(runPath, manifest) {
  const manifestPath = path.join(runPath, "run.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

export async function readRunManifest(runPath) {
  const manifestPath = path.join(runPath, "run.json");
  const content = await readFile(manifestPath, "utf8");
  return JSON.parse(content);
}

export async function updateRunManifest(runPath, patch) {
  const current = await readRunManifest(runPath);
  const next = deepMerge(current, patch);
  await writeRunManifest(runPath, next);
  return next;
}

export async function writePlan(runPath, plan) {
  const planPath = path.join(runPath, "plan.json");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return planPath;
}

export async function readPlan(runPath) {
  const planPath = path.join(runPath, "plan.json");
  const content = await readFile(planPath, "utf8");
  return JSON.parse(content);
}

export async function readTodo(runPath) {
  const todoPath = path.join(runPath, "TODO.md");
  const content = await readFile(todoPath, "utf8");
  return parseTodo(content);
}

export async function markTodoItemDone(runPath, index, note) {
  const items = await readTodo(runPath);
  if (index < 0 || index >= items.length) {
    throw new Error(`todo index out of range: ${index}`);
  }
  const item = items[index];
  items[index] = {
    ...item,
    done: true,
    note: note ?? item.note
  };
  await writeTodo(runPath, items);
  return items[index];
}

export function findFirstPendingTodoIndex(items) {
  return items.findIndex(item => !item.done);
}

export async function archiveStaging(stagingRoot, archiveRoot, runId, manifest) {
  const archiveId = `${runId}-${randomUUID().slice(0, 8)}`;
  const target = path.join(archiveRoot, archiveId);
  await mkdir(archiveRoot, { recursive: true });
  await rename(stagingRoot, target);
  await mkdir(stagingRoot, { recursive: true });
  await writeFile(path.join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return target;
}

export async function snapshotStaging(stagingRoot, destinationRoot) {
  await cp(stagingRoot, destinationRoot, { recursive: true });
}

export function createTodoItem(action, text, options = {}) {
  return {
    done: options.done ?? false,
    action,
    text,
    note: options.note ?? null,
    data: options.data ?? null
  };
}

function formatTodo(items) {
  return `${items.map(item => formatTodoLine(item)).join("\n")}\n`;
}

function formatTodoLine(item) {
  const checkbox = item.done ? "x" : " ";
  const action = item.action ? `${item.action}: ` : "";
  const note = item.note ? `  # ${item.note}` : "";
  return `- [${checkbox}] ${action}${item.text}${note}`;
}

function parseTodo(content) {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => parseTodoLine(line));
}

function parseTodoLine(line) {
  const match = /^- \[( |x)\] (?:(?<action>[a-z_]+): )?(?<text>.*?)(?:  # (?<note>.*))?$/.exec(line);
  if (!match || !match.groups) {
    return {
      done: false,
      action: "unknown",
      text: line,
      note: null
    };
  }
  return {
    done: match[1] === "x",
    action: match.groups.action ?? "unknown",
    text: match.groups.text,
    note: match.groups.note ?? null
  };
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return patch;
  }
  if (!isObject(base) || !isObject(patch)) {
    return patch;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function renderChangesSummary(steps, metadata) {
  const lines = ["# Changes", ""];

  if (metadata.mode) {
    lines.push(`- mode: ${metadata.mode}`);
  }
  if (metadata.runId) {
    lines.push(`- run_id: ${metadata.runId}`);
  }
  if (typeof metadata.completedSteps === "number") {
    lines.push(`- completed_steps: ${metadata.completedSteps}`);
  }
  if (metadata.validationOk !== undefined) {
    lines.push(`- validation_ok: ${metadata.validationOk ? "yes" : "no"}`);
  }
  if (lines.length > 2) {
    lines.push("");
  }

  if (steps.length === 0) {
    lines.push("No executed steps were recorded.");
    return lines.join("\n");
  }

  for (const step of steps) {
    lines.push(`## Step ${step.index + 1}: ${step.action}`);
    lines.push(`- todo: ${step.text}`);
    lines.push(`- note: ${step.note}`);
    const details = renderStepDetails(step.result);
    if (details.length > 0) {
      for (const detail of details) {
        lines.push(`- ${detail}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function renderStepDetails(result) {
  if (!result) {
    return [];
  }

  const details = [];
  if (result.createdSkill?.id) {
    details.push(`created_skill: ${result.createdSkill.id}`);
  }
  if (result.createdSkill?.source) {
    details.push(`source: ${result.createdSkill.source}`);
  }
  if (result.updatedSkill?.id) {
    details.push(`updated_skill: ${result.updatedSkill.id}`);
  }
  if (result.updatedSkill?.source) {
    details.push(`source: ${result.updatedSkill.source}`);
  }
  if (result.linkedSkill?.id && result.linkedSkill?.categoryPath) {
    details.push(`linked_skill: ${result.linkedSkill.id} -> ${result.linkedSkill.categoryPath}`);
  }
  if (result.archivedSkill?.id) {
    details.push(`archived_skill: ${result.archivedSkill.id}`);
  }
  if (result.category?.path && result.category?.change) {
    details.push(`category: ${result.category.change} ${result.category.path}`);
  }
  return details;
}

function renderCommitMessage(steps, metadata) {
  const subject = deriveCommitSubject(steps, metadata);
  const bullets = deriveCommitBullets(steps);
  const lines = [subject, ""];

  if (metadata.mode) {
    lines.push(`Mode: ${metadata.mode}`);
  }
  if (metadata.runId) {
    lines.push(`Run: ${metadata.runId}`);
  }
  if (typeof metadata.completedSteps === "number") {
    lines.push(`Completed steps: ${metadata.completedSteps}`);
  }
  if (metadata.validationOk !== undefined) {
    lines.push(`Validation: ${metadata.validationOk ? "ok" : "failed"}`);
  }
  if (bullets.length > 0) {
    lines.push("");
    for (const bullet of bullets) {
      lines.push(`- ${bullet}`);
    }
  }

  return lines.join("\n").trimEnd();
}

function renderPrSummary(steps, metadata) {
  const lines = ["# Run Summary", ""];
  lines.push(`- mode: ${metadata.mode ?? "unknown"}`);
  if (metadata.runId) {
    lines.push(`- run_id: ${metadata.runId}`);
  }
  if (typeof metadata.completedSteps === "number") {
    lines.push(`- completed_steps: ${metadata.completedSteps}`);
  }
  if (metadata.validationOk !== undefined) {
    lines.push(`- validation_ok: ${metadata.validationOk ? "yes" : "no"}`);
  }
  lines.push("");
  lines.push("## Highlights");
  lines.push("");

  const bullets = deriveCommitBullets(steps);
  if (bullets.length === 0) {
    lines.push("- No executable changes were recorded.");
  } else {
    for (const bullet of bullets) {
      lines.push(`- ${bullet}`);
    }
  }

  return lines.join("\n").trimEnd();
}

function deriveCommitSubject(steps, metadata) {
  const changedActions = steps
    .map(step => step.action)
    .filter(action => !["scan_categories", "scan_skills", "review_input", "review_skills", "review_plan", "review_duplicates"].includes(action));

  if (changedActions.length === 0) {
    return `Summarize ${metadata.mode ?? "run"} maintenance`;
  }

  const unique = [...new Set(changedActions)];
  if (unique.length === 1) {
    return humanizeAction(unique[0]);
  }
  return `Apply ${metadata.mode ?? "run"} knowledge base changes`;
}

function deriveCommitBullets(steps) {
  const bullets = [];
  for (const step of steps) {
    const result = step.result ?? {};
    if (result.createdSkill?.id) {
      bullets.push(`created skill ${result.createdSkill.id}${result.createdSkill.source ? ` from ${result.createdSkill.source}` : ""}`);
      continue;
    }
    if (result.updatedSkill?.id) {
      bullets.push(`updated skill ${result.updatedSkill.id}${result.updatedSkill.source ? ` from ${result.updatedSkill.source}` : ""}`);
      continue;
    }
    if (result.linkedSkill?.id && result.linkedSkill?.categoryPath) {
      bullets.push(`linked skill ${result.linkedSkill.id} under ${result.linkedSkill.categoryPath}`);
      continue;
    }
    if (result.archivedSkill?.id) {
      bullets.push(`archived skill ${result.archivedSkill.id}`);
      continue;
    }
    if (result.category?.path && result.category?.change) {
      bullets.push(`${result.category.change.replaceAll("_", " ")} category ${result.category.path}`);
    }
  }
  return bullets;
}

function humanizeAction(action) {
  switch (action) {
    case "create_skill":
      return "Create knowledge base skill";
    case "update_skill":
      return "Update knowledge base skill";
    case "link_skill":
      return "Relink knowledge base skills";
    case "unlink_skill":
      return "Clean knowledge base links";
    case "archive_skill":
      return "Archive knowledge base skill";
    case "remove_empty_category":
      return "Clean empty knowledge base categories";
    case "create_category":
      return "Create knowledge base categories";
    default:
      return `Apply ${action.replaceAll("_", " ")}`;
  }
}
