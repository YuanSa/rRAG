import { loadConfig, saveConfig } from "../lib/config.js";

export async function handleConfig(args, context) {
  const [action, key, value] = args;
  if (action !== "set" || !key || value === undefined) {
    throw new Error("config usage: rrag config set <key> <value>");
  }

  const config = await loadConfig(context.paths.config);
  config[key] = parseConfigValue(value);
  await saveConfig(context.paths.config, config);
  context.stdout.write(`Updated config: ${key}=${JSON.stringify(config[key])}\n`);
}

function parseConfigValue(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (!Number.isNaN(Number(value)) && value.trim() !== "") {
    return Number(value);
  }
  return value;
}
