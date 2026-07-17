const { randomUUID } = require("node:crypto");
const { ProxyAgent } = require("undici");
const { getQuery, listQueries } = require("./catalog");
const { compileMemberCatalog } = require("./compiler");
const { loadManifest } = require("./manifest");
const { validateSemanticQuery } = require("./semantic-query");
const { observeLlm } = require("./llm-log");

const VALID_MODES = new Set(["auto", "semantic", "tpch"]);

function isEnabled() {
  return process.env.AI_ENABLED === "true" && Boolean(process.env.AI_API_KEY);
}

async function planWithLlm(question, mode = "auto") {
  if (!isEnabled()) throw new Error("AI planner is disabled");
  if (!VALID_MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const catalog = listQueries()
    .filter((query) => mode === "auto" || query.route === mode)
    .map(({ id, route, title, description, examples, parameters }) => ({
      id,
      route,
      title,
      description,
      examples,
      defaultParameters: parameters,
    }));
  const response = await requestCompletion(
    [
      {
        role: "system",
        content: [
          "You are a strict semantic query planner for Cube and Databend.",
          "Use this priority: (1) select an exact certified query, (2) build a dynamic Cube Query from public semantic members, (3) reject.",
          "For TPC-H routes, only select a certified query ID. Never generate SQL.",
          "For dynamic semantic routes, queryId must be null and cubeQuery may contain only measures, dimensions, timeDimensions, filters, segments, order, and limit.",
          "Efficiency/效率 questions may use governed efficiency members such as delayedCount, averageTransitDays, and averageDelayDays; never calculate unmodeled ratios.",
          "Use segments for semantic members whose kind is filter; for example LineItem.delayedReceipt must appear in segments, not filters.",
          "Use exact member identifiers from the supplied semanticMemberCatalog.",
          "Allowed granularities: year, quarter, month, week, day.",
          "Allowed filter operators: equals, notEquals, contains, startsWith, gt, gte, lt, lte, inDateRange, notInDateRange, set, notSet.",
          "Never invent a metric. Interpret generic sales/销售情况/销售额 as Orders.totalPrice only when that modeled metric fits the question.",
          "For certified Q6, extract only startDate, endDate, discountMin, discountMax, and quantity. Percentages must be decimals.",
          "Return JSON only with this shape:",
          '{"supported":boolean,"strategy":"certified|dynamic|reject","queryId":string|null,"confidence":number,"parameters":object,"cubeQuery":object|null,"reason":string}',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          mode,
          question,
          certifiedQueryCatalog: catalog,
          semanticMemberCatalog: compileMemberCatalog(loadManifest()),
        }),
      },
    ],
    { operation: "query-planning" },
  );
  return validateLlmPlan(response, question, mode);
}

async function summarizeWithLlm({ question, plan, data }) {
  if (!isEnabled() || !Array.isArray(data) || !data.length) return null;
  const limitedData = data.slice(0, 20);
  const response = await requestCompletion(
    [
      {
        role: "system",
        content:
          '用简洁中文总结真实查询结果。只能使用提供的数据，不得推测或编造。返回 JSON：{"summary":"..."}。',
      },
      {
        role: "user",
        content: JSON.stringify({
          question,
          queryId: plan.queryId,
          data: limitedData,
        }),
      },
    ],
    { operation: "result-summary" },
  );
  return typeof response.summary === "string" ? response.summary : null;
}

