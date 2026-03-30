import { readFile, writeFile } from "node:fs/promises";

export const DEFAULT_CONFIG = {
  max_branches: 10,
  max_depth: 5,
  max_total_nodes: 50,
  max_full_skill_reads: 12,
  max_passages_per_skill: 5,
  staging_max_file_size: 262144,
  staging_max_total_files: 500
};

export async function loadConfig(configPath) {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { ...DEFAULT_CONFIG };
    }
    throw error;
  }
}

export async function saveConfig(configPath, config) {
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
