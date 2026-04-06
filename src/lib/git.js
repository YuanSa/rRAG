import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGitStatus(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], { cwd });
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
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getHeadCommit(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function isGitRepo(cwd) {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function ensureGitRepo(cwd) {
  if (await isGitRepo(cwd)) {
    return;
  }
  await execFileAsync("git", ["init"], { cwd });
}
