import { readdir } from "node:fs/promises";
import path from "node:path";
import { readSkillMeta } from "./fs-api.js";

export async function listSkillIds(skillsRoot) {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

export async function collectSkillSummaries(skillsRoot) {
  const skillIds = await listSkillIds(skillsRoot);
  const summaries = [];
  for (const skillId of skillIds) {
    const meta = await readSkillMeta(skillsRoot, skillId);
    summaries.push({
      id: skillId,
      title: meta.title,
      summary: meta.summary,
      updated_at: meta.updated_at,
      path: path.join(skillsRoot, skillId)
    });
  }
  return summaries;
}