async function requestCompletion(messages, options = {}) {
  const baseUrl = String(
    process.env.AI_BASE_URL || "https://api.openai.com/v1",
  ).replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/v1")
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
  const timeout = Number(
    options.timeoutMs || process.env.AI_REQUEST_TIMEOUT_MS || 30000,
  );
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const llmRequestId = randomUUID();
  const request = {
    model,
    messages,
    temperature: 0,
    max_tokens: options.maxTokens || 500,
    response_format: { type: "json_object" },
  };
  const startedAt = performance.now();
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": llmRequestId,
      },
      body: JSON.stringify(request),
      dispatcher: proxyDispatcher(endpoint),
      signal: AbortSignal.timeout(timeout),
    });
    body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(
        body.error?.message || `AI provider returned HTTP ${response.status}`,
      );
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI provider returned an empty response");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI provider did not return valid JSON");
    }
    await observeLlm({
      llmRequestId,
      operation: options.operation,
      provider: new URL(endpoint).hostname,
      endpoint: redactEndpoint(endpoint),
      model,
      timeoutMs: timeout,
      durationMs: elapsed(startedAt),
      request,
      response: {
        providerRequestId: response.headers.get("x-request-id") || body.id,
        id: body.id,
        model: body.model,
        created: body.created,
        usage: body.usage,
        finishReason: body.choices?.[0]?.finish_reason,
        message: body.choices?.[0]?.message,
        parsed,
      },
      http: { status: response.status, ok: response.ok },
    });
    return parsed;
  } catch (error) {
    await observeLlm({
      llmRequestId,
      operation: options.operation,
      provider: new URL(endpoint).hostname,
      endpoint: redactEndpoint(endpoint),
      model,
      timeoutMs: timeout,
      durationMs: elapsed(startedAt),
      request,
      response: body
        ? {
            providerRequestId: response?.headers.get("x-request-id") || body.id,
            id: body.id,
            model: body.model,
            usage: body.usage,
            error: body.error,
            choices: body.choices,
          }
        : undefined,
      http: response ? { status: response.status, ok: response.ok } : undefined,
      error,
    });
    throw error;
  }
}

function redactEndpoint(endpoint) {
  const url = new URL(endpoint);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function proxyDispatcher(endpoint) {
  const hostname = new URL(endpoint).hostname;
  const noProxy = String(process.env.NO_PROXY || process.env.no_proxy || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    noProxy.some((item) => hostname === item || hostname.endsWith(`.${item}`))
  )
    return undefined;
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

function validateLlmPlan(result, question, mode) {
  if (result.supported === false || result.strategy === "reject") {
    return {
      supported: false,
      question,
      mode,
      planner: "llm",
      message:
        result.reason ||
        "AI planner could not map this request to a certified query.",
    };
  }
  if (result.strategy === "dynamic" || (!result.queryId && result.cubeQuery)) {
    if (mode === "tpch")
      throw new Error(
        "AI planner selected a semantic query outside the requested mode",
      );
    const cubeQuery = validateSemanticQuery(
      result.cubeQuery,
      compileMemberCatalog(loadManifest()),
    );
    return {
      supported: true,
      question,
      route: "semantic",
      queryId: "DYNAMIC",
      title: "动态语义查询",
      description: "基于 Portable Semantic Manifest 受控生成的 Cube Query。",
      confidence: clamp(Number(result.confidence) || 0.8, 0, 1),
      planner: "llm",
      strategy: "dynamic",
      reason: result.reason,
      parameters: {},
      cubeQuery,
    };
  }

  const definition = getQuery(String(result.queryId || "").toUpperCase());
  if (!definition)
    throw new Error("AI planner selected an unknown certified query");
  if (mode !== "auto" && definition.route !== mode)
    throw new Error("AI planner selected a query outside the requested mode");

  const parameters =
    definition.id === "Q6"
      ? validateQ6Parameters({
          ...definition.parameters,
          ...(result.parameters || {}),
        })
      : { ...(definition.parameters || {}) };
  return {
    supported: true,
    question,
    route: definition.route,
    queryId: definition.id,
    title: definition.title,
    description: definition.description,
    confidence: clamp(Number(result.confidence) || 0.8, 0, 1),
    planner: "llm",
    strategy: "certified",
    reason: result.reason,
    parameters,
    cubeQuery: definition.cubeQuery,
  };
}

function validateQ6Parameters(parameters) {
  const allowed = new Set([
    "startDate",
    "endDate",
    "discountMin",
    "discountMax",
    "quantity",
  ]);
  const result = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (!allowed.has(key)) continue;
    if (
      (key === "startDate" || key === "endDate") &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ) {
      throw new Error(`AI planner returned an invalid ${key}`);
    }
    if (
      key.startsWith("discount") &&
      (!Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 1)
    ) {
      throw new Error(`AI planner returned an invalid ${key}`);
    }
    if (
      key === "quantity" &&
      (!Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 1000000)
    ) {
      throw new Error("AI planner returned an invalid quantity");
    }
    result[key] =
      key === "startDate" || key === "endDate" ? String(value) : Number(value);
  }
  return result;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  isEnabled,
  planWithLlm,
  requestCompletion,
  summarizeWithLlm,
  validateLlmPlan,
};
