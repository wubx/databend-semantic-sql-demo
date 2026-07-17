const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_LLM_LOG_PATH = path.join(
  __dirname,
  "..",
  "logs",
  "llm-observability.jsonl",
);
let writeQueue = Promise.resolve();

function isLlmLogEnabled() {
  return process.env.LLM_LOG_ENABLED !== "false";
}

function llmLogPath() {
  return path.resolve(process.env.LLM_LOG_PATH || DEFAULT_LLM_LOG_PATH);
}

function createLlmObservation(input) {
  return compact({
    timestamp: new Date().toISOString(),
    llmRequestId: input.llmRequestId || randomUUID(),
    operation: input.operation || "completion",
    status: input.error
      ? isTimeoutError(input.error)
        ? "timeout"
        : "error"
      : "success",
    provider: input.provider,
    endpoint: input.endpoint,
    model: input.model,
    timeoutMs: input.timeoutMs,
    durationMs: input.durationMs,
    request: input.request,
    requestRaw: input.requestRaw,
    response: input.response,
    responseRaw: input.responseRaw,
    http: input.http,
    error: input.error
      ? {
          name: input.error.name,
          message: input.error.message || String(input.error),
          timeout: isTimeoutError(input.error),
        }
      : undefined,
  });
}

async function listLlmObservations({ limit = 50, status, operation, search } = {}) {
  const requestedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const records = await readRecentJsonLines(llmLogPath(), 10 * 1024 * 1024);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const filtered = records
    .filter((item) => !status || item.status === status)
    .filter((item) => !operation || item.operation === operation)
    .filter((item) => {
      if (!normalizedSearch) return true;
      return [
        item.llmRequestId,
        item.model,
        item.operation,
        item.error?.message,
        item.requestRaw,
        item.responseRaw,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  return {
    observations: filtered.slice(-requestedLimit).reverse(),
    stats: {
      total: records.length,
      success: records.filter((item) => item.status === "success").length,
      timeout: records.filter((item) => item.status === "timeout").length,
      errors: records.filter((item) => item.status === "error").length,
    },
    windowSize: records.length,
    matched: filtered.length,
    logFile: path.basename(llmLogPath()),
  };
}

async function readRecentJsonLines(filePath, maxBytes) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    let text = buffer.toString("utf8");
    if (size > length) text = text.slice(text.indexOf("\n") + 1);
    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  } finally {
    await handle?.close();
  }
}

async function writeLlmObservation(observation) {
  if (!isLlmLogEnabled()) return;
  const filePath = llmLogPath();
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(observation)}\n`, "utf8");
    });
  return writeQueue;
}

async function observeLlm(input) {
  const observation = createLlmObservation(input);
  try {
    await writeLlmObservation(observation);
  } catch (error) {
    console.warn(`LLM observation log unavailable: ${error.message}`);
  }
  return observation;
}

function isTimeoutError(error) {
  return (
    error?.name === "TimeoutError" ||
    /timeout|timed out|aborted due to timeout/i.test(
      String(error?.message || error || ""),
    )
  );
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

module.exports = {
  DEFAULT_LLM_LOG_PATH,
  createLlmObservation,
  isLlmLogEnabled,
  listLlmObservations,
  llmLogPath,
  observeLlm,
  writeLlmObservation,
};
