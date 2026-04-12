import { readSkillContent } from "./fs-api.js";
import { collectSkillCategoryMap } from "./retrieval.js";

const DEFAULT_CATEGORY = "Imported";
const CATEGORY_RULES = [
  { path: "Agents", keywords: ["agent", "agents"] },
  { path: "Agents/Loops", keywords: ["loop", "loops"] },
  { path: "Agents/Planning", keywords: ["planner", "planning", "plan", "plans"] },
  { path: "Retrieval", keywords: ["retrieval", "rag", "recall"] },
  { path: "Retrieval/Traversal", keywords: ["search", "bfs", "beam", "traversal", "branch"] },
  { path: "Retrieval/Passages", keywords: ["passage", "passages", "extract", "evidence"] },
  { path: "Knowledge-Base", keywords: ["knowledge", "skill", "skills"] },
  { path: "Knowledge-Base/Taxonomy", keywords: ["category", "categories", "taxonomy", "classify", "classification"] },
  { path: "Knowledge-Base/Maintenance", keywords: ["rebuild", "archive", "delete", "cleanup", "fallback"] },
  { path: "Prompting", keywords: ["prompt", "prompts", "instruction", "reasoning"] }
];
const PLANNER_RELATED_SKILL_LIMIT = 4;
const PLANNER_RELATED_CONTENT_CHARS = 1600;

export async function buildUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot }) {
  return buildHeuristicUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot });
}

