import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const IGNORED_NAMES = new Set([".git", "node_modules", "dist", "build", ".DS_Store"]);
const TEXT_FILE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

export async function addTextToStaging(stagingRoot, text) {
  const filename = `${timestamp()}-${randomUUID().slice(0, 8)}.md`;
  const outputPath = path.join(stagingRoot, filename);
  await writeFile(outputPath, `${text.trim()}\n`, "utf8");
  return outputPath;
}

export async function copyPathToStaging(sourcePath, stagingRoot, config) {
  const sourceStat = await stat(sourcePath);
  const destination = path.join(stagingRoot, path.basename(sourcePath));
  const copiedFiles = [];
  let totalFiles = 0;

  async function copyRecursive(currentSource, currentDestination) {
    const info = await stat(currentSource);
    const name = path.basename(currentSource);
    if (IGNORED_NAMES.has(name)) {
      return;
    }

    if (info.isDirectory()) {
      await mkdir(currentDestination, { recursive: true });
      const entries = (await readdir(currentSource)).sort();
      for (const entry of entries) {
        await copyRecursive(path.join(currentSource, entry), path.join(currentDestination, entry));
      }
      return;
    }

    totalFiles += 1;
    if (totalFiles > config.staging_max_total_files) {
      throw new Error(`staging copy aborted: more than ${config.staging_max_total_files} files`);
    }
    if (info.size > config.staging_max_file_size) {
      return;
    }
    await mkdir(path.dirname(currentDestination), { recursive: true });
    await cp(currentSource, currentDestination, { recursive: false });
    copiedFiles.push(currentDestination);
  }

  if (sourceStat.isDirectory()) {
    await copyRecursive(sourcePath, destination);
  } else {
    await copyRecursive(sourcePath, destination);
  }

  return { destination, copiedFiles };
}

export async function collectStagingTexts(stagingRoot) {
  const files = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isTextFile(fullPath)) {
        const content = await readFile(fullPath, "utf8");
        files.push({ path: fullPath, relativePath: path.relative(stagingRoot, fullPath), content });
      }
    }
  }

  await walk(stagingRoot);
  return files;
}

export async function updateStagingText(stagingRoot, relativePath, content) {
  const targetPath = resolveStagingPath(stagingRoot, relativePath);
  if (!isTextFile(targetPath)) {
    throw new Error(`staging item is not an editable text file: ${relativePath}`);
  }
  await writeFile(targetPath, `${String(content || "").replace(/\s+$/, "")}\n`, "utf8");
  return targetPath;
}

export async function deleteStagingText(stagingRoot, relativePath) {
  const targetPath = resolveStagingPath(stagingRoot, relativePath);
  await rm(targetPath, { force: true });
  await pruneEmptyDirectories(path.dirname(targetPath), stagingRoot);
}

function isTextFile(filePath) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveStagingPath(stagingRoot, relativePath) {
  const normalizedRoot = path.resolve(stagingRoot);
  const candidate = path.resolve(normalizedRoot, String(relativePath || ""));
  if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`invalid staging path: ${relativePath}`);
  }
  return candidate;
}

async function pruneEmptyDirectories(currentPath, stopPath) {
  const normalizedStop = path.resolve(stopPath);
  let cursor = path.resolve(currentPath);
  while (cursor.startsWith(`${normalizedStop}${path.sep}`)) {
    const remaining = await readdir(cursor);
    if (remaining.length > 0) {
      return;
    }
    await rm(cursor, { recursive: true, force: true });
    cursor = path.dirname(cursor);
  }
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-");
}
