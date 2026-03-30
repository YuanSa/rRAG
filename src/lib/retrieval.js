import { readdir } from "node:fs/promises";
import path from "node:path";
import { selectBranchesWithFallback } from "./branch-selector.js";
import { readSkillContent, readSkillMeta } from "./fs-api.js";

export async function collectCategoryLinks(categoriesRoot) {
  const links = [];

  async function walk(currentPath, categoryParts) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, [...categoryParts, entry.name]);
      } else if (entry.isSymbolicLink()) {
        links.push({
          skillId: entry.name,
          categoryPath: categoryParts.join("/")
        });
      }
    }
  }

  await walk(categoriesRoot, []);
  return links;
}

export async function collectSkillCategoryMap(categoriesRoot) {
  const links = await collectCategoryLinks(categoriesRoot);
  const map = new Map();
  for (const link of links) {
    const existing = map.get(link.skillId) ?? [];
    existing.push(link.categoryPath);
    map.set(link.skillId, existing);
  }
  return map;
}

export async function retrieveRelevantPassages({
  question,
  skillsRoot,
  categoriesRoot,
  maxSkills = 5,
  maxPassagesPerSkill = 3,
  llm = null,
  maxBranches = 3,
  maxDepth = 4,
  branchMinScore = 1,
  branchScoreMargin = 3
}) {
  const questionTokens = tokenize(question);
  const traversal = await traverseCategories({
    categoriesRoot,
    skillsRoot,
    question,
    llm,
    questionTokens,
    maxBranches,
    maxDepth,
    branchMinScore,
    branchScoreMargin
  });
  const candidateSkillMap = new Map();

  for (const node of traversal.visited) {
    for (const skillId of node.skillIds) {
      const existing = candidateSkillMap.get(skillId) ?? {
        skillId,
        categoryPaths: []
      };
      existing.categoryPaths.push(node.path || "(root)");
      candidateSkillMap.set(skillId, existing);
    }
  }

  const fallbackLinks = await collectCategoryLinks(categoriesRoot);
  for (const link of fallbackLinks) {
    if (!candidateSkillMap.has(link.skillId)) {
      const score = scoreText(questionTokens, link.categoryPath);
      if (score > 0) {
        candidateSkillMap.set(link.skillId, {
          skillId: link.skillId,
          categoryPaths: [link.categoryPath],
          fallback: true
        });
      }
    }
  }

  const candidates = [];
  for (const candidateBase of candidateSkillMap.values()) {
    const skillId = candidateBase.skillId;
    const meta = await readSkillMeta(skillsRoot, skillId);
    const categoryPaths = [...new Set(candidateBase.categoryPaths)].filter(Boolean);
    const summaryText = `${meta.title} ${meta.summary} ${categoryPaths.join(" ")}`;
    const score = scoreText(questionTokens, summaryText);
    candidates.push({
      skillId,
      title: meta.title,
      summary: meta.summary,
      categoryPaths,
      score
    });
  }

  const selected = candidates
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, maxSkills);

  const results = [];
  for (const candidate of selected) {
    const content = await readSkillContent(skillsRoot, candidate.skillId);
    const passages = extractRelevantPassages(content, questionTokens, maxPassagesPerSkill);
    if (passages.length === 0 && candidate.score < 4) {
      continue;
    }
    const bestPassageScore = passages[0]?.score ?? 0;
    results.push({
      ...candidate,
      bestPassageScore,
      passages,
      traversal
    });
  }

  const bestOverallScore = Math.max(...results.map(result => result.bestPassageScore || result.score), 0);
  return results.filter(result => {
    const combinedScore = result.bestPassageScore || result.score;
    if (bestOverallScore <= 4) {
      return combinedScore > 0;
    }
    return combinedScore >= Math.max(3, bestOverallScore - 4);
  });
}

export async function traverseCategories({
  categoriesRoot,
  skillsRoot,
  question,
  llm,
  questionTokens,
  maxBranches = 3,
  maxDepth = 4,
  branchMinScore = 1,
  branchScoreMargin = 3
}) {
  const visited = [];
  const skillMetaCache = new Map();

  async function walk(currentPath, parts, depth) {
    if (depth > maxDepth) {
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    const childCategories = [];
    const skillIds = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        const subtreeHint = await collectSubtreeHint(fullPath, skillsRoot, skillMetaCache);
        childCategories.push({
          name: entry.name,
          fullPath,
          hint: subtreeHint,
          score: scoreText(questionTokens, `${entry.name} ${subtreeHint}`)
        });
      } else if (entry.isSymbolicLink()) {
        skillIds.push(entry.name);
      }
    }

    const currentLabel = parts.join(" ");
    const nodeScore = scoreText(questionTokens, currentLabel);
    const shouldKeep = parts.length === 0 || nodeScore > 0 || childCategories.some(child => child.score > 0) || skillIds.length > 0;

    if (!shouldKeep) {
      return;
    }

    visited.push({
      path: parts.join("/"),
      depth,
      score: nodeScore,
      childCategories: childCategories.map(child => ({ name: child.name, score: child.score })),
      skillIds
    });

    const branchSelection = await selectBranchesWithFallback({
      llm,
      question,
      parentPath: parts.join("/") || "(root)",
      childCategories,
      maxBranches,
      minScore: branchMinScore,
      scoreMargin: branchScoreMargin
    });
    visited[visited.length - 1].selectorMode = branchSelection.mode;
    visited[visited.length - 1].selectedChildren = branchSelection.selected.map(child => child.name);
    const nextChildren = branchSelection.selected;

    for (const child of nextChildren) {
      await walk(child.fullPath, [...parts, child.name], depth + 1);
    }
  }

  await walk(categoriesRoot, [], 0);
  return { visited };
}

async function collectSubtreeHint(categoryPath, skillsRoot, cache) {
  const skillIds = await collectSkillIdsUnder(categoryPath);
  const hints = [];

  for (const skillId of skillIds) {
    if (!cache.has(skillId)) {
      try {
        const meta = await readSkillMeta(skillsRoot, skillId);
        cache.set(skillId, `${meta.title} ${meta.summary}`);
      } catch {
        cache.set(skillId, "");
      }
    }
    const hint = cache.get(skillId);
    if (hint) {
      hints.push(hint);
    }
    if (hints.length >= 4) {
      break;
    }
  }

  return hints.join(" ");
}

async function collectSkillIdsUnder(categoryPath) {
  const skillIds = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isSymbolicLink()) {
        skillIds.push(entry.name);
      }
    }
  }

  await walk(categoryPath);
  return [...new Set(skillIds)];
}

export function extractRelevantPassages(content, questionTokens, limit) {
  const sections = splitIntoSections(content);
  const seen = new Set();

  return sections
    .map(section => ({
      text: section,
      score: scoreText(questionTokens, section)
    }))
    .filter(section => section.score > 0)
    .filter(section => {
      const normalized = normalizePassage(section.text);
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, limit);
}

function splitIntoSections(content) {
  const normalized = content.trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\n\s*\n/g)
    .map(section => section.trim())
    .filter(Boolean);
}

function scoreText(questionTokens, text) {
  const textTokens = new Set(tokenize(text));
  let score = 0;
  for (const token of questionTokens) {
    if (textTokens.has(token)) {
      score += token.length > 4 ? 3 : 1;
    }
  }
  return score;
}

function tokenize(text) {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
  const expanded = [];
  for (const token of raw) {
    expanded.push(token);
    if (token.endsWith("s") && token.length > 3) {
      expanded.push(token.slice(0, -1));
    }
  }
  return expanded;
}

function normalizePassage(text) {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
