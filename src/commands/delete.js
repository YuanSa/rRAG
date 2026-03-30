import { archiveSkill, skillExists, unlinkSkill } from "../lib/fs-api.js";
import { collectCategoryLinks } from "../lib/retrieval.js";

export async function handleDelete(args, context) {
  const skillId = args[0];
  if (!skillId) {
    throw new Error("delete requires a skill_id");
  }

  if (!(await skillExists(context.paths.skills, skillId))) {
    throw new Error(`skill not found: ${skillId}`);
  }

  const links = await collectCategoryLinks(context.paths.categories);
  const skillLinks = links.filter(link => link.skillId === skillId);
  for (const link of skillLinks) {
    await unlinkSkill(context.paths.categories, skillId, link.categoryPath);
  }
  await archiveSkill(context.paths.skills, context.paths.archive, skillId);

  context.stdout.write(`Archived skill: ${skillId}\n`);
  context.stdout.write(`Removed links: ${skillLinks.length}\n`);
}
