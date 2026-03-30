import { archiveSkill, createCategory, createSkill, linkSkill, skillExists, unlinkSkill, updateSkill } from "./fs-api.js";
import { markTodoItemDone } from "./run-artifacts.js";

export async function executePlan({ runPath, plan, context }) {
  const execution = {
    ok: true,
    mode: "heuristic-plan",
    createdSkills: [],
    updatedSkills: [],
    linkedSkills: [],
    archivedSkills: [],
    notes: []
  };

  const state = new Map();

  try {
    for (let index = 0; index < plan.length; index += 1) {
      const item = plan[index];
      const result = await executeItem(item, state, context);
      const note = result?.note ?? "done";
      await markTodoItemDone(runPath, index, note);

      if (result?.createdSkill) {
        execution.createdSkills.push(result.createdSkill);
      }
      if (result?.updatedSkill) {
        execution.updatedSkills.push(result.updatedSkill);
      }
      if (result?.linkedSkill) {
        execution.linkedSkills.push(result.linkedSkill);
      }
      if (result?.archivedSkill) {
        execution.archivedSkills.push(result.archivedSkill);
      }
    }

    if (execution.createdSkills.length > 0) {
      execution.notes.push(`Created ${execution.createdSkills.length} skill(s)`);
    }
    if (execution.updatedSkills.length > 0) {
      execution.notes.push(`Updated ${execution.updatedSkills.length} skill(s)`);
    }
  } catch (error) {
    execution.ok = false;
    execution.notes.push(error instanceof Error ? error.message : String(error));
    throw error;
  }

  return execution;
}

async function executeItem(item, state, context) {
  const data = item.data ?? {};
  switch (item.action) {
    case "create_category":
      await createCategory(context.paths.categories, data.categoryPath);
      return { note: `created-or-confirmed ${data.categoryPath}` };
    case "review_input":
      return { note: "reviewed heuristically" };
    case "review_skills":
    case "review_plan":
    case "scan_categories":
    case "scan_skills":
    case "review_duplicates":
      return { note: "reviewed" };
    case "create_skill": {
      const skillId = await createSkill(context.paths.skills, {
        title: data.title,
        content: data.content,
        summary: data.summary
      });
      state.set(data.stagedRelativePath, skillId);
      return {
        note: `created ${skillId}`,
        createdSkill: {
          id: skillId,
          title: data.title,
          source: data.stagedRelativePath
        }
      };
    }
    case "update_skill": {
      await updateSkill(context.paths.skills, data.skillId, {
        title: data.title,
        content: data.content,
        summary: data.summary
      });
      state.set(data.stagedRelativePath, data.skillId);
      return {
        note: `updated ${data.skillId}`,
        updatedSkill: {
          id: data.skillId,
          title: data.title,
          source: data.stagedRelativePath
        }
      };
    }
    case "link_skill": {
      const skillId = data.skillId ?? state.get(data.stagedRelativePath);
      if (!skillId) {
        throw new Error(`link_skill missing skill id for ${data.stagedRelativePath ?? item.text}`);
      }
      await linkSkill(context.paths.skills, context.paths.categories, skillId, data.categoryPath);
      return {
        note: `linked ${skillId} -> ${data.categoryPath}`,
        linkedSkill: {
          id: skillId,
          categoryPath: data.categoryPath
        }
      };
    }
    case "unlink_skill":
      await unlinkSkill(context.paths.categories, data.skillId, data.categoryPath);
      return { note: `unlinked ${data.skillId} from ${data.categoryPath}` };
    case "archive_skill":
      if (!(await skillExists(context.paths.skills, data.skillId))) {
        return { note: `already archived ${data.skillId}` };
      }
      await archiveSkill(context.paths.skills, context.paths.archive, data.skillId);
      return {
        note: `archived ${data.skillId}`,
        archivedSkill: {
          id: data.skillId
        }
      };
    default:
      return { note: "skipped unsupported action" };
  }
}
