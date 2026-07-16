const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_LOG_PATH = path.join(
  __dirname,
  "..",
  "logs",
  "query-observability.jsonl",
);
let writeQueue = Promise.resolve();

function isQueryLogEnabled() {
  return process.env.QUERY_LOG_ENABLED !== "false";
}

function queryLogPath() {
  return path.resolve(process.env.QUERY_LOG_PATH || DEFAULT_LOG_PATH);
}

function createObservation({ operation, request, plan, response, error }) {
  return compact({
    timestamp: new Date().toISOString(),
    requestId: response?.requestId || randomUUID(),
    operation,
    status: error
      ? "error"
      : plan?.supported === false
        ? "rejected"
        : "success",
    question: request?.question ?? null,
    requestedMode: request?.mode || undefined,
    requestedPlanner: request?.planner || undefined,
    route: plan?.route,
    queryId: plan?.queryId,
    strategy: plan?.strategy,
    planner: plan?.planner,
    confidence: plan?.confidence,
    queryUnderstanding: plan?.queryUnderstanding,
    fallback: plan?.fallback,
    cubeQuery: plan?.cubeQuery,
    sql: plan?.sql,
    sqlValues: plan?.sqlValues,
    validation: plan?.validation,
    timings: compact({
      ...plan?.timings,
      planningMs: response?.timings?.planningMs,
      explainMs: response?.timings?.explainMs,
      queryMs: response?.timings?.queryMs,
      summaryMs: response?.timings?.summaryMs,
      totalRequestMs: response?.timings?.totalMs,
    }),
    result: response
      ? {
          source: response.source,
          rowCount: Array.isArray(response.data)
            ? response.data.length
            : undefined,
          summary: response.summary,
        }
      : undefined,
    error: error ? error.message || String(error) : undefined,
  });
}

async function writeQueryObservation(observation) {
  if (!isQueryLogEnabled()) return;
  const logPath = queryLogPath();
  const line = `${JSON.stringify(observation)}\n`;
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.appendFile(logPath, line, "utf8");
    });
  return writeQueue;
}

async function observeQuery(input) {
  const observation = createObservation(input);
  try {
    await writeQueryObservation(observation);
  } catch (error) {
    console.warn(`Query observation log unavailable: ${error.message}`);
  }
  return observation;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

module.exports = {
  DEFAULT_LOG_PATH,
  createObservation,
  isQueryLogEnabled,
  observeQuery,
  queryLogPath,
  writeQueryObservation,
};
