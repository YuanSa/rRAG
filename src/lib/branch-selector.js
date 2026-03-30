export async function selectBranchesWithFallback({ llm, question, parentPath, childCategories, maxBranches, minScore = 1, scoreMargin = 3 }) {
  const heuristic = selectBranchesHeuristic({ childCategories, maxBranches, minScore, scoreMargin });
  if (!llm?.configured || childCategories.length === 0) {
    return {
      selected: heuristic,
      mode: "heuristic"
    };
  }

  try {
    const response = await llm.generateJson({
      system: "You are selecting the most relevant category branches for a question in a hierarchical knowledge base. Be conservative and pick only the strongest branches.",
      user: JSON.stringify({
        question,
        parentPath,
        maxBranches,
        minScore,
        scoreMargin,
        candidates: childCategories.map(child => ({
          name: child.name,
          hint: child.hint,
          heuristicScore: child.score
        }))
      }, null, 2),
      schemaHint: JSON.stringify({
        selected: ["CategoryName"]
      }, null, 2)
    });

    const selectedNames = Array.isArray(response?.selected)
      ? response.selected.map(value => String(value).trim()).filter(Boolean)
      : [];

    const selected = childCategories.filter(child => selectedNames.includes(child.name)).slice(0, maxBranches);
    if (selected.length === 0) {
      return {
        selected: heuristic,
        mode: "heuristic-fallback"
      };
    }

    return {
      selected,
      mode: "llm"
    };
  } catch {
    return {
      selected: heuristic,
      mode: "heuristic-fallback"
    };
  }
}

export function selectBranchesHeuristic({ childCategories, maxBranches, minScore = 1, scoreMargin = 3 }) {
  const ranked = childCategories
    .filter(child => child.score >= minScore)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  if (ranked.length === 0) {
    return [];
  }

  const bestScore = ranked[0].score;
  return ranked
    .filter(child => child.score >= Math.max(minScore, bestScore - scoreMargin))
    .slice(0, maxBranches);
}
