import { readdir } from "node:fs/promises";
import path from "node:path";
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

export async function retrieveRelevantPassages({ question, skillsRoot, categoriesRoot, maxSkills = 5, maxPassagesPerSkill = 3 }) {
  const links = await collectCategoryLinks(categoriesRoot);
  const uniqueSkillIds = [...new Set(links.map(link => link.skillId))];
  const questionTokens = tokenize(question);

  const candidates = [];
  for (const skillId of uniqueSkillIds) {
    const meta = await readSkillMeta(skillsRoot, skillId);
    const categoryPaths = links.filter(link => link.skillId === skillId).map(link => link.categoryPath);
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
    results.push({
      ...candidate,
      passages
    });
  }

  return results;
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
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function normalizePassage(text) {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