export async function buildUpdatePlanWithLlm({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot, llm }) {
  if (!llm?.configured) {
    return buildHeuristicUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot });
  }

  try {
    const categoryMap = await collectSkillCategoryMap(categoriesRoot);
    const plannerContext = await buildPlannerContext({ stagedTexts, skillSummaries, categoryMap, skillsRoot });
    const response = await llm.generateJson({
      system: [
        "You are a conservative knowledge base planning assistant.",
        "Plan how to integrate staged materials into a filesystem knowledge base.",
        "Prefer update only when the new material clearly belongs to the same core question as an existing skill.",
        "Prefer create when unsure.",
        "Use short, reusable category paths.",
        "When existing category paths already fit, reuse them instead of inventing new ones.",
        "Use the related skill excerpts to decide whether a staged item should update an existing skill or become a new skill."
      ].join(" "),
      user: buildPlannerPrompt(plannerContext),
      schemaHint: JSON.stringify({
        decisions: [
          {
            source: "relative/path.md",
            type: "create_skill | update_skill",
            skillId: "required for update_skill",
            title: "string",
            summary: "string",
            content: "full markdown skill content",
            categories: ["Category", "Sub/Category"],
            rationale: "short reason"
          }
        ]
      }, null, 2)
    });

    const decisions = Array.isArray(response?.decisions) ? response.decisions : [];
    if (decisions.length !== stagedTexts.length) {
      throw new Error("LLM planner returned an unexpected number of decisions");
    }

    const plan = [];
    const createdCategories = new Set();
    const stagedDecisions = [];

    for (const staged of stagedTexts) {
      const decision = decisions.find(item => item.source === staged.relativePath);
      if (!decision) {
        throw new Error(`LLM planner omitted decision for ${staged.relativePath}`);
      }
      const normalized = normalizeLlmDecision(decision, staged);
      stagedDecisions.push(normalized);

      for (const categoryPath of normalized.categories) {
        if (!createdCategories.has(categoryPath)) {
          createdCategories.add(categoryPath);
          plan.push(createPlanItem("create_category", `Ensure category \`${categoryPath}\` exists`, { categoryPath }));
        }
      }

      plan.push(createPlanItem("review_input", `Inspect staged material \`${staged.relativePath}\``, { relativePath: staged.relativePath }));
      if (normalized.type === "update_skill") {
        plan.push(
          createPlanItem("update_skill", `Update skill \`${normalized.skillId}\` from \`${staged.relativePath}\``, {
            skillId: normalized.skillId,
            stagedRelativePath: staged.relativePath,
            title: normalized.title,
            content: normalized.content,
            summary: normalized.summary
          })
        );
      } else {
        plan.push(
          createPlanItem("create_skill", `Create a new skill from \`${staged.relativePath}\``, {
            stagedRelativePath: staged.relativePath,
            title: normalized.title,
            content: normalized.content,
            summary: normalized.summary
          })
        );
      }

      for (const categoryPath of normalized.categories) {
        plan.push(
          createPlanItem("link_skill", `Link the skill for \`${staged.relativePath}\` under \`${categoryPath}\``, {
            stagedRelativePath: staged.relativePath,
            categoryPath,
            skillId: normalized.type === "update_skill" ? normalized.skillId : undefined
          })
        );
      }
    }

    if (skillSummaries.length > 0) {
      plan.push(createPlanItem("review_skills", `Review ${skillSummaries.length} existing skill summaries against the staged materials`, {}));
    }
    plan.push(createPlanItem("review_plan", "Re-evaluate the full TODO list before finalizing execution", {}));

    return {
      plan,
      stagedDecisions,
      plannerMode: "llm"
    };
  } catch (error) {
    const fallback = await buildHeuristicUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot });
    return {
      ...fallback,
      plannerMode: "heuristic-fallback",
      plannerError: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function buildUpdateReviewWithLlm({ stagedTexts, skillSummaries, stagedDecisions, llm }) {
  if (!llm?.configured) {
    return buildUpdateReview({ stagedTexts, skillSummaries, stagedDecisions });
  }

  try {
    return await llm.generateText({
      system: [
        "You are a knowledge base review assistant.",
        "Review the proposed decisions conservatively.",
        "Look for over-eager updates, weak category choices, or places where create would be safer than update.",
        "Return concise markdown."
      ].join(" "),
      user: JSON.stringify({
        stagedTexts: stagedTexts.map(item => ({
          source: item.relativePath,
          preview: excerptContent(item.content, 400)
        })),
        skillCount: skillSummaries.length,
        stagedDecisions
      }, null, 2)
    });
  } catch {
    return buildUpdateReview({ stagedTexts, skillSummaries, stagedDecisions });
  }
}

async function buildHeuristicUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot }) {
  const categoryMap = await collectSkillCategoryMap(categoriesRoot);
  const plan = [];
  const createdCategories = new Set();
  const stagedDecisions = [];

  for (const staged of stagedTexts) {
    const decision = await decideForStagedText(staged, skillSummaries, categoryMap, skillsRoot);
    stagedDecisions.push(decision);

    for (const categoryPath of decision.categories) {
      if (!createdCategories.has(categoryPath)) {
        createdCategories.add(categoryPath);
        plan.push(createPlanItem("create_category", `Ensure category \`${categoryPath}\` exists`, { categoryPath }));
      }
    }

    plan.push(createPlanItem("review_input", `Inspect staged material \`${staged.relativePath}\``, { relativePath: staged.relativePath }));

    if (decision.type === "update_skill") {
      plan.push(
        createPlanItem("update_skill", `Update skill \`${decision.skillId}\` from \`${staged.relativePath}\``, {
          skillId: decision.skillId,
          stagedRelativePath: staged.relativePath,
          title: decision.title,
          content: decision.content,
          summary: decision.summary
        })
      );
    } else {
      plan.push(
        createPlanItem("create_skill", `Create a new skill from \`${staged.relativePath}\``, {
          stagedRelativePath: staged.relativePath,
          title: decision.title,
          content: decision.content,
          summary: decision.summary
        })
      );
    }

    for (const categoryPath of decision.categories) {
      plan.push(
        createPlanItem("link_skill", `Link the skill for \`${staged.relativePath}\` under \`${categoryPath}\``, {
          stagedRelativePath: staged.relativePath,
          categoryPath
        })
      );
    }
  }

  if (skillSummaries.length > 0) {
    plan.push(
      createPlanItem("review_skills", `Review ${skillSummaries.length} existing skill summaries against the staged materials`, {})
    );
  }
  plan.push(createPlanItem("review_plan", "Re-evaluate the full TODO list before finalizing execution", {}));

  return {
    plan,
    stagedDecisions,
    plannerMode: "heuristic"
  };
}

