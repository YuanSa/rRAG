import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRepoContext } from "../lib/repo.js";
import { createCapturedStreams } from "../lib/capture.js";
import { executeCommand } from "../lib/command-executor.js";
import { loadConfig, saveConfig } from "../lib/config.js";
import {
  addTextToStaging,
  collectStagingTexts,
  deleteStagingText,
  updateStagingText
} from "../lib/staging.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUI_ROOT = path.resolve(__dirname, "../../gui/dist");
const HOST = "127.0.0.1";
const PORT = 4317;

export async function handleGui(args, context) {
  const options = parseGuiOptions(args);
  await ensureGuiBuild();
  const server = createServer((request, response) => {
    void routeRequest({ request, response, context, options });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolve);
  });

  context.stdout.write(`rrag gui is running at http://${options.host}:${options.port}\n`);
  context.stdout.write("Press Ctrl+C to stop the server.\n");
}

function parseGuiOptions(args) {
  let host = HOST;
  let port = PORT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--host") {
      host = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--port") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("gui --port requires a positive integer");
      }
      port = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown gui option "${arg}"`);
  }

  if (!host) {
    throw new Error("gui --host requires a host value");
  }

  return { host, port };
}

async function routeRequest({ request, response, context }) {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      await serveGuiAsset(response, url.pathname);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      await sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      const commandContext = await buildCommandContext(context);
      await sendJson(response, 200, {
        ok: true,
        dataRoot: commandContext.paths.root,
        llmConfigured: commandContext.llm.configured,
        llmProvider: commandContext.llm.provider,
        llmModel: commandContext.config.llm_model,
        runsEnabled: commandContext.config.runs_enabled,
        archiveEnabled: commandContext.config.archive_enabled
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      await runAndRespond(response, context, "status", []);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/runs") {
      const limit = url.searchParams.get("limit") || "10";
      await runAndRespond(response, context, "runs", [limit]);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/update/review") {
      await runAndRespond(response, context, "update", ["--review"]);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/config") {
      const commandContext = await buildCommandContext(context);
      const config = await loadConfig(commandContext.paths.config);
      await sendJson(response, 200, {
        ok: true,
        config
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/staging") {
      const commandContext = await buildCommandContext(context);
      const items = await collectStagingTexts(commandContext.paths.staging);
      await sendJson(response, 200, {
        ok: true,
        items: items.map(item => ({
          relativePath: item.relativePath,
          content: item.content,
          preview: item.content.slice(0, 240).trim(),
          size: item.content.length
        }))
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/ask") {
      const body = await readJsonBody(request);
      const args = [];
      if (body?.explain) {
        args.push("--explain");
      }
      args.push(String(body?.question || ""));
      await runAndRespond(response, context, "ask", args);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/update/note") {
      const body = await readJsonBody(request);
      await runAndRespond(response, context, "update", [String(body?.text || "")]);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/staging") {
      const body = await readJsonBody(request);
      const text = String(body?.text || "").trim();
      if (!text) {
        throw new Error("staging text is required");
      }
      const commandContext = await buildCommandContext(context);
      const createdPath = await addTextToStaging(commandContext.paths.staging, text);
      await sendJson(response, 200, {
        ok: true,
        relativePath: path.relative(commandContext.paths.staging, createdPath)
      });
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/staging") {
      const body = await readJsonBody(request);
      const relativePath = String(body?.relativePath || "");
      if (!relativePath) {
        throw new Error("staging relativePath is required");
      }
      const commandContext = await buildCommandContext(context);
      await updateStagingText(commandContext.paths.staging, relativePath, String(body?.content || ""));
      await sendJson(response, 200, {
        ok: true,
        relativePath
      });
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/staging") {
      const body = await readJsonBody(request);
      const relativePath = String(body?.relativePath || "");
      if (!relativePath) {
        throw new Error("staging relativePath is required");
      }
      const commandContext = await buildCommandContext(context);
      await deleteStagingText(commandContext.paths.staging, relativePath);
      await sendJson(response, 200, {
        ok: true,
        relativePath
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/update/apply") {
      await runAndRespond(response, context, "update", ["--apply"]);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/update/merge") {
      await runAndRespond(response, context, "update", ["--merge"]);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rebuild") {
      const body = await readJsonBody(request);
      const args = body?.dryRun ? ["--dry-run"] : [];
      await runAndRespond(response, context, "rebuild", args);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/clear") {
      await runAndRespond(response, context, "clear", []);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = await readJsonBody(request);
      const commandContext = await buildCommandContext(context);
      const currentConfig = await loadConfig(commandContext.paths.config);
      const nextConfig = {
        ...currentConfig,
        ...(body?.config || {})
      };
      await saveConfig(commandContext.paths.config, nextConfig);
      await sendJson(response, 200, {
        ok: true,
        config: await loadConfig(commandContext.paths.config)
      });
      return;
    }

    await sendJson(response, 404, {
      ok: false,
      error: `unknown route ${request.method} ${url.pathname}`
    });
  } catch (error) {
    await sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function buildCommandContext(parentContext) {
  const captured = createCapturedStreams();
  return createRepoContext({
    cwd: parentContext.cwd,
    stdout: captured.stdout,
    stderr: captured.stderr,
    stdin: parentContext.stdin
  });
}

async function runAndRespond(response, parentContext, command, args) {
  const captured = createCapturedStreams();
  const commandContext = await createRepoContext({
    cwd: parentContext.cwd,
    stdout: captured.stdout,
    stderr: captured.stderr,
    stdin: parentContext.stdin
  });

  try {
    await executeCommand(command, args, commandContext);
    await sendJson(response, 200, {
      ok: true,
      command,
      args,
      stdout: captured.readStdout(),
      stderr: captured.readStderr()
    });
  } catch (error) {
    await sendJson(response, 400, {
      ok: false,
      command,
      args,
      stdout: captured.readStdout(),
      stderr: captured.readStderr(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

async function serveGuiAsset(response, urlPathname) {
  const normalizedPath = normalizeAssetPath(urlPathname);
  const candidatePath = path.join(GUI_ROOT, normalizedPath);
  const filePath = await exists(candidatePath) ? candidatePath : path.join(GUI_ROOT, "index.html");
  const content = await readFile(filePath);
  response.writeHead(200, { "content-type": contentTypeFor(filePath) });
  response.end(content);
}

async function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function ensureGuiBuild() {
  if (!(await exists(path.join(GUI_ROOT, "index.html")))) {
    throw new Error('GUI assets are missing. Run "npm run build:gui" first.');
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeAssetPath(urlPathname) {
  const cleaned = decodeURIComponent(urlPathname || "/").replace(/^\/+/, "");
  if (!cleaned) {
    return "index.html";
  }
  return cleaned;
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
