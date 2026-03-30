import path from "node:path";
import { collectStagingTexts, addTextToStaging, copyPathToStaging } from "../lib/staging.js";
import {
  archiveStaging,
  createRunDirectory,
  readTodo,
  writeChangesSummary,
  updateRunManifest,
  writeReview,
  writeRunManifest,
  writePlan,
  writeSummary,
  writeTodo
} from "../lib/run-artifacts.js";
import { collectSkillSummaries } from "../lib/skill-discovery.js";
import { validateRepo } from "../lib/fs-api.js";
import { getCurrentBranch, getGitStatus, getHeadCommit, isGitRepo } from "../lib/git.js";
import { buildUpdatePlanWithLlm, buildUpdateReviewWithLlm } from "../lib/planner.js";
import { executePlan } from "../lib/executor.js";

export async function handleUpdate(args, context) {
  if (args.length === 0) {
    throw new Error('update requires either "<text>", --file <path>, or --apply');
  }

  if (args[0] === "--apply") {
    await applyUpdate(context);
    return;
  }

  if (args[0] === "--file") {
    const sourcePath = args[1];
    if (!sourcePath) {
      throw new Error("update --file requires a path");
    }
    const absolutePath = path.resolve(context.cwd, sourcePath);
    const result = await copyPathToStaging(absolutePath, context.paths.staging, context.config);
    context.stdout.write(`Copied into staging: ${result.destination}\n`);
    return;
  }

  const text = args.join(" ").trim();
  if (!text) {
    throw new Error("update text cannot be empty");
  }
  const outputPath = await addTextToStaging(context.paths.staging, text);
  context.stdout.write(`Added note to staging: ${outputPath}\n`);
}

async function applyUpdate(context) {
  const stagedTexts = await collectStagingTexts(context.paths.staging);
  if (stagedTexts.length === 0) {
    throw new Error("staging is empty; nothing to apply");
  }

  const skillSummaries = await collectSkillSummaries(context.paths.skills);
  const { runId, runPath } = await createRunDirectory(context.paths.runs);
  const gitRepo = await isGitRepo(context.cwd);
  const gitStatus = await getGitStatus(context.cwd);
  const currentBranch = gitRepo ? await getCurrentBranch(context.cwd) : "";
  const headCommit = gitRepo ? await getHeadCommit(context.cwd) : "";

  const { plan, stagedDecisions, plannerMode, plannerError } = await buildUpdatePlanWithLlm({
    stagedTexts,
    skillSummaries,
    categoriesRoot: context.paths.categories,
    skillsRoot: context.paths.skills,
    llm: context.llm
  });
  const reviewText = await buildUpdateReviewWithLlm({ stagedTexts, skillSummaries, stagedDecisions, llm: context.llm });

  await writeTodo(runPath, plan);
  await writePlan(runPath, plan);
  await writeReview(runPath, reviewText);
  await writeRunManifest(runPath, {
    mode: "update",
    run_id: runId,
    created_at: new Date().toISOString(),
    repo_root: context.cwd,
    state: {
      status: "planned",
      updated_at: new Date().toISOString()
    },
    git: {
      available: gitRepo,
      branch: currentBranch,
      head: headCommit,
      status: gitStatus.ok ? gitStatus.output : gitStatus.error
    },
    counts: {
      staged_files: stagedTexts.length,
      existing_skills: skillSummaries.length,
      todo_items: plan.length
    },
    planner: {
      mode: plannerMode,
      error: plannerError ?? null
    },
    plan,
    decisions: stagedDecisions
  });
  await updateRunManifest(runPath, {
    state: {
      status: "executing",
      updated_at: new Date().toISOString()
    }
  });
  const execution = await executePlan({
    runPath,
    plan,
    context,
    onProgress: async ({ index, note, execution: progressExecution }) => {
      await updateRunManifest(runPath, {
        state: {
          status: "executing",
          last_completed_index: index,
          last_note: note,
          updated_at: new Date().toISOString()
        },
        execution: progressExecution
      });
    }
  });
  const validation = await validateRepo(context.paths);
  const archivedPath = await archiveStaging(context.paths.staging, context.paths.archiveStaging, runId, {
    status: execution.ok ? "executed" : "failed",
    started_at: new Date().toISOString(),
    staged_files: stagedTexts.map(item => item.relativePath),
    run_id: runId,
    run_path: runPath,
    execution,
    validation
  });
  await updateRunManifest(runPath, {
    state: {
      status: execution.ok ? "executed" : "failed",
      archived_staging_path: archivedPath,
      updated_at: new Date().toISOString()
    },
    plan: await readTodo(runPath),
    execution,
    validation
  });
  await writeChangesSummary(runPath, {
    mode: "update",
    runId,
    completedSteps: execution.completedSteps,
    validationOk: validation.ok
  });
  await writeSummary(runPath, {
    mode: "update",
    run_id: runId,
    staged_files: stagedTexts.length,
    existing_skills: skillSummaries.length,
    created_skills: execution.createdSkills.length,
    updated_skills: execution.updatedSkills.length,
    archived_staging_path: archivedPath,
    execution_mode: execution.mode,
    planner_mode: plannerMode,
    next_step: "Replace heuristic planning and execution with LLM-backed planning, review, and git commits."
  });

  context.stdout.write(`Created run artifacts in ${runPath}\n`);
  context.stdout.write(`Validated repository: ${validation.ok ? "ok" : "failed"}\n`);
  if (gitRepo) {
    context.stdout.write(`Git branch: ${currentBranch || "(detached)"}\n`);
  } else {
    context.stdout.write("Git: not available in this working tree\n");
  }
  context.stdout.write(`Planner mode: ${plannerMode}\n`);
  if (plannerError) {
    context.stdout.write(`Planner fallback reason: ${plannerError}\n`);
  }
  context.stdout.write(`Execution mode: ${execution.mode}\n`);
  context.stdout.write(`Created skills: ${execution.createdSkills.length}\n`);
  context.stdout.write(`Archived staging into ${archivedPath}\n`);
  if (execution.notes.length > 0) {
    context.stdout.write(`Notes: ${execution.notes.join(" | ")}\n`);
  }
}