export function buildUpdateReview({ stagedTexts, skillSummaries, stagedDecisions }) {
  const lines = [
    "# Review",
    "",
    `- Staged text files: ${stagedTexts.length}`,
    `- Existing skills: ${skillSummaries.length}`,
    ""
  ];

  for (const decision of stagedDecisions) {
    const categories = decision.categories.join(", ");
    if (decision.type === "update_skill") {
      lines.push(`- Update \`${decision.skillId}\` using \`${decision.source}\` and link it under: ${categories}`);
    } else {
      lines.push(`- Create a new skill from \`${decision.source}\` and link it under: ${categories}`);
    }
    if (decision.rationale) {
      lines.push(`  rationale: ${decision.rationale}`);
    }
  }

  lines.push("");
  lines.push("This review is heuristic. Replace it with LLM planning and review to get semantic decisions.");
  return lines.join("\n");
}

async function decideForStagedText(staged, skillSummaries, categoryMap, skillsRoot) {
  const title = deriveTitle(staged);
  const normalizedBody = staged.content.trim();
  const categories = deriveCategories(`${title}\n${normalizedBody}`);
  const summary = deriveSummary(normalizedBody);
  const content = `# ${title}\n\n${normalizedBody}`;
  const match = findBestSkillMatch(title, normalizedBody, skillSummaries);

  if (match && match.score >= 10) {
    const existingCategories = categoryMap.get(match.id) ?? [];
    const existingContent = await readSkillContent(skillsRoot, match.id);
    return {
      type: "update_skill",
      skillId: match.id,
      title: match.title,
      content: appendUpdateSection(existingContent, staged.relativePath, normalizedBody),
      summary: mergeSummaries(match.summary, summary),
      categories: dedupe([...existingCategories, ...categories]),
      source: staged.relativePath,
      rationale: `Matched existing skill ${match.id} by overlapping title/summary tokens.`
    };
  }

  return {
    type: "create_skill",
    title,
    content,
    summary,
    categories,
    source: staged.relativePath,
    rationale: "No existing skill had a strong enough overlap score, so create a new skill."
  };
}

function findBestSkillMatch(title, body, skillSummaries) {
  const haystack = `${title} ${body}`;
  const targetTokens = tokenize(haystack);
  let best = null;

  for (const skill of skillSummaries) {
    const score = overlapScore(targetTokens, tokenize(`${skill.title} ${skill.summary}`));
    if (!best || score > best.score) {
      best = {
        ...skill,
        score
      };
    }
  }

  return best;
}

function deriveCategories(text) {
  const tokens = tokenize(text);
  const matched = [];

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => tokens.includes(keyword))) {
      matched.push(rule.path);
    }
  }

  if (matched.length === 0) {
    matched.push(DEFAULT_CATEGORY);
  }

  return collapseCategoryPaths(matched);
}

