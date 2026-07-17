require("dotenv").config();

const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");

const {
  deleteCertifiedSqlAsset,
  getCertifiedSqlAsset,
  listCertifiedSqlAssets,
  publishCertifiedSqlAsset,
  validateCertifiedSqlAsset,
} = require("./certified-sql");
const { getQuery, listQueries } = require("./catalog");
const { explainDatabend, queryDatabend } = require("./databend");
const { isEnabled, summarizeWithLlm } = require("./llm");
const {
  describeTables,
  listDatabases,
  listTables,
} = require("./databend-catalog");
const { enrichDraftWithLlm } = require("./model-enricher");
const {
  alignDraftsWithExistingModel,
  draftYaml,
  generateDrafts,
} = require("./model-generator");
const {
  prepareEntityPublication,
  publishPreparedEntity,
  assertCompatibleReplacement,
} = require("./model-publisher");
const { modelerLogPath, observeModelGeneration } = require("./modeler-log");
const { createPlan } = require("./planner");
const { loadManifest } = require("./manifest");
const {
  listQueryObservations,
  observeQuery,
  queryLogPath,
} = require("./query-log");
const { buildSemanticView } = require("./semantic-view");
const {
  analyzeEvolutionIssue,
  listEvolutionIssues,
} = require("./semantic-evolution");
const {
  getSemanticGateway,
  semanticGatewayMode,
} = require("./semantic-gateway");
const { validateSql } = require("./sql-safety");
const { assembleManifest, stringifyManifest } = require("./semantic-assembler");
const {
  listSemanticSourceFiles,
  readSemanticSourceFile,
} = require("./semantic-source-files");
const {
  deleteSemanticSource,
  saveSemanticSource,
  validateSemanticSource,
  validateSemanticSourceDeletion,
} = require("./semantic-source-editor");

const app = express();
const port = Number(process.env.PORT || 4100);
const host = String(process.env.HOST || "0.0.0.0");

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
    modelerLogPath: modelerLogPath(),
    semanticGateway: semanticGatewayMode(),
  });
});

app.get(
  "/api/query-observability",
  asyncHandler(async (req, res) => {
    res.json(
      await listQueryObservations({
        limit: req.query.limit,
        status: req.query.status,
        sqlOrigin: req.query.sqlOrigin,
        search: req.query.search,
      }),
    );
  }),
);

app.get("/api/query/examples", (_req, res) =>
  res.json({ queries: listQueries() }),
);

app.get(
  "/api/semantic-evolution/issues",
  asyncHandler(async (_req, res) => res.json(await listEvolutionIssues())),
);

app.post(
  "/api/semantic-evolution/analyze",
  asyncHandler(async (req, res) => {
    res.json(
      await analyzeEvolutionIssue(
        String(req.body?.issueId || ""),
        req.body?.reviewerContext,
      ),
    );
  }),
);

app.get("/api/semantic-model", (_req, res) => res.json(buildSemanticView()));

app.get("/api/semantic-model/sources", (_req, res) => {
  res.json({ files: listSemanticSourceFiles() });
});

app.get("/api/semantic-model/source", (req, res) => {
  const source = readSemanticSourceFile(String(req.query.file || "compiled"));
  res.json(source);
});

app.post(
  "/api/semantic-model/source/validate",
  asyncHandler(async (req, res) => {
    res.json(
      await validateSemanticSource(String(req.body?.file), req.body?.content),
    );
  }),
);

app.post(
  "/api/semantic-model/source/save",
  asyncHandler(async (req, res) => {
    if (process.env.MODELER_PUBLISH_ENABLED !== "true")
      return res.status(403).json({ error: "模型发布未启用" });
    const result = await saveSemanticSource(
      String(req.body?.file),
      req.body?.content,
    );
    const gateway = getSemanticGateway();
    if (typeof gateway.reset === "function") gateway.reset(assembleManifest());
    res.json({ ok: true, ...result, compilerReloaded: true });
  }),
);

app.post(
  "/api/semantic-model/source/delete/validate",
  asyncHandler(async (req, res) => {
    res.json(await validateSemanticSourceDeletion(String(req.body?.file)));
  }),
);

