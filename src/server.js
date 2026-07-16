require("dotenv").config();

const path = require("node:path");
const express = require("express");

const { listQueries } = require("./catalog");
const { explainDatabend, queryDatabend } = require("./databend");
const { isEnabled, summarizeWithLlm } = require("./llm");
const { createPlan } = require("./planner");
const { observeQuery, queryLogPath } = require("./query-log");
const { buildSemanticView } = require("./semantic-view");
const {
  getSemanticGateway,
  semanticGatewayMode,
} = require("./semantic-gateway");
const { validateSql } = require("./sql-safety");

const app = express();
const port = Number(process.env.PORT || 4100);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", async (_req, res) => {
  const checks = {
    api: { ok: true },
    cube: { ok: false },
    databend: { ok: false },
  };
  await Promise.all([
    getSemanticGateway()
      .health()
      .then((value) => {
        checks.cube = value;
      })
      .catch((error) => {
        checks.cube.error = error.message;
      }),
    queryDatabend("SELECT 1 AS value")
      .then(() => {
        checks.databend.ok = true;
      })
      .catch((error) => {
        checks.databend.error = error.message;
      }),
  ]);
  const ok = Object.values(checks).every((check) => check.ok);
  res.status(ok ? 200 : 503).json({
    ok,
    checks,
    aiEnabled: isEnabled(),
    aiModel: isEnabled() ? process.env.AI_MODEL : null,
    queryLogPath: queryLogPath(),
    semanticGateway: semanticGatewayMode(),
  });
});

app.get("/api/query/examples", (_req, res) =>
  res.json({ queries: listQueries() }),
);

app.get("/api/semantic-model", (_req, res) => res.json(buildSemanticView()));

app.post(
  "/api/query/plan",
  asyncHandler(async (req, res) => {
    res.locals.queryObservation = { operation: "plan", request: req.body };
    const plan = await createPlan(req.body || {});
    res.locals.queryObservation.plan = plan;
    await observeQuery({ operation: "plan", request: req.body, plan });
    res.locals.queryObservation.logged = true;
    res.json(plan);
  }),
);

app.post(
  "/api/query/validate",
  asyncHandler(async (req, res) => {
    res.json(validateSql(req.body?.sql));
  }),
);

app.post(
  "/api/query/explain",
  asyncHandler(async (req, res) => {
    const validation = validateSql(req.body?.sql, { allowExplain: false });
    if (!validation.valid) return res.status(400).json(validation);
    const startedAt = Date.now();
    const rows = await explainDatabend(validation.sql);
    return res.json({ validation, rows, durationMs: Date.now() - startedAt });
  }),
);

app.post(
  "/api/query/execute-sql",
  asyncHandler(async (req, res) => {
    res.locals.queryObservation = {
      operation: "execute-sql",
      request: req.body,
      startedAt: performance.now(),
    };
    const validationStartedAt = performance.now();
    const validation = validateSql(req.body?.sql);
    const validationMs = elapsed(validationStartedAt);
    const suppliedPlan = req.body?.plan || {};
    const plan = {
      ...suppliedPlan,
      supported: true,
      sql: validation.sql || req.body?.sql,
      sqlValues: Array.isArray(req.body?.sqlValues) ? req.body.sqlValues : [],
      validation,
      timings: {
        ...(suppliedPlan.timings || {}),
        validationMs,
      },
    };
    res.locals.queryObservation.plan = plan;
    if (!validation.valid) {
      await observeQuery({ operation: "execute-sql", request: req.body, plan });
      res.locals.queryObservation.logged = true;
      return res.status(400).json(validation);
    }
    if (plan.sqlValues.length && plan.route !== "semantic") {
      const error = new Error("只有 Semantic 路径支持通过 Cube 绑定 SQL 参数");
      await observeQuery({
        operation: "execute-sql",
        request: req.body,
        plan,
        error,
      });
      res.locals.queryObservation.logged = true;
      return res.status(400).json({ error: error.message });
    }

    const queryStartedAt = performance.now();
    let data;
    let annotation;
    let requestId;
    let source;
    if (plan.route === "semantic" && plan.cubeQuery) {
      const result = await getSemanticGateway().execute(plan.cubeQuery);
      data = result.data;
      annotation = result.annotation;
      requestId = result.requestId;
      source = result.source;
    } else {
      const rows = await queryDatabend(plan.sql);
      data = rows.slice(0, Number(process.env.RESULT_ROW_LIMIT || 500));
      source = "Validated generated SQL";
    }
    const queryMs = elapsed(queryStartedAt);
    const response = {
      plan,
      data,
      annotation,
      requestId,
      durationMs: queryMs,
      source,
      timings: {
        planningMs: suppliedPlan.timings?.totalMs,
        validationMs,
        queryMs,
      },
    };
    response.summary = await timedSummary(req.body?.question, plan, response);
    response.timings.totalMs = elapsed(res.locals.queryObservation.startedAt);
    await observeQuery({
      operation: "execute-sql",
      request: req.body,
      plan,
      response,
    });
    res.locals.queryObservation.logged = true;
    return res.json(response);
  }),
);

