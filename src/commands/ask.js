import { retrieveRelevantPassages } from "../lib/retrieval.js";

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
    maxPassagesPerSkill: context.config.max_passages_per_skill
  });

  context.stdout.write(`# Ask\n\n`);
  context.stdout.write(`Question: ${question}\n`);

  if (results.length === 0) {
    context.stdout.write(`\nI don't know.\n`);
    context.stdout.write("No relevant skill summaries or passages were matched by the current heuristic retriever.\n");
    return;
  }

  context.stdout.write(`Matched skills: ${results.length}\n\n`);
  context.stdout.write(`Answer: ${synthesizeAnswer(results)}\n\n`);
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

function synthesizeAnswer(results) {
  const passages = [];
  for (const result of results) {
    for (const passage of result.passages) {
      passages.push(oneLine(passage.text.replace(/^#+\s*/, "")));
    }
  }

  const unique = [...new Set(passages)].filter(Boolean);
  if (unique.length === 0) {
    return results.map(result => result.summary).join(" ");
  }
  return unique.slice(0, 3).join(" ");
}
