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
