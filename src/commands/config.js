import path from "node:path";
import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../lib/config.js";

export async function handleConfig(args, context) {
  if (args.length === 0 || args[0] === "show") {
    const config = await loadConfig(context.paths.config);
    context.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return;
  }

  if (args[0] === "--file") {
    const sourcePath = args[1];
    if (!sourcePath) {
      throw new Error("config --file requires a JSON file path");
    }
    const absolutePath = path.resolve(context.cwd, sourcePath);
    const imported = await loadConfigFile(absolutePath);
    const config = { ...DEFAULT_CONFIG, ...imported };
    await saveConfig(context.paths.config, config);
    context.stdout.write(`Loaded config from ${absolutePath}\n`);
    context.stdout.write(`Active config path: ${context.paths.config}\n`);
    return;
  }

  const [action, key, value] = args;
  if (action === "set" && key && value !== undefined) {
    const config = await loadConfig(context.paths.config);
    config[key] = parseConfigValue(value);
    await saveConfig(context.paths.config, config);
    context.stdout.write(`Updated config: ${key}=${JSON.stringify(config[key])}\n`);
    return;
  }

  throw new Error("config usage: rrag config show | rrag config set <key> <value> | rrag config --file <path>");
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

async function loadConfigFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("config file must contain a JSON object");
  }
  return parsed;
}
