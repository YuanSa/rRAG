import { getRemoteUrl } from "./git.js";

const MAIN_BRANCH = "main";

export async function publishRemoteReview({
  cwd,
  config,
  branchName,
  title,
  body
}) {
  const remoteName = config.remote_git_remote || "origin";
  const remoteUrl = config.remote_git_repo_url || await getRemoteUrl(cwd, remoteName);
  if (!remoteUrl) {
    throw new Error(`remote git is enabled, but remote "${remoteName}" is not configured`);
  }

  const repo = parseRemoteRepository(remoteUrl, config.remote_git_provider);
  if (!repo) {
    return {
      ok: true,
      provider: config.remote_git_provider || "auto",
      remoteName,
      remoteUrl,
      created: false,
      url: "",
      message: "Remote branch pushed, but RRAG could not infer a GitHub or GitLab repository URL to open a review automatically."
    };
  }

  const tokenEnv = config.remote_git_token_env || defaultTokenEnv(repo.provider);
  const token = process.env[tokenEnv] || "";
  const webUrl = buildWebReviewUrl(repo, branchName);
  if (!token) {
    return {
      ok: true,
      provider: repo.provider,
      remoteName,
      remoteUrl,
      created: false,
      url: webUrl,
      message: `Remote branch pushed. Set ${tokenEnv} to create a ${reviewLabel(repo.provider)} automatically.`
    };
  }

  if (repo.provider === "github") {
    return createGithubPullRequest({
      repo,
      token,
      branchName,
      title,
      body,
      apiBaseUrl: config.remote_git_api_base_url
    });
  }

  if (repo.provider === "gitlab") {
    return createGitlabMergeRequest({
      repo,
      token,
      branchName,
      title,
      body,
      apiBaseUrl: config.remote_git_api_base_url
    });
  }

  return {
    ok: true,
    provider: repo.provider,
    remoteName,
    remoteUrl,
    created: false,
    url: webUrl,
    message: `Remote branch pushed. Open the ${reviewLabel(repo.provider)} manually.`
  };
}

function parseRemoteRepository(remoteUrl, configuredProvider = "auto") {
  const sshMatch = String(remoteUrl).match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return buildRepoDescriptor(sshMatch[1], sshMatch[2], configuredProvider);
  }

  try {
    const url = new URL(remoteUrl);
    const pathname = url.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return buildRepoDescriptor(url.host, pathname, configuredProvider);
  } catch {
    return null;
  }
}

function buildRepoDescriptor(host, pathName, configuredProvider) {
  const segments = String(pathName || "")
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments.slice(0, -1).join("/");
  const repo = segments.at(-1);
  const provider = detectProvider(host, configuredProvider);
  return {
    host,
    owner,
    repo,
    provider,
    webBase: `https://${host}`
  };
}

function detectProvider(host, configuredProvider) {
  if (configuredProvider && configuredProvider !== "auto") {
    return configuredProvider;
  }
  const lower = String(host || "").toLowerCase();
  if (lower.includes("gitlab")) {
    return "gitlab";
  }
  return "github";
}

function buildWebReviewUrl(repo, branchName) {
  if (repo.provider === "gitlab") {
    const params = new URLSearchParams({
      "merge_request[source_branch]": branchName,
      "merge_request[target_branch]": MAIN_BRANCH
    });
    return `${repo.webBase}/${repo.owner}/${repo.repo}/-/merge_requests/new?${params.toString()}`;
  }
  return `${repo.webBase}/${repo.owner}/${repo.repo}/compare/${MAIN_BRANCH}...${encodeURIComponent(branchName)}?expand=1`;
}

async function createGithubPullRequest({ repo, token, branchName, title, body, apiBaseUrl }) {
  const apiBase = (apiBaseUrl || `https://api.${repo.host}`).replace(/\/+$/, "");
  const existingUrl = `${apiBase}/repos/${repo.owner}/${repo.repo}/pulls?state=open&base=${encodeURIComponent(MAIN_BRANCH)}&head=${encodeURIComponent(`${repo.owner}:${branchName}`)}`;
  const existing = await fetchJson(existingUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    }
  });
  if (Array.isArray(existing) && existing[0]?.html_url) {
    return {
      ok: true,
      provider: "github",
      created: false,
      url: existing[0].html_url,
      message: "Existing pull request found for the current update branch."
    };
  }

  const created = await fetchJson(`${apiBase}/repos/${repo.owner}/${repo.repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title,
      body,
      head: branchName,
      base: MAIN_BRANCH
    })
  });

  return {
    ok: true,
    provider: "github",
    created: true,
    url: created.html_url,
    message: "Created GitHub pull request for the current update branch."
  };
}

async function createGitlabMergeRequest({ repo, token, branchName, title, body, apiBaseUrl }) {
  const apiBase = (apiBaseUrl || `https://${repo.host}/api/v4`).replace(/\/+$/, "");
  const projectId = encodeURIComponent(`${repo.owner}/${repo.repo}`);
  const existingUrl = `${apiBase}/projects/${projectId}/merge_requests?state=opened&source_branch=${encodeURIComponent(branchName)}&target_branch=${encodeURIComponent(MAIN_BRANCH)}`;
  const existing = await fetchJson(existingUrl, {
    headers: {
      "PRIVATE-TOKEN": token
    }
  });
  if (Array.isArray(existing) && existing[0]?.web_url) {
    return {
      ok: true,
      provider: "gitlab",
      created: false,
      url: existing[0].web_url,
      message: "Existing GitLab merge request found for the current update branch."
    };
  }

  const created = await fetchJson(`${apiBase}/projects/${projectId}/merge_requests`, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      source_branch: branchName,
      target_branch: MAIN_BRANCH,
      title,
      description: body
    })
  });

  return {
    ok: true,
    provider: "gitlab",
    created: true,
    url: created.web_url,
    message: "Created GitLab merge request for the current update branch."
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.error_description || `${response.status} ${response.statusText}`;
    throw new Error(`remote review request failed: ${message}`);
  }
  return payload;
}

function reviewLabel(provider) {
  return provider === "gitlab" ? "merge request" : "pull request";
}

function defaultTokenEnv(provider) {
  return provider === "gitlab" ? "GITLAB_TOKEN" : "GITHUB_TOKEN";
}