app.post(
  "/api/semantic-model/source/delete",
  asyncHandler(async (req, res) => {
    if (process.env.MODELER_PUBLISH_ENABLED !== "true")
      return res.status(403).json({ error: "模型发布未启用" });
    const result = await deleteSemanticSource(String(req.body?.file));
    const gateway = getSemanticGateway();
    if (typeof gateway.reset === "function") gateway.reset(assembleManifest());
    res.json({ ok: true, ...result, compilerReloaded: true });
  }),
);

app.get(
  "/api/modeler/databases",
  asyncHandler(async (_req, res) =>
    res.json({ databases: await listDatabases() }),
  ),
);

app.get(
  "/api/modeler/tables",
  asyncHandler(async (req, res) => {
    const database = validateIdentifier(req.query.database, "database");
    res.json({ database, tables: await listTables(database) });
  }),
);

app.post(
  "/api/modeler/generate",
  asyncHandler(async (req, res) => {
    const requestStartedAt = performance.now();
    const requestId = crypto.randomUUID();
    const database = validateIdentifier(req.body?.database, "database");
    const tables = validateTableNames(req.body?.tables);
    const enrich = req.body?.enrichWithLlm === true;
    const timings = {};
    try {
      const catalogStartedAt = performance.now();
      const metadata = await describeTables(database, tables);
      timings.catalogMs = elapsed(catalogStartedAt);
      const generationStartedAt = performance.now();
      let drafts = alignDraftsWithExistingModel(
        generateDrafts(metadata),
        assembleManifest(),
      );
      timings.generationMs = elapsed(generationStartedAt);
      if (enrich) {
        if (!isEnabled())
          return res.status(400).json({ error: "AI enrichment is disabled" });
        const llmStartedAt = performance.now();
        drafts = await Promise.all(
          drafts.map(async (draft) => {
            try {
              return await enrichDraftWithLlm(
                draft,
                req.body?.businessContext || {},
              );
            } catch (error) {
              draft.diagnostics.llmFallback = true;
              draft.diagnostics.llmWarnings = [
                `LLM 增强失败，已保留规则草稿：${error.message}`,
              ];
              return draft;
            }
          }),
        );
        timings.llmMs = elapsed(llmStartedAt);
      }
      timings.totalMs = elapsed(requestStartedAt);
      await observeModelGeneration({
        requestId,
        database,
        tables,
        enrichWithLlm: enrich,
        timings,
        drafts,
      });
      res.json({
        requestId,
        database,
        generatedAt: new Date().toISOString(),
        llmEnriched:
          enrich && drafts.every((draft) => draft.diagnostics.llmEnriched),
        llmFallback: drafts.some((draft) => draft.diagnostics.llmFallback),
        reviewRequired: true,
        timings,
        drafts: drafts.map((draft) => ({ ...draft, yaml: draftYaml(draft) })),
      });
    } catch (error) {
      timings.totalMs = elapsed(requestStartedAt);
      await observeModelGeneration({
        requestId,
        database,
        tables,
        enrichWithLlm: enrich,
        timings,
        error,
      });
      throw error;
    }
  }),
);

app.post(
  "/api/modeler/validate-draft",
  asyncHandler(async (req, res) => {
    const prepared = prepareEntityPublication(req.body?.yaml);
    assertCompatibleReplacement(prepared);
    res.json({
      valid: true,
      entity: prepared.entity.name,
      replacing: prepared.replacing,
      target: prepared.relativePath,
    });
  }),
);

app.post(
  "/api/modeler/publish",
  asyncHandler(async (req, res) => {
    if (process.env.MODELER_PUBLISH_ENABLED !== "true")
      return res.status(403).json({ error: "模型发布未启用" });
    const prepared = prepareEntityPublication(req.body?.yaml);
    const validation = await validateSemanticSource(
      prepared.relativePath,
      req.body?.yaml,
    );
    const result = publishPreparedEntity(prepared);
    const gateway = getSemanticGateway();
    if (typeof gateway.reset === "function") gateway.reset(assembleManifest());
    res.json({
      ok: true,
      reviewRequired: false,
      ...result,
      compiled: validation.compiled,
      compilerReloaded: true,
      restartRequired: false,
      message: "模型已发布、备份并热重载，无需重启服务。",
    });
  }),
);

