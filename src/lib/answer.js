export async function synthesizeGroundedAnswer({ question, results, llm }) {
  if (!llm?.configured) {
    return heuristicAnswer(results);
  }

  try {
    const text = await llm.generateText({
      system: "You answer questions using only the provided retrieved passages. If the evidence is insufficient, answer exactly: I don't know.",
      user: JSON.stringify({
        question,
        evidence: results.map(result => ({
          skillId: result.skillId,
          title: result.title,
          categories: result.categoryPaths,
          summary: result.summary,
          passages: result.passages.map(passage => passage.text)
        }))
      }, null, 2)
    });
    return text.trim();
  } catch {
    return heuristicAnswer(results);
  }
}

export function heuristicAnswer(results) {
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

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}
