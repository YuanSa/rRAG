import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH = "main";
const DEFAULT_IDENTITY = {
  GIT_AUTHOR_NAME: "rrag",
  GIT_AUTHOR_EMAIL: "rrag@local",
  GIT_COMMITTER_NAME: "rrag",
  GIT_COMMITTER_EMAIL: "rrag@local"
};

export async function getGitStatus(cwd) {
  try {
    const { stdout } = await execGit(cwd, ["status", "--short", "--branch"]);
    return {
      ok: true,
      output: stdout.trim()
    };
  } catch (error) {
    return {
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getCurrentBranch(cwd) {
  try {
    const { stdout } = await execGit(cwd, ["branch", "--show-current"]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getHeadCommit(cwd) {
  try {
    const { stdout } = await execGit(cwd, ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function isGitRepo(cwd) {
  try {
    await execGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureGitRepo(cwd) {
  if (await isGitRepo(cwd)) {
    return;
  }
  try {
    await execGit(cwd, ["init", "-b", DEFAULT_BRANCH]);
  } catch {
    await execGit(cwd, ["init"]);
    await execGit(cwd, ["branch", "-M", DEFAULT_BRANCH]);
  }
}

export async function hasHeadCommit(cwd) {
  try {
    await execGit(cwd, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureInitialCommit(cwd, files = [".gitignore"]) {
  if (await hasHeadCommit(cwd)) {
    return;
  }
  await execGit(cwd, ["add", ...files]);
  await execGit(cwd, ["commit", "-m", "Initialize rrag data repository"], { withIdentity: true });
}

export async function createBranchFromMain(cwd, branchName) {
  await execGit(cwd, ["checkout", DEFAULT_BRANCH]);
  await execGit(cwd, ["checkout", "-b", branchName]);
}

export async function checkoutBranch(cwd, branchName) {
  await execGit(cwd, ["checkout", branchName]);
}

export async function stageAll(cwd) {
  await execGit(cwd, ["add", "."]);
}

export async function commitAll(cwd, message) {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    throw new Error("commit message cannot be empty");
  }
  await execGit(cwd, ["commit", "-m", trimmed], { withIdentity: true });
}

export async function hasTrackedChanges(cwd) {
  const { stdout } = await execGit(cwd, ["status", "--short"]);
  return stdout.trim().length > 0;
}

export async function diffAgainstMain(cwd) {
  const { stdout } = await execGit(cwd, ["diff", `${DEFAULT_BRANCH}...HEAD`]);
  return stdout;
}

export async function mergeCurrentBranchIntoMain(cwd, branchName) {
  await execGit(cwd, ["checkout", DEFAULT_BRANCH]);
  await execGit(cwd, ["merge", "--no-ff", branchName, "-m", `Merge ${branchName} into ${DEFAULT_BRANCH}`], { withIdentity: true });
}

export function createUpdateBranchName(runId) {
  const normalized = String(runId || new Date().toISOString())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `update/${normalized || "run"}`;
}

async function execGit(cwd, args, options = {}) {
  await clearStaleGitLock(cwd);
  const env = options.withIdentity
    ? {
        ...process.env,
        ...DEFAULT_IDENTITY
      }
    : process.env;
  return execFileAsync("git", args, { cwd, env });
}

async function clearStaleGitLock(cwd) {
  await rm(path.join(cwd, ".git", "index.lock"), { force: true });
}
