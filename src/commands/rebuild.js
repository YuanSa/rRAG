import { createRunDirectory, createTodoItem, readTodo, updateRunManifest, writeChangesSummary, writeCommitArtifacts, writePlan, writeReview, writeRunManifest, writeSummary, writeTodo } from "../lib/run-artifacts.js";
import { collectSkillSummaries } from "../lib/skill-discovery.js";
import { getCurrentBranch, getGitStatus, getHeadCommit, isGitRepo } from "../lib/git.js";
import { collectCategoryLinks } from "../lib/retrieval.js";
import { executePlan } from "../lib/executor.js";
import { validateRepo } from "../lib/fs-api.js";
import { readdir } from "node:fs/promises";
import path from "node:path";

export async function handleRebuild(args, context) {
  const dryRun = args.includes("--dry-run");
  const runsEnabled = context.config.runs_enabled !== false;
  const skillSummaries = await collectSkillSummaries(context.paths.skills);
  const links = await collectCategoryLinks(context.paths.categories);
  const runId = new Date().toISOString().replaceAll(":", "-");
  const runRecord = runsEnabled ? await createRunDirectory(context.paths.runs) : { runId, runPath: null };
  const runPath = runRecord.runPath;
  const gitRepo = await isGitRepo(context.paths.root);
  const gitStatus = await getGitStatus(context.paths.root);

  const todoItems = await buildRebuildPlan(skillSummaries, links, context.paths.categories);

  if (runPath) {
    await writeTodo(runPath, todoItems);
    await writePlan(runPath, todoItems);
    await writeRunManifest(runPath, {
      mode: "rebuild",
      run_id: runId,
      created_at: new Date().toISOString(),
      repo_root: context.paths.root,
      workspace_root: context.cwd,
      state: {
        status: dryRun ? "planned" : "executing",
        updated_at: new Date().toISOString()
      },
      git: {
        available: gitRepo,
        branch: gitRepo ? await getCurrentBranch(context.paths.root) : "",
        head: gitRepo ? await getHeadCommit(context.paths.root) : "",
        status: gitStatus.ok ? gitStatus.output : gitStatus.error
      },
      counts: {
        skills_scanned: skillSummaries.length,
        links_scanned: links.length,
        todo_items: todoItems.length
      },
      plan: todoItems
    });
  }
  const execution = dryRun ? null : await executePlan({
    runPath,
    plan: todoItems,
    context,
    onProgress: async ({ index, note }) => {
      if (runPath) {
        await updateRunManifest(runPath, {
          state: {
            status: "executing",
            last_completed_index: index,
            last_note: note,
            updated_at: new Date().toISOString()
          }
        });
      }
    }
  });
  const validation = await validateRepo(context.paths);
  if (runPath) {
    await updateRunManifest(runPath, {
      state: {
        status: dryRun ? "planned" : execution.ok ? "executed" : "failed",
        updated_at: new Date().toISOString()
      },
      plan: await readTodo(runPath),
      execution,
      validation
    });
    await writeChangesSummary(runPath, {
      mode: "rebuild",
      runId,
      completedSteps: execution?.completedSteps ?? 0,
      validationOk: validation.ok
    });
    await writeCommitArtifacts(runPath, {
      mode: "rebuild",
      runId,
      completedSteps: execution?.completedSteps ?? 0,
      validationOk: validation.ok
    });
    await writeReview(
      runPath,
      [
        "# Rebuild Review",
        "",
        `- Dry run: ${dryRun ? "yes" : "no"}`,
        `- Skills scanned: ${skillSummaries.length}`,
        `- Links scanned: ${links.length}`,
        `- Planned actions: ${todoItems.length}`,
        "",
        ...buildReviewNotes(skillSummaries, links),
        "",
        "This rebuild plan is heuristic and currently not auto-executed."
      ].join("\n")
    );
    await writeSummary(runPath, {
      mode: "rebuild",
      run_id: runId,
      dry_run: dryRun,
      skills_scanned: skillSummaries.length,
      links_scanned: links.length,
      planned_actions: todoItems.length,
      executed: !dryRun,
      validation_ok: validation.ok
    });
  }

  if (runPath) {
    context.stdout.write(`Generated rebuild artifacts in ${runPath}\n`);
  } else {
    context.stdout.write("Run artifact recording is disabled.\n");
  }
  if (dryRun) {
    context.stdout.write("Dry run complete.\n");
  } else {
    context.stdout.write(`Executed heuristic rebuild plan. Validation: ${validation.ok ? "ok" : "failed"}\n`);
    if (execution?.notes?.length) {
      context.stdout.write(`Notes: ${execution.notes.join(" | ")}\n`);
    }
  }
}