app.get("/api/certified-sql", (_req, res) => {
  res.json({
    publishEnabled: process.env.CERTIFIED_SQL_PUBLISH_ENABLED === "true",
    queries: listCertifiedSqlAssets(),
  });
});

app.get("/api/certified-sql/:id", (req, res) => {
  res.json(getCertifiedSqlAsset(req.params.id));
});

app.post(
  "/api/certified-sql/validate",
  asyncHandler(async (req, res) => {
    res.json(validateCertifiedSqlAsset(req.body));
  }),
);

app.post(
  "/api/certified-sql/explain",
  asyncHandler(async (req, res) => {
    const result = validateCertifiedSqlAsset(req.body);
    const startedAt = Date.now();
    const rows = await explainDatabend(result.compiledSql);
    res.json({ ...result, rows, durationMs: Date.now() - startedAt });
  }),
);

app.post(
  "/api/certified-sql/publish",
  asyncHandler(async (req, res) => {
    if (process.env.CERTIFIED_SQL_PUBLISH_ENABLED !== "true")
      return res.status(403).json({ error: "认证 SQL 发布未启用" });
    res.json({ ok: true, ...publishCertifiedSqlAsset(req.body) });
  }),
);

app.delete(
  "/api/certified-sql/:id",
  asyncHandler(async (req, res) => {
    if (process.env.CERTIFIED_SQL_PUBLISH_ENABLED !== "true")
      return res.status(403).json({ error: "认证 SQL 发布未启用" });
    res.json({ ok: true, ...deleteCertifiedSqlAsset(req.params.id) });
  }),
);

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
    const sqlOrigin = classifySqlOrigin(
      suppliedPlan,
      validation.sql || req.body?.sql,
    );
    const policy = loadManifest().ai_policy || {};
    const allowFreeSql = policy.allow_free_sql === true;
    const plan = {
      ...suppliedPlan,
      supported: true,
      route: suppliedPlan.route || "free-sql",
      queryId: suppliedPlan.queryId || "FREE_SQL",
      strategy: suppliedPlan.strategy || "free-sql",
      planner: suppliedPlan.planner || "user-supplied-sql",
      sqlOrigin,
      policy: {
        allowFreeSql,
        usedAllowFreeSql: sqlOrigin === "free-sql",
        decision:
          sqlOrigin === "free-sql"
            ? allowFreeSql
              ? "allowed"
              : "denied"
            : "not-applicable",
      },
      sql: validation.sql || req.body?.sql,
      sqlValues: Array.isArray(req.body?.sqlValues) ? req.body.sqlValues : [],
      validation,
      timings: {
        ...(suppliedPlan.timings || {}),
        validationMs,
      },
    };
    res.locals.queryObservation.plan = plan;
    if (sqlOrigin === "free-sql" && !allowFreeSql) {
      const error = new Error("当前 Semantic Policy 禁止执行自由 SQL");
      await observeQuery({
        operation: "execute-sql",
        request: req.body,
        plan,
        error,
      });
      res.locals.queryObservation.logged = true;
      return res.status(403).json({
        error: error.message,
        policy: plan.policy,
      });
    }
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

app.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  console.log(
    `Databend Semantic Query Lab is listening on http://${displayHost}:${port}`,
  );
  if (host === "0.0.0.0" || host === "::")
    console.log(`LAN access is enabled on port ${port}`);
});

function classifySqlOrigin(plan, sql) {
  if (plan.route === "semantic" && plan.cubeQuery) return "cube-generated";
  if (plan.route === "tpch" && plan.queryId) {
    const definition = getQuery(String(plan.queryId).toUpperCase());
    if (definition?.route === "tpch") {
      const expected = definition.buildSql(
        plan.queryParameters || plan.parameters || {},
      );
      if (normalizeSql(expected) === normalizeSql(sql)) return "certified-sql";
    }
  }
  return "free-sql";
}

function normalizeSql(sql) {
  return String(sql || "")
    .trim()
    .replace(/\s+/g, " ");
}

function validateIdentifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_$-]*$/.test(String(value || "")))
    throw new Error(`Invalid ${label}`);
  return String(value);
}

function validateTableNames(values) {
  if (!Array.isArray(values) || !values.length || values.length > 20)
    throw new Error("Select between 1 and 20 tables");
  return [
    ...new Set(values.map((value) => validateIdentifier(value, "table"))),
  ];
}

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
