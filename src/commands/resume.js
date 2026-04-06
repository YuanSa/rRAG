import { executePlan } from "../lib/executor.js";
import { findFirstPendingTodoIndex, readPlan, readRunManifest, readSummary, readTodo, updateRunManifest, writeChangesSummary, writeCommitArtifacts, writeSummary } from "../lib/run-artifacts.js";
import { validateRepo } from "../lib/fs-api.js";
import { buildResumeState } from "../lib/resume-state.js";

export async function handleResume(args, context) {
  if (context.config.runs_enabled === false) {
    throw new Error("resume requires runs recording to be enabled");
  }
  const runId = args[0];
  if (!runId) {
    throw new Error("resume requires a run id, e.g. rrag resume 2026-03-30T02-28-24.304Z");
  }

  const runPath = `${context.paths.runs}/${runId}`;
  const manifest = await readRunManifest(runPath);
  const plan = await readPlan(runPath);
  const todo = await readTodo(runPath);
  const existingSummary = await safeReadSummary(runPath);
  const startIndex = findFirstPendingTodoIndex(todo);

  if (startIndex === -1) {
    context.stdout.write(`Run ${runId} has no pending TODO items.\n`);
    return;
  }

  const resumeState = buildResumeState(plan, manifest, todo, startIndex);

  await updateRunManifest(runPath, {
    state: {
      status: "executing",
      resumed_at: new Date().toISOString(),
      resume_from_index: startIndex
    }
  });

  const execution = await executePlan({
    runPath,
    plan,
    context,
    startIndex,
    state: resumeState,
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
  await updateRunManifest(runPath, {
    state: {
      status: execution.ok ? "executed" : "failed",
      resumed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    plan: await readTodo(runPath),
    execution
  });
  await writeChangesSummary(runPath, {
    mode: manifest.mode ?? "resume",
    runId,
    completedSteps: execution.completedSteps,
    validationOk: validation.ok
  });
  await writeCommitArtifacts(runPath, {
    mode: manifest.mode ?? "resume",
    runId,
    completedSteps: execution.completedSteps,
    validationOk: validation.ok
  });
  await writeSummary(runPath, {
    ...(existingSummary ?? {}),
    resumed: true,
    resumed_from_index: startIndex,
    recovered_state_entries: resumeState.size,
    execution_mode: execution.mode,
    completed_steps: execution.completedSteps,
    validation_ok: validation.ok
  });

  context.stdout.write(`Resumed run ${runId} from TODO index ${startIndex}.\n`);
  context.stdout.write(`Recovered staged mappings: ${resumeState.size}\n`);
  context.stdout.write(`Completed steps: ${execution.completedSteps}\n`);
  context.stdout.write(`Validation: ${validation.ok ? "ok" : "failed"}\n`);
}

async function safeReadSummary(runPath) {
  try {
    return await readSummary(runPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
