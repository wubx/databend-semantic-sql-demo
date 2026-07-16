const { getQuery } = require("./catalog");
const { isEnabled, planWithLlm } = require("./llm");
const { deterministicPlan } = require("./router");
const { getCubeSql } = require("./cube");
const { validateSql } = require("./sql-safety");

async function createPlan({ question, mode = "auto", planner = "auto" }) {
  const totalStartedAt = performance.now();
  const timings = {};
  let plan;
  const routingStartedAt = performance.now();
  if (planner !== "deterministic" && isEnabled()) {
    const llmStartedAt = performance.now();
    try {
      plan = await planWithLlm(question, mode);
    } catch (error) {
      timings.llmMs = elapsed(llmStartedAt);
      const fallbackStartedAt = performance.now();
      plan = deterministicPlan(question, mode);
      timings.fallbackMs = elapsed(fallbackStartedAt);
      plan.fallback = {
        from: "llm",
        reason: error.message,
      };
    }
    timings.llmMs ??= elapsed(llmStartedAt);
  } else {
    const deterministicStartedAt = performance.now();
    plan = deterministicPlan(question, mode);
    timings.deterministicMs = elapsed(deterministicStartedAt);
  }
  timings.routingMs = elapsed(routingStartedAt);
  if (!plan.supported) {
    timings.totalMs = elapsed(totalStartedAt);
    plan.timings = timings;
    return plan;
  }

  const sqlStartedAt = performance.now();
  if (plan.route === "semantic") {
    const generated = await getCubeSql(plan.cubeQuery);
    plan.sql = generated.sql;
    plan.sqlValues = generated.values;
  } else {
    plan.sql = getQuery(plan.queryId).buildSql(plan.parameters);
    plan.sqlValues = [];
  }
  timings.sqlGenerationMs = elapsed(sqlStartedAt);

  const validationStartedAt = performance.now();
  plan.validation = validateSql(plan.sql);
  timings.validationMs = elapsed(validationStartedAt);
  timings.totalMs = elapsed(totalStartedAt);
  plan.timings = timings;
  return plan;
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

module.exports = { createPlan };
