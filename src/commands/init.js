import readline from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { loadConfig, saveConfig } from "../lib/config.js";

const RECOMMENDED_CONFIG = {
  runs_enabled: false,
  archive_enabled: false,
  ask_no_answer_behavior: "error",
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

    const provider = normalizeProvider(await promptText(rl, "LLM provider (ollama / llama.cpp / openai-compatible)", startingConfig.llm_provider));

    const llmModel = await promptText(rl, "Model name", startingConfig.llm_model);
    const llmBaseUrl = await promptText(rl, "Base URL", startingConfig.llm_base_url);
    const llmApiKeyEnv = await promptText(rl, "API key env var", startingConfig.llm_api_key_env);

    return {
      ...startingConfig,
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
