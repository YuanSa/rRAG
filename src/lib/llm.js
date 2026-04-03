const DEFAULTS = {
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    requiresApiKey: true
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434",
    requiresApiKey: false
  },
  "llama.cpp": {
    baseUrl: "http://127.0.0.1:8080/v1",
    requiresApiKey: false
  }
};

export function createLlmClient(config, env = process.env) {
  const provider = normalizeProvider(config.llm_provider);
  const providerDefaults = DEFAULTS[provider];
  const enabled = Boolean(config.llm_enabled);
  const apiKeyEnv = config.llm_api_key_env || "OPENAI_API_KEY";
  const apiKey = env[apiKeyEnv];
  const model = config.llm_model || "gpt-4.1-mini";
  const baseUrl = normalizeBaseUrl(config.llm_base_url || providerDefaults.baseUrl);
  const requiresApiKey = providerDefaults.requiresApiKey;
  const configured = enabled && Boolean(model) && Boolean(baseUrl) && (!requiresApiKey || Boolean(apiKey));

  return {
    enabled,
    configured,
    provider,
    model,
    baseUrl,
    apiKeyEnv,
    requiresApiKey,
    async generateJson({ system, user, schemaHint }) {
      const text = await requestChatCompletion({
        provider,
        baseUrl,
        model,
        apiKey,
        requiresApiKey,
        system,
        user: `${user}\n\nReturn valid JSON only.${schemaHint ? `\nSchema hint:\n${schemaHint}` : ""}`
      });
      return parseJsonResponse(text);
    },
    async generateText({ system, user }) {
      return requestChatCompletion({
        provider,
        baseUrl,
        model,
        apiKey,
        requiresApiKey,
        system,
        user
      });
    }
  };
}

async function requestChatCompletion({ provider, baseUrl, model, apiKey, requiresApiKey, system, user }) {
  if (!baseUrl) {
    throw new Error("LLM base URL is not configured");
  }
  if (!model) {
    throw new Error("LLM model is not configured");
  }
  if (requiresApiKey && !apiKey) {
    throw new Error("Missing API key for configured LLM provider");
  }

  switch (provider) {
    case "ollama":
      return requestOllamaChat({ baseUrl, model, system, user });
    case "llama.cpp":
    case "openai-compatible":
      return requestOpenAiCompatibleChat({ baseUrl, model, apiKey, system, user, requiresApiKey });
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function requestOpenAiCompatibleChat({ baseUrl, model, apiKey, system, user, requiresApiKey }) {
  const headers = {
    "content-type": "application/json"
  };
  if (requiresApiKey && apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const joined = content.map(item => item?.text ?? "").join("").trim();
    if (joined) {
      return joined;
    }
  }
  throw new Error("LLM response missing message content");
}

async function requestOllamaChat({ baseUrl, model, system, user }) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: 0.2
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Ollama response missing message content");
  }
  return content.trim();
}

function normalizeProvider(provider) {
  const normalized = String(provider || "openai-compatible").trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai-compatible") {
    return "openai-compatible";
  }
  if (normalized === "ollama") {
    return "ollama";
  }
  if (normalized === "llama.cpp" || normalized === "llamacpp" || normalized === "llama-cpp") {
    return "llama.cpp";
  }
  return normalized;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1]);
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Failed to parse JSON from LLM response");
  }
}
