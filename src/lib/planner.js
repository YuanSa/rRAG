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

export async function buildUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot }) {
  return buildHeuristicUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot });
}

export async function buildUpdatePlanWithLlm({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot, llm }) {
  if (!llm?.configured) {
    return buildHeuristicUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot });
  }

  try {
    const categoryMap = await collectSkillCategoryMap(categoriesRoot);
    const response = await llm.generateJson({
      system: "You are a conservative knowledge base planning assistant. Prefer update only when the new material clearly belongs to the same core question. Prefer create when unsure. Keep categories short and reusable.",
      user: buildPlannerPrompt(stagedTexts, skillSummaries, categoryMap),
      schemaHint: JSON.stringify({
        decisions: [
          {
            source: "relative/path.md",
            type: "create_skill | update_skill",
            skillId: "required for update_skill",
            title: "string",
            summary: "string",
            content: "full markdown skill content",
            categories: ["Category", "Sub/Category"]
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
      system: "You are a knowledge base review assistant. Review the proposed decisions conservatively and summarize risks or better alternatives in markdown.",
      user: JSON.stringify({ stagedTexts: stagedTexts.map(item => item.relativePath), skillCount: skillSummaries.length, stagedDecisions }, null, 2)
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
      source: staged.relativePath
    };
  }

  return {
    type: "create_skill",
    title,
    content,
    summary,
    categories,
    source: staged.relativePath
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
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
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

function buildPlannerPrompt(stagedTexts, skillSummaries, categoryMap) {
  return JSON.stringify({
    stagedTexts: stagedTexts.map(item => ({
      source: item.relativePath,
      content: item.content
    })),
    existingSkills: skillSummaries.map(skill => ({
      id: skill.id,
      title: skill.title,
      summary: skill.summary,
      categories: categoryMap.get(skill.id) ?? []
    }))
  }, null, 2);
}

function normalizeLlmDecision(decision, staged) {
  const title = String(decision.title || deriveTitle(staged)).slice(0, 120);
  const summary = String(decision.summary || deriveSummary(staged.content));
  const content = String(decision.content || `# ${title}\n\n${staged.content.trim()}`);
  const rawCategories = Array.isArray(decision.categories) ? decision.categories : [DEFAULT_CATEGORY];
  const categories = dedupe(rawCategories.map(item => String(item).trim()).filter(Boolean));
  const type = decision.type === "update_skill" ? "update_skill" : "create_skill";

  return {
    type,
    skillId: decision.skillId ? String(decision.skillId) : undefined,
    title,
    summary,
    content,
    categories: categories.length > 0 ? categories : [DEFAULT_CATEGORY],
    source: staged.relativePath
  };
}
