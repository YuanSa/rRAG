import { retrieveRelevantPassages } from "../lib/retrieval.js";
import { synthesizeGroundedAnswer } from "../lib/answer.js";
import { createRunDirectory, writeMarkdownArtifact, writeRunManifest, writeSummary } from "../lib/run-artifacts.js";

export async function handleAsk(args, context) {
  const unknownOption = args.find(arg => arg.startsWith("-") && arg !== "--explain");
  if (unknownOption) {
    throw new Error(`unknown ask option "${unknownOption}"`);
  }
  const explain = args.includes("--explain");
  const filteredArgs = args.filter(arg => arg !== "--explain");
  const question = filteredArgs.join(" ").trim();
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
    maxTotalNodes: context.config.max_total_nodes,
    branchMinScore: context.config.branch_min_score,
    branchScoreMargin: context.config.branch_score_margin
  });

  if (results.length === 0) {
    await persistAskRun({
      context,
      question,
      answer: "I don't know.",
      results,
      traversal: null
    });
    if (context.config.ask_error_on_no_answer !== false) {
      throw new Error(`ask could not find any matching skills for: ${question}`);
    }
    context.stdout.write("I don't know.\n");
    if (explain) {
      context.stdout.write("\n# Explain\n\n");
      context.stdout.write("No relevant skill summaries or passages were matched.\n");
    }
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

  if (isNoAnswer(answer) && context.config.ask_error_on_no_answer !== false) {
    throw new Error(`ask could not derive an answer from the matched skills for: ${question}`);
  }

  context.stdout.write(`${answer}\n`);

  if (!explain) {
    return;
  }

  context.stdout.write("\n# Explain\n\n");
  context.stdout.write(`Question: ${question}\n`);
  context.stdout.write(`Matched skills: ${results.length}\n\n`);
  if (traversal?.visited?.length) {
    context.stdout.write("Traversal:\n");
    for (const node of traversal.visited) {
      const label = node.path || "(root)";
      const selectedChildren = node.selectedChildren?.length ? ` selected=${node.selectedChildren.join(",")}` : "";
      const selectorMode = node.selectorMode ? ` selector=${node.selectorMode}` : "";
      const selectorRationale = node.selectorRationale ? ` rationale=${JSON.stringify(node.selectorRationale)}` : "";
      context.stdout.write(`- ${label} [depth=${node.depth} score=${node.score} skills=${node.skillIds.length}${selectorMode}${selectedChildren}${selectorRationale}]\n`);
    }
    if (traversal.truncated) {
      context.stdout.write(`- traversal_budget: stopped early (${traversal.stopReason})\n`);
    }
    if (traversal.cache) {
      context.stdout.write(`- traversal_cache: subtree_hints=${traversal.cache.subtreeHintEntries} skill_meta=${traversal.cache.skillMetaEntries} hits=${traversal.cache.subtreeHintHits} misses=${traversal.cache.subtreeHintMisses}\n`);
    }
    context.stdout.write("\n");
  }

  context.stdout.write("Reasoning summary:\n");
  context.stdout.write("- The final answer is grounded only in the matched skills and extracted passages below.\n");
  context.stdout.write("- Intermediate traversal details are shown for auditability, not as a full hidden chain of thought.\n\n");

  for (const result of results) {
    context.stdout.write(`## ${result.title}\n`);
    context.stdout.write(`- skill_id: ${result.skillId}\n`);
    context.stdout.write(`- categories: ${result.categoryPaths.join(", ") || "(unlinked)"}\n`);
    if (result.traversalPaths?.length) {
      context.stdout.write(`- traversal_paths: ${result.traversalPaths.join(", ")}\n`);
    }
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

  if (results.some(result => result.traversal?.visited?.some(node => node.selectorMode === "llm"))) {
    context.stdout.write("Traversal used LLM-guided branch selection where available.\n");
  } else {
    context.stdout.write("Traversal is currently using heuristic branch selection because no LLM selector was active.\n");
  }
}

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

function isNoAnswer(answer) {
  const normalized = String(answer || "").trim().toLowerCase().replace(/[.!?]+$/g, "");
  return normalized === "i don't know";
}

async function persistAskRun({ context, question, answer, results, traversal }) {
  if (!context.config.runs_enabled) {
    return;
  }
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
      traversalPaths: result.traversalPaths,
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
      const rationale = node.selectorRationale ? ` rationale=${JSON.stringify(node.selectorRationale)}` : "";
      lines.push(`- ${label} [depth=${node.depth} score=${node.score} skills=${node.skillIds.length}${selector}${selected}${rationale}]`);
    }
    if (traversal.truncated) {
      lines.push(`- traversal_budget: stopped early (${traversal.stopReason})`);
    }
    if (traversal.cache) {
      lines.push(`- traversal_cache: subtree_hints=${traversal.cache.subtreeHintEntries} skill_meta=${traversal.cache.skillMetaEntries} hits=${traversal.cache.subtreeHintHits} misses=${traversal.cache.subtreeHintMisses}`);
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
    if (result.traversalPaths?.length) {
      lines.push(`- traversal_paths: ${result.traversalPaths.join(", ")}`);
    }
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
