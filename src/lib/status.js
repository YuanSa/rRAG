import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { collectSkillSummaries } from "./skill-discovery.js";
import { collectCategoryLinks } from "./retrieval.js";

export async function collectRepoStatus(paths) {
  const skills = await collectSkillSummaries(paths.skills);
  const links = await collectCategoryLinks(paths.categories);
  const categories = await collectCategoryStats(paths.categories, links);
  const archivedSkills = await countArchivedSkills(path.join(paths.archive, "skills"));
  const archivedStaging = await countDirectories(paths.archiveStaging);
  const runs = await countDirectories(paths.runs);
  const runStates = await collectRunStates(paths.runs);
  const runModes = await collectRunModes(paths.runs);
  const askStats = await collectAskRunStats(paths.runs);

  return {
    skills: skills.length,
    archivedSkills,
    links: links.length,
    categories: categories.total,
    taxonomy: categories,
    redundantAncestorLinks: countRedundantAncestorLinks(links),
    archivedStaging,
    runs,
    runStates,
    runModes,
    askStats,
    topCategories: summarizeTopCategories(links),
    unlinkedSkills: skills.filter(skill => !links.some(link => link.skillId === skill.id)).map(skill => skill.id)
  };
}

async function collectCategoryStats(categoriesRoot, links) {
  const paths = [];
  let leafCount = 0;
  let maxDepth = 0;

  async function walk(currentPath, parts) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) {
        continue;
      }
      const nextParts = [...parts, entry.name];
      const categoryPath = nextParts.join("/");
      const categoryFullPath = path.join(currentPath, entry.name);
      const categoryEntries = await readdir(categoryFullPath, { withFileTypes: true });
      const hasNestedChildren = categoryEntries.some(candidate => candidate.isDirectory());
      paths.push(categoryPath);
      maxDepth = Math.max(maxDepth, nextParts.length);
      if (!hasNestedChildren) {
        leafCount += 1;
      }
      await walk(categoryFullPath, nextParts);
    }
  }

  await walk(categoriesRoot, []);
  return {
    total: paths.length,
    leafCount,
    maxDepth
  };
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

async function collectRunStates(runsRoot) {
  const counts = {
    planned: 0,
    executing: 0,
    executed: 0,
    failed: 0,
    unknown: 0
  };

  try {
    const entries = await readdir(runsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const runJsonPath = path.join(runsRoot, entry.name, "run.json");
      try {
        const raw = await readFile(runJsonPath, "utf8");
        const parsed = JSON.parse(raw);
        const status = inferRunStatus(parsed);
        counts[status] = (counts[status] ?? 0) + 1;
      } catch {
        counts.unknown += 1;
      }
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return counts;
    }
    throw error;
  }

  return counts;
}

async function collectRunModes(runsRoot) {
  const plannerModes = {};
  const selectorModes = {};

  try {
    const entries = await readdir(runsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const runJsonPath = path.join(runsRoot, entry.name, "run.json");
      try {
        const raw = await readFile(runJsonPath, "utf8");
        const parsed = JSON.parse(raw);
        const planner = parsed?.planner?.mode ?? "unspecified";
        plannerModes[planner] = (plannerModes[planner] ?? 0) + 1;
        if (Array.isArray(parsed?.retrieval?.visited)) {
          for (const node of parsed.retrieval.visited) {
            const selector = node.selectorMode ?? "unspecified";
            selectorModes[selector] = (selectorModes[selector] ?? 0) + 1;
          }
        }
      } catch {
        plannerModes.unspecified = (plannerModes.unspecified ?? 0) + 1;
      }
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { plannerModes, selectorModes };
    }
    throw error;
  }

  return { plannerModes, selectorModes };
}

async function collectAskRunStats(runsRoot) {
  const stats = {
    askRuns: 0,
    totalVisitedNodes: 0,
    maxDepthSeen: 0,
    totalResults: 0,
    truncatedRuns: 0,
    totalTraversalCacheHits: 0,
    totalTraversalCacheMisses: 0
  };

  try {
    const entries = await readdir(runsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const runJsonPath = path.join(runsRoot, entry.name, "run.json");
      try {
        const raw = await readFile(runJsonPath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed?.mode !== "ask") {
          continue;
        }
        stats.askRuns += 1;
        const visited = Array.isArray(parsed?.retrieval?.visited) ? parsed.retrieval.visited : [];
        stats.totalVisitedNodes += visited.length;
        const maxDepth = visited.length > 0 ? Math.max(...visited.map(node => node.depth ?? 0), 0) : 0;
        stats.maxDepthSeen = Math.max(stats.maxDepthSeen, maxDepth);
        stats.totalResults += Number(parsed?.result_count ?? 0);
        if (parsed?.retrieval?.truncated) {
          stats.truncatedRuns += 1;
        }
        stats.totalTraversalCacheHits += Number(parsed?.retrieval?.cache?.subtreeHintHits ?? 0);
        stats.totalTraversalCacheMisses += Number(parsed?.retrieval?.cache?.subtreeHintMisses ?? 0);
      } catch {
        continue;
      }
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return stats;
    }
    throw error;
  }

  return stats;
}

function inferRunStatus(run) {
  if (run?.execution?.ok === true) {
    return "executed";
  }
  if (run?.execution?.ok === false) {
    return "failed";
  }
  if (run?.state?.status === "executing" && Array.isArray(run?.plan) && run.plan.some(item => !item.done)) {
    return "planned";
  }
  if (run?.state?.status) {
    return run.state.status;
  }
  if (Array.isArray(run?.plan)) {
    const hasPending = run.plan.some(item => !item.done);
    return hasPending ? "planned" : "executed";
  }
  return "unknown";
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

function countRedundantAncestorLinks(links) {
  const bySkill = new Map();
  for (const link of links) {
    const paths = bySkill.get(link.skillId) ?? [];
    paths.push(link.categoryPath);
    bySkill.set(link.skillId, paths);
  }

  let count = 0;
  for (const paths of bySkill.values()) {
    const unique = [...new Set(paths)];
    count += unique.filter(candidate => unique.some(other => other !== candidate && other.startsWith(`${candidate}/`))).length;
  }
  return count;
}
