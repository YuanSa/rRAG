const stateLine = document.querySelector("#state-line");
const llmBadge = document.querySelector("#llm-badge");
const runsBadge = document.querySelector("#runs-badge");

const askForm = document.querySelector("#ask-form");
const askInput = document.querySelector("#ask-input");
const askExplain = document.querySelector("#ask-explain");
const askOutput = document.querySelector("#ask-output");

const updateForm = document.querySelector("#update-form");
const updateInput = document.querySelector("#update-input");
const updateOutput = document.querySelector("#update-output");
const reviewOutput = document.querySelector("#review-output");
const statusOutput = document.querySelector("#status-output");
const runsOutput = document.querySelector("#runs-output");

const applyButton = document.querySelector("#apply-button");
const reviewButton = document.querySelector("#review-button");
const mergeButton = document.querySelector("#merge-button");
const refreshStatusButton = document.querySelector("#refresh-status-button");
const refreshRunsButton = document.querySelector("#refresh-runs-button");
const rebuildButton = document.querySelector("#rebuild-button");
const clearButton = document.querySelector("#clear-button");

askForm.addEventListener("submit", async event => {
  event.preventDefault();
  await runAction({
    output: askOutput,
    request: () => api("/api/ask", {
      method: "POST",
      body: {
        question: askInput.value.trim(),
        explain: askExplain.checked
      }
    })
  });
});

updateForm.addEventListener("submit", async event => {
  event.preventDefault();
  await runAction({
    output: updateOutput,
    request: () => api("/api/update/note", {
      method: "POST",
      body: { text: updateInput.value.trim() }
    }),
    onSuccess: () => {
      updateInput.value = "";
      void refreshStatus();
    }
  });
});

applyButton.addEventListener("click", async () => {
  await runAction({
    output: updateOutput,
    request: () => api("/api/update/apply", { method: "POST" }),
    onSuccess: async () => {
      await refreshStatus();
      await refreshRuns();
    }
  });
});

reviewButton.addEventListener("click", async () => {
  await runAction({
    output: reviewOutput,
    request: () => api("/api/update/review")
  });
});

mergeButton.addEventListener("click", async () => {
  await runAction({
    output: reviewOutput,
    request: () => api("/api/update/merge", { method: "POST" }),
    onSuccess: async () => {
      await refreshStatus();
      await refreshRuns();
    }
  });
});

refreshStatusButton.addEventListener("click", () => void refreshStatus());
refreshRunsButton.addEventListener("click", () => void refreshRuns());

rebuildButton.addEventListener("click", async () => {
  await runAction({
    output: statusOutput,
    request: () => api("/api/rebuild", {
      method: "POST",
      body: { dryRun: true }
    }),
    onSuccess: async () => {
      await refreshRuns();
      await refreshStatus();
    }
  });
});

clearButton.addEventListener("click", async () => {
  await runAction({
    output: statusOutput,
    request: () => api("/api/clear", { method: "POST" }),
    onSuccess: async () => {
      await refreshStatus();
      await refreshRuns();
    }
  });
});

void bootstrap();

async function bootstrap() {
  await refreshState();
  await refreshStatus();
  await refreshRuns();
}

async function refreshState() {
  try {
    const response = await api("/api/state");
    if (!response.ok) {
      throw new Error(response.error || "Failed to load state.");
    }
    stateLine.textContent = `${response.dataRoot} · ${response.llmProvider} · ${response.llmModel}`;
    llmBadge.textContent = response.llmConfigured ? `LLM: ${response.llmProvider}` : `LLM: not configured`;
    runsBadge.textContent = `Runs: ${response.runsEnabled ? "on" : "off"} · Archive: ${response.archiveEnabled ? "on" : "off"}`;
  } catch (error) {
    stateLine.textContent = error.message;
    llmBadge.textContent = "LLM: unavailable";
    runsBadge.textContent = "Runs: unavailable";
  }
}

async function refreshStatus() {
  await runAction({
    output: statusOutput,
    request: () => api("/api/status")
  });
}

async function refreshRuns() {
  await runAction({
    output: runsOutput,
    request: () => api("/api/runs?limit=12")
  });
}

async function runAction({ output, request, onSuccess }) {
  output.textContent = "Working...";
  try {
    const result = await request();
    output.textContent = formatResult(result);
    if (result.ok && onSuccess) {
      await onSuccess(result);
    }
  } catch (error) {
    output.textContent = error.message;
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  return payload;
}

function formatResult(result) {
  if (!result.ok) {
    return [result.error, result.stderr, result.stdout].filter(Boolean).join("\n\n");
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "Done.";
}
