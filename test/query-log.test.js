const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  createObservation,
  writeQueryObservation,
} = require("../src/query-log");

test("builds an observation with question, Cube Query, SQL, and timings", () => {
  const observation = createObservation({
    operation: "execute",
    request: {
      question: "统计延迟收货的明细数量",
      mode: "auto",
      planner: "auto",
    },
    plan: {
      supported: true,
      queryId: "S5",
      route: "semantic",
      planner: "llm",
      cubeQuery: {
        measures: ["LineItem.count"],
        segments: ["LineItem.delayedReceipt"],
      },
      sql: "SELECT count(*) FROM tpch_100.lineitem",
      sqlValues: [],
      timings: { llmMs: 1200, sqlGenerationMs: 20, totalMs: 1220 },
    },
    response: {
      data: [{ "LineItem.count": "379356474" }],
      source: "Cube semantic query",
      summary: "延迟收货的明细数量为379356474条。",
      timings: {
        planningMs: 1220,
        queryMs: 30,
        summaryMs: 500,
        totalMs: 1750,
      },
    },
  });

  assert.equal(observation.question, "统计延迟收货的明细数量");
  assert.deepEqual(observation.cubeQuery.segments, ["LineItem.delayedReceipt"]);
  assert.equal(observation.sql, "SELECT count(*) FROM tpch_100.lineitem");
  assert.equal(observation.timings.llmMs, 1200);
  assert.equal(observation.timings.queryMs, 30);
  assert.equal(observation.timings.totalRequestMs, 1750);
  assert.equal(observation.result.rowCount, 1);
});

test("appends observations as JSON Lines", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "query-log-"));
  const previousPath = process.env.QUERY_LOG_PATH;
  process.env.QUERY_LOG_PATH = path.join(directory, "queries.jsonl");
  try {
    await writeQueryObservation({ requestId: "one", question: "first" });
    await writeQueryObservation({ requestId: "two", question: "second" });
    const lines = (await fs.readFile(process.env.QUERY_LOG_PATH, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(
      lines.map((line) => line.requestId),
      ["one", "two"],
    );
  } finally {
    if (previousPath === undefined) delete process.env.QUERY_LOG_PATH;
    else process.env.QUERY_LOG_PATH = previousPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
