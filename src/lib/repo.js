import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config.js";
import { ensureGitRepo, ensureInitialCommit } from "./git.js";
import { createLlmClient } from "./llm.js";

const REQUIRED_DIRS = [
  "skills",
  "categories",
  "staging",
  "archive",
  path.join("archive", "staging"),
  "runs"
];

export async function createRepoContext({ cwd, stdout, stderr, stdin }) {
  const dataRoot = resolveDataRoot(process.env);

  for (const dir of REQUIRED_DIRS) {
    await mkdir(path.join(dataRoot, dir), { recursive: true });
  }

  await ensureGitRepo(dataRoot);

  const configPath = path.join(dataRoot, "config.json");
  const hasExistingConfig = await fileExists(configPath);
  const config = await loadConfig(configPath);
  await ensureDataGitignore(path.join(dataRoot, ".gitignore"));

  if (JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG)) {
    await saveConfig(configPath, config);
  }
  await ensureInitialCommit(dataRoot);

  return {
    cwd,
    dataRoot,
    stdout,
    stderr,
    stdin,
    configPath,
    config,
    hasExistingConfig,
    llm: createLlmClient(config),
    paths: {
      root: dataRoot,
      skills: path.join(dataRoot, "skills"),
      categories: path.join(dataRoot, "categories"),
      staging: path.join(dataRoot, "staging"),
      archive: path.join(dataRoot, "archive"),
      archiveStaging: path.join(dataRoot, "archive", "staging"),
      runs: path.join(dataRoot, "runs"),
      config: configPath
    }
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveDataRoot(env) {
  const configured = String(env.RRAG_HOME || "").trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), ".rrag");
}

async function ensureDataGitignore(gitignorePath) {
  const desired = ["archive/", "runs/", "staging/"].join("\n");
  try {
    const existing = await readFile(gitignorePath, "utf8");
    const normalized = existing.trim().replace(/\r\n/g, "\n");
    if (normalized === desired) {
      return;
    }
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      throw error;
    }
  }
  await writeFile(gitignorePath, `${desired}\n`, "utf8");
}
