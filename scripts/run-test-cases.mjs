import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "bin", "rrag.js");
const casesDir = path.join(repoRoot, "examples", "test-cases");
const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "rrag-demo-"));

console.log(`# rrag demo sandbox`);
console.log(`workspace: ${sandboxRoot}`);
console.log("");

await run(["update", "--file", casesDir], sandboxRoot);
await run(["update", "--apply"], sandboxRoot);
await run(["ask", "How should traversal cost be controlled in retrieval systems?"], sandboxRoot);
await run(["ask", "Why should a system extract passages instead of returning whole skills?"], sandboxRoot);
await run(["rebuild", "--dry-run"], sandboxRoot);
await run(["status"], sandboxRoot);
await run(["runs", "5"], sandboxRoot);

console.log("");
console.log(`Demo workspace preserved at: ${sandboxRoot}`);

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`$ node ${path.relative(repoRoot, cliPath)} ${args.join(" ")}`);
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: "inherit"
    });
    child.on("exit", code => {
      console.log("");
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}: ${args.join(" ")}`));
    });
    child.on("error", reject);
  });
}
