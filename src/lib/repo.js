import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config.js";
import { createLlmClient } from "./llm.js";

const REQUIRED_DIRS = [
  "skills",
  "categories",
  "staging",
  "archive",
  path.join("archive", "staging"),
  "runs"
];

export async function createRepoContext({ cwd, stdout, stderr }) {
  for (const dir of REQUIRED_DIRS) {
    await mkdir(path.join(cwd, dir), { recursive: true });
  }

  const configPath = path.join(cwd, "config.json");
  const config = await loadConfig(configPath);

  if (JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG)) {
    await saveConfig(configPath, config);
  }

  return {
    cwd,
    stdout,
    stderr,
    configPath,
    config,
    llm: createLlmClient(config),
    paths: {
      skills: path.join(cwd, "skills"),
      categories: path.join(cwd, "categories"),
      staging: path.join(cwd, "staging"),
      archive: path.join(cwd, "archive"),
      archiveStaging: path.join(cwd, "archive", "staging"),
      runs: path.join(cwd, "runs"),
      config: configPath
    }
  };
}
