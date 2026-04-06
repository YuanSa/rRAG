import { loadConfig, saveConfig } from "../lib/config.js";

const PROVIDER_PRESETS = {
  ollama: {
    llm_enabled: true,
    llm_provider: "ollama",
    llm_base_url: "http://127.0.0.1:11434"
  },
  "llama.cpp": {
    llm_enabled: true,
    llm_provider: "llama.cpp",
    llm_base_url: "http://127.0.0.1:8080/v1"
  },
  openai: {
    llm_enabled: true,
    llm_provider: "openai-compatible",
    llm_base_url: "https://api.openai.com/v1"
  }
};

export async function handleInit(args, context) {
  const config = await loadConfig(context.paths.config);
  const updates = parseInitArgs(args);
  const next = { ...config, ...updates };
  await saveConfig(context.paths.config, next);

  context.stdout.write(`Initialized config at ${context.paths.config}\n`);
  context.stdout.write(`- llm_enabled: ${next.llm_enabled ? "true" : "false"}\n`);
  context.stdout.write(`- llm_provider: ${next.llm_provider}\n`);
  context.stdout.write(`- llm_base_url: ${next.llm_base_url}\n`);
  context.stdout.write(`- llm_model: ${next.llm_model}\n`);
  context.stdout.write(`- llm_api_key_env: ${next.llm_api_key_env}\n`);
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
      Object.assign(updates, PROVIDER_PRESETS.openai);
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

  return updates;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
