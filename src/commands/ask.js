import { retrieveRelevantPassages } from "../lib/retrieval.js";
import { synthesizeGroundedAnswer } from "../lib/answer.js";
import { createRunDirectory, writeMarkdownArtifact, writeRunManifest, writeSummary } from "../lib/run-artifacts.js";

export async function handleAsk(args, context) {
  const question = args.join(" ").trim();
  if (!question) {
    throw new Error('ask requires a question, e.g. rrag ask "What is ...?"');
  }

  const results = await retrieveRelevantPassages({
    question,
    skillsRoot: context.paths.skills,
    categoriesRoot: context.paths.categories,
    maxSkills: context.config.max_full_skill_reads,
    maxPassagesPerSkill: context.config.max_passages_per_skill,
    llm: context.llm,
    maxBranches: context.config.branch_max_per_level,
    maxDepth: context.config.max_depth,
    branchMinScore: context.config.branch_min_score,
    branchScoreMargin: context.config.branch_score_margin
  });

  context.stdout.write(`# Ask\n\n`);
  context.stdout.write(`Question: ${question}\n`);

  if (results.length === 0) {
    await persistAskRun({
      context,
      question,
      answer: "I don't know.",
      results,
      traversal: null
    });
    context.stdout.write(`\nI don't know.\n`);
    context.stdout.write("No relevant skill summaries or passages were matched by the current heuristic retriever.\n");
    return;
  }

  const answer = await synthesizeGroundedAnswer({ question, results, llm: context.llm });
  const traversal = results[0]?.traversal;
  await persistAskRun({
    context,
    question,
    answer,
    results,
    traversal
  });

  context.stdout.write(`Matched skills: ${results.length}\n\n`);
  context.stdout.write(`Answer: ${answer}\n\n`);
  if (traversal?.visited?.length) {
    context.stdout.write("Traversal:\n");
    for (const node of traversal.visited) {
      const label = node.path || "(root)";
      const selectedChildren = node.selectedChildren?.length ? ` selected=${node.selectedChildren.join(",")}` : "";
      const selectorMode = node.selectorMode ? ` selector=${node.selectorMode}` : "";
      context.stdout.write(`- ${label} [depth=${node.depth} score=${node.score} skills=${node.skillIds.length}${selectorMode}${selectedChildren}]\n`);
    }
    context.stdout.write("\n");
  }
  for (const result of results) {
    context.stdout.write(`## ${result.title}\n`);
    context.stdout.write(`- skill_id: ${result.skillId}\n`);
    context.stdout.write(`- categories: ${result.categoryPaths.join(", ") || "(unlinked)"}\n`);
    context.stdout.write(`- summary: ${result.summary}\n`);
    if (result.passages.length === 0) {
      context.stdout.write(`- passages: no high-confidence passage match; summary match only\n\n`);
      continue;
    }
    context.stdout.write(`- passages:\n`);
    for (const passage of result.passages) {
      context.stdout.write(`  - (${passage.score}) ${oneLine(passage.text)}\n`);
    }
    context.stdout.write(`\n`);
  }

  context.stdout.write("This is still a deterministic placeholder for the future LLM-guided tree search and passage extraction flow.\n");
}

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function persistAskRun({ context, question, answer, results, traversal }) {
  const { runId, runPath } = await createRunDirectory(context.paths.runs);
  const rendered = renderAskArtifact({ question, answer, results, traversal });
  await writeMarkdownArtifact(runPath, "answer.md", rendered);
  await writeRunManifest(runPath, {
    mode: "ask",
    run_id: runId,
    created_at: new Date().toISOString(),
    question,
    state: {
      status: "executed",
      updated_at: new Date().toISOString()
    },
    retrieval: traversal ?? { visited: [] },
    result_count: results.length,
    results: results.map(result => ({
      skillId: result.skillId,
      title: result.title,
      categories: result.categoryPaths,
      summary: result.summary,
      bestPassageScore: result.bestPassageScore ?? 0,
      passages: result.passages.map(passage => ({
        score: passage.score,
        text: passage.text
      }))
    }))
  });
  await writeSummary(runPath, {
    mode: "ask",
    question,
    result_count: results.length,
    answer_preview: answer.slice(0, 200)
  });
}

function renderAskArtifact({ question, answer, results, traversal }) {
  const lines = [
    "# Ask Run",
    "",
    `Question: ${question}`,
    "",
    `Answer: ${answer}`,
    ""
  ];

  if (traversal?.visited?.length) {
    lines.push("## Traversal");
    lines.push("");
    for (const node of traversal.visited) {
      const label = node.path || "(root)";
      const selected = node.selectedChildren?.length ? ` selected=${node.selectedChildren.join(",")}` : "";
      const selector = node.selectorMode ? ` selector=${node.selectorMode}` : "";
      lines.push(`- ${label} [depth=${node.depth} score=${node.score} skills=${node.skillIds.length}${selector}${selected}]`);
    }
    lines.push("");
  }

  lines.push("## Results");
  lines.push("");
  if (results.length === 0) {
    lines.push("No matching skills.");
    return lines.join("\n");
  }

  for (const result of results) {
    lines.push(`### ${result.title}`);
    lines.push(`- skill_id: ${result.skillId}`);
    lines.push(`- categories: ${result.categoryPaths.join(", ") || "(unlinked)"}`);
    lines.push(`- summary: ${result.summary}`);
    if (result.passages.length === 0) {
      lines.push("- passages: none");
      lines.push("");
      continue;
    }
    lines.push("- passages:");
    for (const passage of result.passages) {
      lines.push(`  - (${passage.score}) ${oneLine(passage.text)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