app.post(
  "/api/query/execute",
  asyncHandler(async (req, res) => {
    res.locals.queryObservation = {
      operation: "execute",
      request: req.body,
      startedAt: performance.now(),
    };
    const requestStartedAt = res.locals.queryObservation.startedAt;
    const plan = await createPlan(req.body || {});
    res.locals.queryObservation.plan = plan;
    if (!plan.supported) {
      await observeQuery({ operation: "execute", request: req.body, plan });
      res.locals.queryObservation.logged = true;
      return res.status(422).json(plan);
    }
    if (!plan.validation.valid) {
      await observeQuery({ operation: "execute", request: req.body, plan });
      res.locals.queryObservation.logged = true;
      return res.status(400).json(plan);
    }

    const startedAt = Date.now();
    if (plan.route === "semantic") {
      const result = await getSemanticGateway().execute(plan.cubeQuery);
      const response = {
        plan,
        data: result.data,
        annotation: result.annotation,
        durationMs: Date.now() - startedAt,
        source: result.source,
        requestId: result.requestId,
        timings: {
          planningMs: plan.timings?.totalMs,
          queryMs: Date.now() - startedAt,
        },
      };
      response.summary = await timedSummary(req.body?.question, plan, response);
      response.timings.totalMs = elapsed(requestStartedAt);
      await observeQuery({
        operation: "execute",
        request: req.body,
        plan,
        response,
      });
      res.locals.queryObservation.logged = true;
      return res.json(response);
    }

    const executionStartedAt = performance.now();
    await explainDatabend(plan.sql);
    const explainMs = elapsed(executionStartedAt);
    const queryStartedAt = performance.now();
    const rows = await queryDatabend(plan.sql);
    const response = {
      plan,
      data: rows.slice(0, Number(process.env.RESULT_ROW_LIMIT || 500)),
      durationMs: Date.now() - startedAt,
      source: "Certified TPC-H SQL",
      timings: {
        planningMs: plan.timings?.totalMs,
        explainMs,
        queryMs: elapsed(queryStartedAt),
      },
    };
    response.summary = await timedSummary(req.body?.question, plan, response);
    response.timings.totalMs = elapsed(requestStartedAt);
    await observeQuery({
      operation: "execute",
      request: req.body,
      plan,
      response,
    });
    res.locals.queryObservation.logged = true;
    return res.json(response);
  }),
);

app.get("*splat", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html")),
);

app.use((error, _req, res, _next) => {
  console.error(error);
  const context = res.locals.queryObservation;
  if (context && !context.logged) {
    const response = context.startedAt
      ? { timings: { totalMs: elapsed(context.startedAt) } }
      : undefined;
    observeQuery({ ...context, response, error }).finally(() => {
      res.status(500).json({ error: error.message || String(error) });
    });
    return;
  }
  res.status(500).json({ error: error.message || String(error) });
});

app.listen(port, () => {
  console.log(
    `Databend Semantic SQL Demo is listening on http://localhost:${port}`,
  );
});

function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

async function timedSummary(question, plan, response) {
  const startedAt = performance.now();
  response.timings ??= {};
  response.timings.summaryMs = 0;
  try {
    const summary = await summarizeWithLlm({
      question,
      plan,
      data: response.data,
    });
    response.timings.summaryMs = elapsed(startedAt);
    return summary;
  } catch (error) {
    response.timings.summaryMs = elapsed(startedAt);
    console.warn(`AI summary unavailable: ${error.message}`);
    return null;
  }
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}
