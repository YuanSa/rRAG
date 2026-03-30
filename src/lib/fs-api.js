import { cp, mkdir, readFile, readdir, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function listCategories(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

export async function listSkills(categoryPath) {
  const entries = await readdir(categoryPath, { withFileTypes: true });
  return entries.filter(entry => entry.isSymbolicLink()).map(entry => entry.name).sort();
}

export async function readSkillMeta(skillsRoot, skillId) {
  const metaPath = path.join(skillsRoot, skillId, "meta.json");
  const raw = await readFile(metaPath, "utf8");
  return JSON.parse(raw);
}

export async function readSkillContent(skillsRoot, skillId) {
  return readFile(path.join(skillsRoot, skillId, "content.md"), "utf8");
}

export async function createSkill(skillsRoot, { title, content, summary }) {
  const skillId = randomUUID();
  const skillPath = path.join(skillsRoot, skillId);
  const now = new Date().toISOString();
  await mkdir(skillPath, { recursive: true });
  await writeFile(path.join(skillPath, "content.md"), `${content.trim()}\n`, "utf8");
  await writeFile(
    path.join(skillPath, "meta.json"),
    `${JSON.stringify({ id: skillId, title, summary, created_at: now, updated_at: now }, null, 2)}\n`,
    "utf8"
  );
  return skillId;
}

export async function updateSkill(skillsRoot, skillId, { title, content, summary }) {
  const meta = await readSkillMeta(skillsRoot, skillId);
  const updated = {
    ...meta,
    title: title ?? meta.title,
    summary: summary ?? meta.summary,
    updated_at: new Date().toISOString()
  };
  await writeFile(path.join(skillsRoot, skillId, "content.md"), `${content.trim()}\n`, "utf8");
  await writeFile(path.join(skillsRoot, skillId, "meta.json"), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
}

export async function archiveSkill(skillsRoot, archiveRoot, skillId) {
  const source = path.join(skillsRoot, skillId);
  const target = path.join(archiveRoot, "skills", skillId);
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await rename(source, target);
}

export async function createCategory(categoriesRoot, categoryPath) {
  await mkdir(path.join(categoriesRoot, categoryPath), { recursive: true });
}

export async function removeCategoryIfEmpty(categoriesRoot, categoryPath) {
  const targetPath = path.join(categoriesRoot, categoryPath);
  let entries;
  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  if (entries.length > 0) {
    return false;
  }
  await rm(targetPath, { recursive: true, force: false });
  await pruneEmptyCategoryDirs(categoriesRoot, path.dirname(targetPath));
  return true;
}

export async function linkSkill(skillsRoot, categoriesRoot, skillId, categoryPath) {
  const categoryDir = path.join(categoriesRoot, categoryPath);
  await mkdir(categoryDir, { recursive: true });
  const linkPath = path.join(categoryDir, skillId);
  const targetPath = path.relative(categoryDir, path.join(skillsRoot, skillId));
  try {
    await symlink(targetPath, linkPath);
  } catch (error) {
    if (error && error.code !== "EEXIST") {
      throw error;
    }
  }
}

export async function unlinkSkill(categoriesRoot, skillId, categoryPath) {
  const linkPath = path.join(categoriesRoot, categoryPath, skillId);
  try {
    await unlink(linkPath);
    await pruneEmptyCategoryDirs(categoriesRoot, path.join(categoriesRoot, categoryPath));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function skillExists(skillsRoot, skillId) {
  try {
    const info = await stat(path.join(skillsRoot, skillId));
    return info.isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function validateRepo(repoPaths) {
  const checks = [];
  for (const key of ["skills", "categories", "staging", "archive", "archiveStaging", "runs"]) {
    const info = await stat(repoPaths[key]);
    checks.push({ path: repoPaths[key], ok: info.isDirectory() });
  }
  return {
    ok: checks.every(check => check.ok),
    checks
  };
}

async function pruneEmptyCategoryDirs(categoriesRoot, startPath) {
  let currentPath = startPath;

  while (currentPath.startsWith(categoriesRoot) && currentPath !== categoriesRoot) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    if (entries.length > 0) {
      break;
    }
    await rm(currentPath, { recursive: true, force: false });
    currentPath = path.dirname(currentPath);
  }
}
