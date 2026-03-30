export function createLlmClient(config, env = process.env) {
  const enabled = Boolean(config.llm_enabled);
  const apiKeyEnv = config.llm_api_key_env || "OPENAI_API_KEY";
  const apiKey = env[apiKeyEnv];

  return {
    enabled,
    configured: enabled && Boolean(apiKey),
    provider: config.llm_provider,
    model: config.llm_model,
    baseUrl: config.llm_base_url,
    apiKeyEnv,
    async generateJson({ system, user, schemaHint }) {
      const text = await requestChatCompletion({
        config,
        env,
        system,
        user: `${user}\n\nReturn valid JSON only.${schemaHint ? `\nSchema hint:\n${schemaHint}` : ""}`
      });
      return parseJsonResponse(text);
    },
    async generateText({ system, user }) {
      return requestChatCompletion({ config, env, system, user });
    }
  };
}

async function requestChatCompletion({ config, env, system, user }) {
  if (!config.llm_enabled) {
    throw new Error("LLM is disabled in config");
  }

  const apiKeyEnv = config.llm_api_key_env || "OPENAI_API_KEY";
  const apiKey = env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key in env var ${apiKeyEnv}`);
  }

  const baseUrl = (config.llm_base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.llm_model || "gpt-4.1-mini",
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
  if (!content || typeof content !== "string") {
    throw new Error("LLM response missing message content");
  }
  return content.trim();
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
