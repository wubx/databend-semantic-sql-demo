const { randomUUID } = require("node:crypto");
const { ProxyAgent } = require("undici");
const { getQuery, listQueries } = require("./catalog");
const { compileMemberCatalog } = require("./compiler");
const { loadManifest } = require("./manifest");
const { validateSemanticQuery } = require("./semantic-query");
const { validateSemanticWorkflow } = require("./semantic-workflow");
const { observeLlm } = require("./llm-log");

const VALID_MODES = new Set(["auto", "semantic", "tpch"]);

function isEnabled() {
  return process.env.AI_ENABLED === "true" && Boolean(process.env.AI_API_KEY);
}

async function planWithLlm(question, mode = "auto") {
  if (!isEnabled()) throw new Error("AI planner is disabled");
  if (!VALID_MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const catalog = listQueries()
    .filter(
      (query) =>
        query.route === "tpch" && (mode === "auto" || query.route === mode),
    )
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
          "Use this priority: (1) select an exact certified TPC-H query, (2) build a single dynamic Cube Query when one final grain is sufficient, (3) build a semantic workflow for parent Top N followed by child-detail expansion, (4) reject.",
          "The application has already ruled out an exact semantic certified-query match. Never select an S-prefixed semantic certified query here; build a dynamic Cube Query from public semantic members instead.",
          "For TPC-H routes, only select a certified query ID. Never generate SQL.",
          "For dynamic semantic routes, queryId must be null and cubeQuery may contain only measures, dimensions, timeDimensions, filters, segments, order, limit, and ungrouped.",
          "For raw record/detail/list requests, set ungrouped to true, omit measures, select useful public dimensions and public facts in dimensions, and set an explicit limit no greater than 100. Facts are allowed in dimensions and order only when ungrouped is true. Use ungrouped false or omit it for grouped analysis and distinct dimension-value questions.",
          "For ranking and superlative requests such as most/least/highest/lowest/最多/最少/最高/最低, order by the metric that defines the superlative and use limit 1 unless the user requests a larger top N. Return only members needed to answer the question.",
          "Efficiency/效率 questions may use governed efficiency members such as delayedCount, averageTransitDays, and averageDelayDays; never calculate unmodeled ratios. Do not treat a request for average duration as a generic efficiency analysis when the user specifies a different ranking metric.",
          "For a parent Top N followed by complete one-to-many child details, use strategy workflow with exactly two ungrouped stages. Stage 1 selects, orders, and limits parent keys. Stage 2 selects child details and declares a binding from the exported parent key to a public child key. Do not add the injected key filter yourself. Parent limit is at most 100; detail limit is at most 1000; select at most 16 detail dimensions.",
          "A workflow has this shape: {stages:[{id,query,exportMember},{id,dependsOn,query,binding:{fromStage,sourceMember,targetMember}}],outputStage}. Use CustomerNation.name for customer country and SupplierNation.name for supplier country. Customer country is not a receipt/delivery country.",
          "Use segments for semantic members whose kind is filter; for example LineItem.delayedReceipt must appear in segments, not filters.",
          "Use exact member identifiers from the supplied semanticMemberCatalog.",
          "For physical row-count questions such as 多少条/记录条数/row count on LineItem, prefer LineItem.rowCount; use LineItem.count only when the user asks for governed entity count or deduplicated line-item count.",
          "Allowed granularities: year, quarter, month, week, day.",
          "Allowed filter operators: equals, notEquals, contains, startsWith, gt, gte, lt, lte, inDateRange, notInDateRange, set, notSet.",
          "Never invent a metric. Interpret generic sales/销售情况/销售额 as Orders.totalPrice only when that modeled metric fits the question.",
          "For certified Q6, extract only startDate, endDate, discountMin, discountMax, and quantity. Percentages must be decimals.",
          "When rejecting, provide actionable maintenance diagnostics: rejectionCategory, missingMembers, affectedEntities, and suggestedActions. Use rejectionCategory semantic-gap for missing metrics/dimensions, grain-mismatch for unsafe cross-grain analysis, relationship-gap for missing joins, policy for governed denial, ambiguous for unclear business meaning, or unsupported-domain.",
          "Return JSON only with this shape:",
          '{"supported":boolean,"strategy":"certified|dynamic|workflow|reject","queryId":string|null,"confidence":number,"parameters":object,"cubeQuery":{"measures":string[],"dimensions":string[],"timeDimensions":object[],"filters":object[],"segments":string[],"order":object,"limit":number,"ungrouped":boolean}|null,"workflow":{"stages":[{"id":string,"query":object,"exportMember":string},{"id":string,"dependsOn":string,"query":object,"binding":{"fromStage":string,"sourceMember":string,"targetMember":string}}],"outputStage":string}|null,"reason":string,"rejectionCategory":string|null,"missingMembers":string[],"affectedEntities":string[],"suggestedActions":string[]}',
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
    {
      operation: "query-planning",
      timeoutMs: Number(process.env.AI_PLANNING_TIMEOUT_MS || 60000),
    },
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
          '用简洁中文总结真实查询结果。只能使用提供的数据，不得推测或编造。data 可能只是用于总结的样本；必须使用 resultMetadata 中的实际总行数、工作流父记录数、明细行数和完整性，不得把样本行数说成完整结果行数。返回 JSON：{"summary":"..."}。',
      },
      {
        role: "user",
        content: JSON.stringify({
          question,
          queryId: plan.queryId,
          resultMetadata: {
            totalRows: data.length,
            workflow: plan.resultMetadata?.workflow,
          },
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
      confidence: clamp(Number(result.confidence) || 0, 0, 1),
      reason: result.reason,
      rejectionDiagnostics: normalizeRejectionDiagnostics(result),
      message:
        result.reason ||
        "AI planner could not map this request to a certified query.",
    };
  }
  if (result.strategy === "workflow" || result.workflow) {
    if (mode === "tpch")
      throw new Error(
        "AI planner selected a semantic workflow outside the requested mode",
      );
    return {
      supported: true,
      question,
      route: "semantic-workflow",
      queryId: "WORKFLOW",
      title: "多阶段语义查询",
      description: "使用受控 Cube Query 阶段选择父实体并展开子明细。",
      confidence: clamp(Number(result.confidence) || 0.8, 0, 1),
      planner: "llm",
      strategy: "workflow",
      reason: result.reason,
      parameters: {},
      workflow: validateSemanticWorkflow(result.workflow),
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
  if (definition.route === "semantic")
    throw new Error(
      "AI planner selected a non-exact semantic certified query; a dynamic Cube Query is required",
    );
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

function normalizeRejectionDiagnostics(result) {
  const allowedCategories = new Set([
    "semantic-gap",
    "grain-mismatch",
    "relationship-gap",
    "policy",
    "ambiguous",
    "unsupported-domain",
  ]);
  return {
    category: allowedCategories.has(result.rejectionCategory)
      ? result.rejectionCategory
      : "unclassified",
    missingMembers: uniqueDiagnosticStrings(result.missingMembers),
    affectedEntities: uniqueDiagnosticStrings(result.affectedEntities),
    suggestedActions: uniqueDiagnosticStrings(result.suggestedActions),
  };
}

function uniqueDiagnosticStrings(values) {
  return Array.isArray(values)
    ? [
        ...new Set(
          values
            .map(String)
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ].slice(0, 10)
    : [];
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