async function buildRebuildPlan(skillSummaries, links, categoriesRoot) {
  const todoItems = [
    createTodoItem("scan_categories", "Inspect the entire categories tree for duplicate or drifting taxonomy"),
    createTodoItem("scan_skills", `Review classification quality for ${skillSummaries.length} skill summaries`)
  ];
  const emptyCategories = await collectEmptyCategories(categoriesRoot);

  const linkMap = new Map();
  for (const link of links) {
    const existing = linkMap.get(link.skillId) ?? [];
    existing.push(link.categoryPath);
    linkMap.set(link.skillId, existing);
  }

  for (const skill of skillSummaries) {
    const categories = linkMap.get(skill.id) ?? [];
    if (categories.length === 0) {
      todoItems.push(
        createTodoItem("link_skill", `Link unclassified skill \`${skill.id}\` under \`Imported\``, {
          data: {
            skillId: skill.id,
            categoryPath: "Imported"
          }
        })
      );
      continue;
    }

    if (categories.length > 1 && categories.includes("Imported")) {
      todoItems.push(
        createTodoItem("unlink_skill", `Remove fallback Imported link from \`${skill.id}\` because better categories exist`, {
          data: {
            skillId: skill.id,
            categoryPath: "Imported"
          }
        })
      );
    }

    for (const categoryPath of findRedundantAncestorLinks(categories)) {
      todoItems.push(
        createTodoItem("unlink_skill", `Remove redundant ancestor link \`${categoryPath}\` from \`${skill.id}\` because a deeper category path exists`, {
          data: {
            skillId: skill.id,
            categoryPath
          }
        })
      );
    }
  }

  const duplicateSummaries = findDuplicateSummaries(skillSummaries);
  for (const pair of duplicateSummaries) {
    todoItems.push(
      createTodoItem("review_duplicates", `Review possible duplicate skills \`${pair[0].id}\` and \`${pair[1].id}\``)
    );
  }

  for (const categoryPath of emptyCategories) {
    todoItems.push(
      createTodoItem("remove_empty_category", `Remove empty category \`${categoryPath}\``, {
        data: {
          categoryPath
        }
      })
    );
  }

  return todoItems;
}

function buildReviewNotes(skillSummaries, links) {
  const notes = [];
  const unlinked = skillSummaries.filter(skill => !links.some(link => link.skillId === skill.id));
  if (unlinked.length > 0) {
    notes.push(`- Unlinked skills detected: ${unlinked.length}`);
  } else {
    notes.push("- Every skill currently has at least one category link.");
  }

  const importedOnly = skillSummaries.filter(skill => {
    const categories = links.filter(link => link.skillId === skill.id).map(link => link.categoryPath);
    return categories.length === 1 && categories[0] === "Imported";
  });
  notes.push(`- Skills still only under Imported: ${importedOnly.length}`);

  const redundantAncestorLinks = skillSummaries.reduce((count, skill) => {
    const categories = links.filter(link => link.skillId === skill.id).map(link => link.categoryPath);
    return count + findRedundantAncestorLinks(categories).length;
  }, 0);
  notes.push(`- Redundant ancestor links detected: ${redundantAncestorLinks}`);

  const duplicates = findDuplicateSummaries(skillSummaries);
  notes.push(`- Possible duplicate skill pairs: ${duplicates.length}`);

  return notes;
}

function findDuplicateSummaries(skillSummaries) {
  const duplicates = [];
  for (let i = 0; i < skillSummaries.length; i += 1) {
    for (let j = i + 1; j < skillSummaries.length; j += 1) {
      if (normalize(skillSummaries[i].summary) && normalize(skillSummaries[i].summary) === normalize(skillSummaries[j].summary)) {
        duplicates.push([skillSummaries[i], skillSummaries[j]]);
      }
    }
  }
  return duplicates;
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function findRedundantAncestorLinks(categoryPaths) {
  const unique = [...new Set(categoryPaths.filter(Boolean))];
  return unique.filter(candidate => unique.some(other => other !== candidate && other.startsWith(`${candidate}/`)));
}

async function collectEmptyCategories(categoriesRoot) {
  const empty = [];

  async function walk(currentPath, parts) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    const directories = entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const links = entries.filter(entry => entry.isSymbolicLink());

    for (const entry of directories) {
      await walk(path.join(currentPath, entry.name), [...parts, entry.name]);
    }

    if (parts.length > 0 && directories.length === 0 && links.length === 0) {
      empty.push(parts.join("/"));
    }
  }

  await walk(categoriesRoot, []);
  return empty.sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b));
}
