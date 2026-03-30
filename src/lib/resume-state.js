export function buildResumeState(plan, manifest, completedTodo, startIndex) {
  const state = new Map();
  const createdBySource = new Map();
  const execution = manifest?.execution ?? {};
  const createdSkills = Array.isArray(execution.createdSkills) ? execution.createdSkills : [];

  for (const item of createdSkills) {
    if (item?.source && item?.id) {
      createdBySource.set(item.source, item.id);
    }
  }

  for (let index = 0; index < startIndex; index += 1) {
    const todoItem = completedTodo[index];
    if (!todoItem?.done) {
      continue;
    }

    const planItem = plan[index];
    const data = planItem?.data ?? {};
    if (planItem?.action === "create_skill" && data.stagedRelativePath) {
      const createdSkillId = createdBySource.get(data.stagedRelativePath);
      if (createdSkillId) {
        state.set(data.stagedRelativePath, createdSkillId);
      }
    }

    if (planItem?.action === "update_skill" && data.stagedRelativePath && data.skillId) {
      state.set(data.stagedRelativePath, data.skillId);
    }
  }

  return state;
}