function deriveTitle(staged) {
  const line = staged.content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  if (line) {
    return line.replace(/^#+\s*/, "").slice(0, 80);
  }
  return staged.relativePath.replace(/\.[^.]+$/, "");
}

function deriveSummary(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lead = normalized.length <= 110 ? normalized : `${normalized.slice(0, 107)}...`;
  const keywords = extractSummaryKeywords(text);
  if (keywords.length === 0) {
    return lead;
  }
  const summary = `${lead} Keywords: ${keywords.join(", ")}`;
  return summary.length <= 220 ? summary : `${summary.slice(0, 217)}...`;
}

function appendUpdateSection(existingContent, relativePath, newBody) {
  const trimmedExisting = existingContent.trim();
  const section = `## Update from ${relativePath}\n\n${newBody}`;
  if (!trimmedExisting) {
    return section;
  }
  return `${trimmedExisting}\n\n${section}\n`;
}

function mergeSummaries(left, right) {
  if (!left) {
    return right;
  }
  if (!right || left.includes(right)) {
    return left;
  }
  if (right.includes(left)) {
    return right;
  }
  const combined = `${left} ${right}`.replace(/\s+/g, " ").trim();
  return combined.length <= 160 ? combined : `${combined.slice(0, 157)}...`;
}

function overlapScore(leftTokens, rightTokens) {
  const right = new Set(rightTokens);
  let score = 0;
  for (const token of leftTokens) {
    if (right.has(token)) {
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

function extractSummaryKeywords(text) {
  const counts = new Map();
  for (const token of tokenize(text)) {
    if (STOP_TOKENS.has(token) || token.length < 4) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([token]) => token);
}

const STOP_TOKENS = new Set([
  "about",
  "after",
  "also",
  "because",
  "before",
  "being",
  "between",
  "into",
  "just",
  "more",
  "most",
  "note",
  "should",
  "some",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "those",
  "through",
  "update",
  "using",
  "with",
  "from",
  "have",
  "when",
  "where",
  "which",
  "will",
  "would"
]);

function createPlanItem(action, text, data) {
  return {
    done: false,
    action,
    text,
    note: null,
    data
  };
}

function dedupe(items) {
  return [...new Set(items)];
}

function collapseCategoryPaths(paths) {
  const unique = dedupe(paths).sort();
  const kept = [];

  for (const candidate of unique) {
    const isCoveredByDeeperPath = unique.some(other => other !== candidate && other.startsWith(`${candidate}/`));
    if (!isCoveredByDeeperPath) {
      kept.push(candidate);
    }
  }

  return kept.length > 0 ? kept : [DEFAULT_CATEGORY];
}

async function buildPlannerContext({ stagedTexts, skillSummaries, categoryMap, skillsRoot }) {
  const existingCategories = summarizeExistingCategories(skillSummaries, categoryMap);
  const stagedItems = [];

  for (const item of stagedTexts) {
    const relatedSkills = await collectRelatedSkillsForPrompt(item, skillSummaries, categoryMap, skillsRoot);
    stagedItems.push({
      source: item.relativePath,
      proposedTitle: deriveTitle(item),
      content: item.content,
      relatedSkills
    });
  }

  return {
    stagedItems,
    existingCategories,
    existingSkillCount: skillSummaries.length
  };
}

function buildPlannerPrompt(context) {
  return JSON.stringify(context, null, 2);
}

function normalizeLlmDecision(decision, staged) {
  const title = String(decision.title || deriveTitle(staged)).slice(0, 120);
  const summary = String(decision.summary || deriveSummary(staged.content));
  const content = String(decision.content || `# ${title}\n\n${staged.content.trim()}`);
  const rawCategories = Array.isArray(decision.categories) ? decision.categories : [DEFAULT_CATEGORY];
  const categories = collapseCategoryPaths(rawCategories.map(item => String(item).trim()).filter(Boolean));
  const type = decision.type === "update_skill" ? "update_skill" : "create_skill";
  const rationale = typeof decision.rationale === "string" ? decision.rationale.trim() : "";

  return {
    type,
    skillId: decision.skillId ? String(decision.skillId) : undefined,
    title,
    summary,
    content,
    categories: categories.length > 0 ? categories : [DEFAULT_CATEGORY],
    source: staged.relativePath,
    rationale
  };
}

async function collectRelatedSkillsForPrompt(staged, skillSummaries, categoryMap, skillsRoot) {
  const title = deriveTitle(staged);
  const body = staged.content.trim();
  const matches = rankSkillMatches(title, body, skillSummaries)
    .slice(0, PLANNER_RELATED_SKILL_LIMIT);

  const related = [];
  for (const match of matches) {
    const fullContent = await safeReadSkillContent(skillsRoot, match.id);
    related.push({
      id: match.id,
      title: match.title,
      summary: match.summary,
      categories: categoryMap.get(match.id) ?? [],
      overlapScore: match.score,
      contentExcerpt: excerptContent(fullContent, PLANNER_RELATED_CONTENT_CHARS)
    });
  }
  return related;
}

function rankSkillMatches(title, body, skillSummaries) {
  const haystack = `${title} ${body}`;
  const targetTokens = tokenize(haystack);
  return skillSummaries
    .map(skill => ({
      ...skill,
      score: overlapScore(targetTokens, tokenize(`${skill.title} ${skill.summary}`))
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function summarizeExistingCategories(skillSummaries, categoryMap) {
  const counts = new Map();
  for (const skill of skillSummaries) {
    const categories = categoryMap.get(skill.id) ?? [];
    for (const categoryPath of categories) {
      counts.set(categoryPath, (counts.get(categoryPath) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([path, count]) => ({ path, count }));
}

function excerptContent(content, maxChars) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 3)}...`;
}

async function safeReadSkillContent(skillsRoot, skillId) {
  try {
    return await readSkillContent(skillsRoot, skillId);
  } catch {
    return "";
  }
}
