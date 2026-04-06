import readline from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { loadConfig, saveConfig } from "../lib/config.js";

const RECOMMENDED_CONFIG = {
  runs_enabled: false,
  archive_enabled: false,
  ask_error_on_no_answer: true,
  llm_enabled: true,
  llm_provider: "ollama",
  llm_base_url: "http://127.0.0.1:11434",
  llm_model: "qwen2.5:7b",
  llm_api_key_env: "OPENAI_API_KEY"
};

export async function handleInit(args, context) {
  if (args.length > 0) {
    throw new Error("init does not accept flags; run it interactively and use config --file or config set for scripted changes");
  }
  const currentConfig = await loadConfig(context.paths.config);
  const interactive = Boolean((context.stdin ?? processStdin).isTTY && (context.stdout ?? processStdout).isTTY);
  if (!interactive) {
    throw new Error("init requires an interactive terminal; use config --file or config set in scripts");
  }
  const startingConfig = buildStartingConfig(context.hasExistingConfig, currentConfig);
  const next = await promptForConfig(startingConfig, context);

  await saveConfig(context.paths.config, next);

  context.stdout.write(`Initialized config at ${context.paths.config}\n`);
  context.stdout.write(`- runs_enabled: ${next.runs_enabled ? "true" : "false"}\n`);
  context.stdout.write(`- archive_enabled: ${next.archive_enabled ? "true" : "false"}\n`);
  context.stdout.write(`- ask_error_on_no_answer: ${next.ask_error_on_no_answer ? "true" : "false"}\n`);
  context.stdout.write(`- llm_enabled: ${next.llm_enabled ? "true" : "false"}\n`);
  context.stdout.write(`- llm_provider: ${next.llm_provider}\n`);
  context.stdout.write(`- llm_base_url: ${next.llm_base_url}\n`);
  context.stdout.write(`- llm_model: ${next.llm_model}\n`);
  context.stdout.write(`- llm_api_key_env: ${next.llm_api_key_env}\n`);
}

function buildStartingConfig(hasExistingConfig, currentConfig) {
  if (hasExistingConfig) {
    return currentConfig;
  }
  return {
    ...currentConfig,
    ...RECOMMENDED_CONFIG
  };
}

async function promptForConfig(startingConfig, context) {
  const rl = readline.createInterface({
    input: context.stdin ?? processStdin,
    output: context.stdout ?? processStdout,
    terminal: Boolean((context.stdin ?? processStdin).isTTY && (context.stdout ?? processStdout).isTTY)
  });

  try {
    context.stdout.write(context.hasExistingConfig
      ? "Starting interactive config using your current settings as defaults.\n"
      : "Starting interactive config using recommended defaults for a fresh setup.\n");

    const runsEnabled = await promptBoolean(rl, "Record run artifacts under runs/", startingConfig.runs_enabled);
    const archiveEnabled = await promptBoolean(rl, "Archive consumed staging inputs after update --apply", startingConfig.archive_enabled);
    const askErrorOnNoAnswer = await promptBoolean(rl, "Throw an error when ask cannot find or infer an answer", startingConfig.ask_error_on_no_answer);
    const llmEnabled = await promptBoolean(rl, "Enable LLM features", startingConfig.llm_enabled);
    const provider = normalizeProvider(await promptText(rl, "LLM provider (ollama / llama.cpp / openai-compatible)", startingConfig.llm_provider));

    const llmModel = await promptText(rl, "Model name", startingConfig.llm_model);
    const llmBaseUrl = await promptText(rl, "Base URL", startingConfig.llm_base_url);
    const llmApiKeyEnv = await promptText(rl, "API key env var", startingConfig.llm_api_key_env);

    return {
      ...startingConfig,
      runs_enabled: runsEnabled,
      archive_enabled: archiveEnabled,
      ask_error_on_no_answer: askErrorOnNoAnswer,
      llm_enabled: llmEnabled,
      llm_provider: provider,
      llm_model: llmModel,
      llm_base_url: llmBaseUrl,
      llm_api_key_env: llmApiKeyEnv
    };
  } finally {
    rl.close();
  }
}

async function promptText(rl, label, defaultValue) {
  const suffix = defaultValue !== undefined && defaultValue !== null && String(defaultValue) !== ""
    ? ` [${defaultValue}]`
    : "";
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  if (!trimmed) {
    return defaultValue ?? "";
  }
  return trimmed;
}

async function promptBoolean(rl, label, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = await rl.question(`${label} [${suffix}]: `);
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return Boolean(defaultValue);
  }
  if (["y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  throw new Error(`invalid boolean response "${answer.trim()}"`);
}

function normalizeProvider(provider) {
  const normalized = String(provider || "openai-compatible").trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai-compatible") {
    return "openai-compatible";
  }
  if (normalized === "ollama") {
    return "ollama";
  }
  if (normalized === "llama.cpp" || normalized === "llama-cpp" || normalized === "llamacpp") {
    return "llama.cpp";
  }
  throw new Error(`unsupported provider "${provider}"`);
}
