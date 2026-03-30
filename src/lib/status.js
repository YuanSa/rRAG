import { readdir } from "node:fs/promises";
import path from "node:path";
import { collectSkillSummaries } from "./skill-discovery.js";
import { collectCategoryLinks } from "./retrieval.js";

export async function collectRepoStatus(paths) {
  const skills = await collectSkillSummaries(paths.skills);
  const links = await collectCategoryLinks(paths.categories);
  const categories = await collectCategoryPaths(paths.categories);
  const archivedSkills = await countArchivedSkills(path.join(paths.archive, "skills"));
  const archivedStaging = await countDirectories(paths.archiveStaging);
  const runs = await countDirectories(paths.runs);

  return {
    skills: skills.length,
    archivedSkills,
    links: links.length,
    categories: categories.length,
    archivedStaging,
    runs,
    topCategories: summarizeTopCategories(links),
    unlinkedSkills: skills.filter(skill => !links.some(link => link.skillId === skill.id)).map(skill => skill.id)
  };
}

async function collectCategoryPaths(categoriesRoot) {
  const paths = [];

  async function walk(currentPath, parts) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) {
        continue;
      }
      const nextParts = [...parts, entry.name];
      paths.push(nextParts.join("/"));
      await walk(path.join(currentPath, entry.name), nextParts);
    }
  }

  await walk(categoriesRoot, []);
  return paths;
}

async function countDirectories(rootPath) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).length;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

function summarizeTopCategories(links) {
  const counts = new Map();
  for (const link of links) {
    const top = link.categoryPath.split("/")[0];
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
}

async function countArchivedSkills(archiveSkillsRoot) {
  return countDirectories(archiveSkillsRoot);
}
