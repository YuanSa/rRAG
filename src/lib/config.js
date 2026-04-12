import { readFile, writeFile } from "node:fs/promises";

export const DEFAULT_CONFIG = {
  max_branches: 10,
  max_depth: 5,
  max_total_nodes: 50,
  branch_max_per_level: 3,
  branch_min_score: 1,
  branch_score_margin: 3,
  max_full_skill_reads: 12,
  max_passages_per_skill: 5,
  staging_max_file_size: 262144,
  staging_max_total_files: 500,
  runs_enabled: true,
  archive_enabled: true,
  ask_no_answer_behavior: "empty",
  llm_provider: "openai-compatible",
  llm_base_url: "https://api.openai.com/v1",
  llm_model: "gpt-4.1-mini",
  llm_api_key_env: "OPENAI_API_KEY",
  remote_git_enabled: false,
  remote_git_remote: "origin",
  remote_git_provider: "auto",
  remote_git_repo_url: "",
  remote_git_api_base_url: "",
  remote_git_token_env: ""
};

export async function loadConfig(configPath) {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizeConfig({ ...DEFAULT_CONFIG, ...parsed });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return sanitizeConfig({ ...DEFAULT_CONFIG });
    }
    throw error;
  }
}

export async function saveConfig(configPath, config) {
  await writeFile(configPath, `${JSON.stringify(sanitizeConfig(config), null, 2)}\n`, "utf8");
}

function sanitizeConfig(config) {
  const next = { ...config };
  delete next.llm_enabled;

  if ("ask_error_on_no_answer" in next && !("ask_no_answer_behavior" in next)) {
    next.ask_no_answer_behavior = next.ask_error_on_no_answer ? "error" : "reply";
  }
  delete next.ask_error_on_no_answer;

  next.ask_no_answer_behavior = normalizeAskNoAnswerBehavior(next.ask_no_answer_behavior);
  next.remote_git_enabled = Boolean(next.remote_git_enabled);
  next.remote_git_remote = String(next.remote_git_remote || "origin").trim() || "origin";
  next.remote_git_provider = normalizeRemoteProvider(next.remote_git_provider);
  next.remote_git_repo_url = String(next.remote_git_repo_url || "").trim();
  next.remote_git_api_base_url = String(next.remote_git_api_base_url || "").trim();
  next.remote_git_token_env = String(next.remote_git_token_env || "").trim();
  return next;
}

function normalizeAskNoAnswerBehavior(value) {
  const normalized = String(value || "error").trim().toLowerCase();
  if (normalized === "blank") {
    return "empty";
  }
  if (normalized === "error" || normalized === "reply" || normalized === "empty") {
    return normalized;
  }
  return "empty";
}

function normalizeRemoteProvider(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  if (normalized === "auto" || normalized === "github" || normalized === "gitlab") {
    return normalized;
  }
  return "auto";
}
