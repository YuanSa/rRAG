export async function selectBranchesWithFallback({ llm, question, parentPath, childCategories, maxBranches, minScore = 1, scoreMargin = 3 }) {
  const heuristic = selectBranchesHeuristic({ childCategories, maxBranches, minScore, scoreMargin });
  if (!llm?.configured || childCategories.length === 0) {
    return {
      selected: heuristic,
      mode: "heuristic",
      rationale: "LLM unavailable; heuristic selector used."
    };
  }

  try {
    const response = await llm.generateJson({
      system: [
        "You are selecting the most relevant category branches for a question in a hierarchical knowledge base.",
        "Your job is to continue traversal only into the strongest branches.",
        "Be conservative. Prefer returning fewer branches.",
        "Use the heuristic score only as a hint, not as a rule.",
        "If none of the branches look meaningfully relevant, return an empty selected list."
      ].join(" "),
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
        selected: [
          {
            name: "CategoryName",
            reason: "short reason"
          }
        ],
        rationale: "short global rationale"
      }, null, 2)
    });

    const selectedNames = normalizeSelectedNames(response?.selected);

    const selected = childCategories.filter(child => selectedNames.includes(child.name)).slice(0, maxBranches);
    if (selected.length === 0) {
      return {
        selected: heuristic,
        mode: "heuristic-fallback",
        rationale: typeof response?.rationale === "string" ? response.rationale.trim() : "LLM returned no usable branch selection."
      };
    }

    return {
      selected,
      mode: "llm",
      rationale: typeof response?.rationale === "string" ? response.rationale.trim() : summarizeReasons(response?.selected)
    };
  } catch {
    return {
      selected: heuristic,
      mode: "heuristic-fallback",
      rationale: "LLM branch selection failed; heuristic fallback used."
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

function normalizeSelectedNames(selected) {
  if (!Array.isArray(selected)) {
    return [];
  }
  return selected
    .map(item => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object" && typeof item.name === "string") {
        return item.name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function summarizeReasons(selected) {
  if (!Array.isArray(selected) || selected.length === 0) {
    return "";
  }
  const reasons = selected
    .map(item => (item && typeof item === "object" && typeof item.reason === "string" ? item.reason.trim() : ""))
    .filter(Boolean);
  return reasons.join(" | ");
}
