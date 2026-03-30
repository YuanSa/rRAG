import { readSkillContent } from "./fs-api.js";
import { collectSkillCategoryMap } from "./retrieval.js";

const DEFAULT_CATEGORY = "Imported";
const CATEGORY_RULES = [
  { name: "Agents", keywords: ["agent", "agents", "loop", "loops", "planner", "planning", "autonomous"] },
  { name: "Retrieval", keywords: ["retrieval", "rag", "search", "bfs", "beam", "recall", "passage"] },
  { name: "Knowledge-Base", keywords: ["knowledge", "skill", "skills", "category", "taxonomy", "classify"] },
  { name: "Prompting", keywords: ["prompt", "prompts", "instruction", "reasoning"] }
];

export async function buildUpdatePlan({ stagedTexts, skillSummaries, categoriesRoot, skillsRoot }) {
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
    stagedDecisions
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
  const categories = [];

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => tokens.includes(keyword))) {
      categories.push(rule.name);
    }
  }

  if (categories.length === 0) {
    categories.push(DEFAULT_CATEGORY);
  }

  return dedupe(categories);
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
