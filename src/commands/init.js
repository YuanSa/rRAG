import readline from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { loadConfig, saveConfig } from "../lib/config.js";

const PROVIDER_PRESETS = {
  ollama: {
    llm_enabled: true,
    llm_provider: "ollama",
    llm_base_url: "http://127.0.0.1:11434",
    llm_model: "qwen2.5:7b",
    llm_api_key_env: "OPENAI_API_KEY"
  },
  "llama.cpp": {
    llm_enabled: true,
    llm_provider: "llama.cpp",
    llm_base_url: "http://127.0.0.1:8080/v1",
    llm_model: "local-model",
    llm_api_key_env: "OPENAI_API_KEY"
  },
  "openai-compatible": {
    llm_enabled: true,
    llm_provider: "openai-compatible",
    llm_base_url: "https://api.openai.com/v1",
    llm_model: "gpt-4.1-mini",
    llm_api_key_env: "OPENAI_API_KEY"
  }
};

export async function handleInit(args, context) {
  const currentConfig = await loadConfig(context.paths.config);
  const overrides = parseInitArgs(args);
  const startingConfig = buildStartingConfig(context.hasExistingConfig, currentConfig, overrides);
  const interactive = Boolean((context.stdin ?? processStdin).isTTY && (context.stdout ?? processStdout).isTTY);
  const next = interactive
    ? await promptForConfig(startingConfig, context)
    : startingConfig;

  await saveConfig(context.paths.config, next);

  if (!interactive) {
    context.stdout.write(context.hasExistingConfig
      ? "Initialized config non-interactively using current settings plus provided overrides.\n"
      : "Initialized config non-interactively using recommended defaults plus provided overrides.\n");
  }
  context.stdout.write(`Initialized config at ${context.paths.config}\n`);
  context.stdout.write(`- llm_enabled: ${next.llm_enabled ? "true" : "false"}\n`);
  context.stdout.write(`- llm_provider: ${next.llm_provider}\n`);
  context.stdout.write(`- llm_base_url: ${next.llm_base_url}\n`);
  context.stdout.write(`- llm_model: ${next.llm_model}\n`);
  context.stdout.write(`- llm_api_key_env: ${next.llm_api_key_env}\n`);
}

function buildStartingConfig(hasExistingConfig, currentConfig, overrides) {
  const base = hasExistingConfig
    ? currentConfig
    : {
        ...currentConfig,
        ...PROVIDER_PRESETS.ollama
      };
  return { ...base, ...overrides };
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

    const llmEnabled = await promptBoolean(rl, "Enable LLM features", startingConfig.llm_enabled);
    const provider = normalizeProvider(await promptText(
      rl,
      "LLM provider (ollama / llama.cpp / openai-compatible)",
      startingConfig.llm_provider
    ));

    const providerPreset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS["openai-compatible"];
    const modelDefault = pickDefault(
      startingConfig.llm_provider,
      provider,
      startingConfig.llm_model,
      providerPreset.llm_model
    );
    const baseUrlDefault = pickDefault(
      startingConfig.llm_provider,
      provider,
      startingConfig.llm_base_url,
      providerPreset.llm_base_url
    );
    const apiKeyEnvDefault = pickDefault(
      startingConfig.llm_provider,
      provider,
      startingConfig.llm_api_key_env,
      providerPreset.llm_api_key_env
    );

    const llmModel = await promptText(rl, "Model name", modelDefault);
    const llmBaseUrl = await promptText(rl, "Base URL", baseUrlDefault);
    const llmApiKeyEnv = await promptText(rl, "API key env var", apiKeyEnvDefault);

    return {
      ...startingConfig,
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

function pickDefault(startingProvider, chosenProvider, currentValue, fallbackValue) {
  if (startingProvider === chosenProvider && currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== "") {
    return String(currentValue);
  }
  return fallbackValue;
}

function parseInitArgs(args) {
  const updates = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--ollama") {
      Object.assign(updates, PROVIDER_PRESETS.ollama);
      continue;
    }
    if (arg === "--llama-cpp") {
      Object.assign(updates, PROVIDER_PRESETS["llama.cpp"]);
      continue;
    }
    if (arg === "--openai") {
      Object.assign(updates, PROVIDER_PRESETS["openai-compatible"]);
      continue;
    }
    if (arg === "--enable-llm") {
      updates.llm_enabled = true;
      continue;
    }
    if (arg === "--disable-llm") {
      updates.llm_enabled = false;
      continue;
    }
    if (arg === "--model") {
      updates.llm_model = requireValue(args, ++index, "--model");
      continue;
    }
    if (arg === "--base-url") {
      updates.llm_base_url = requireValue(args, ++index, "--base-url");
      continue;
    }
    if (arg === "--api-key-env") {
      updates.llm_api_key_env = requireValue(args, ++index, "--api-key-env");
      continue;
    }
    throw new Error(`unknown init option "${arg}"`);
  }

  if (updates.llm_provider) {
    updates.llm_provider = normalizeProvider(updates.llm_provider);
  }

  return updates;
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

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
