# Query observability log

The demo appends one JSON object per line (`JSONL`) for every request to:

- `POST /api/query/plan`
- `POST /api/query/execute`

The default file is:

```text
logs/query-observability.jsonl
```

JSONL is used instead of a JSON array so that records can be appended safely,
streamed with standard tools, and imported into Databend or another observability
system later. Each line is a complete, independently parseable JSON document.

## Configuration

```env
QUERY_LOG_ENABLED=true
QUERY_LOG_PATH=logs/query-observability.jsonl
```

- Logging is enabled unless `QUERY_LOG_ENABLED=false`.
- `QUERY_LOG_PATH` may be absolute or relative to the server working directory.
- The parent directory and file are created automatically.
- Log files are ignored by Git through `*.log`; the default `.jsonl` file is
  ignored through `logs/`.
- A log write failure is printed as a warning and does not fail the user's query.

The log can contain user questions, generated SQL, filter values, and summaries.
Treat it as potentially sensitive operational data. Do not record credentials or
security tokens, and apply access control and retention rules in production.

## Final record format

A successful `execute` record has this shape:

```json
{
  "timestamp": "2026-07-15T09:30:12.345Z",
  "requestId": "968ec9d1-199d-4f2d-8265-55de1b999917",
  "operation": "execute",
  "status": "success",
  "question": "统计延迟收货的明细数量",
  "requestedMode": "auto",
  "requestedPlanner": "auto",
  "route": "semantic",
  "queryId": "S5",
  "strategy": "certified",
  "planner": "llm",
  "cubeQuery": {
    "measures": ["LineItem.count"],
    "segments": ["LineItem.delayedReceipt"]
  },
  "sql": "SELECT count(*) \"line_item__count\" FROM tpch_100.lineitem AS \"line_item\" WHERE (\"line_item\".l_receiptdate > \"line_item\".l_commitdate) LIMIT 10000",
  "sqlValues": [],
  "validation": {
    "valid": true,
    "errors": [],
    "sql": "SELECT count(*) \"line_item__count\" FROM tpch_100.lineitem AS \"line_item\" WHERE (\"line_item\".l_receiptdate > \"line_item\".l_commitdate) LIMIT 10000"
  },
  "timings": {
    "llmMs": 3386.2,
    "routingMs": 3386.3,
    "sqlGenerationMs": 34.2,
    "validationMs": 0.2,
    "totalMs": 3420.7,
    "planningMs": 3420.7,
    "queryMs": 2993,
    "summaryMs": 3784.5,
    "totalRequestMs": 10198.2
  },
  "result": {
    "source": "Cube semantic query",
    "rowCount": 1,
    "summary": "延迟收货的明细数量为379,356,474条。"
  }
}
```

The file itself contains compact records, one per physical line:

```jsonl
{
  "timestamp": "2026-07-15T09:30:12.345Z",
  "requestId": "968ec9d1-199d-4f2d-8265-55de1b999917",
  "operation": "execute",
  "status": "success",
  "question": "统计延迟收货的明细数量",
  "requestedMode": "auto",
  "requestedPlanner": "auto",
  "route": "semantic",
  "queryId": "S5",
  "strategy": "certified",
  "planner": "llm",
  "cubeQuery": {
    "measures": [
      "LineItem.count"
    ],
    "segments": [
      "LineItem.delayedReceipt"
    ]
  },
  "sql": "SELECT count(*) ...",
  "sqlValues": [],
  "validation": {
    "valid": true,
    "errors": []
  },
  "timings": {
    "llmMs": 3386.2,
    "routingMs": 3386.3,
    "sqlGenerationMs": 34.2,
    "validationMs": 0.2,
    "totalMs": 3420.7,
    "planningMs": 3420.7,
    "queryMs": 2993,
    "summaryMs": 3784.5,
    "totalRequestMs": 10198.2
  },
  "result": {
    "source": "Cube semantic query",
    "rowCount": 1,
    "summary": "延迟收货的明细数量为379,356,474条。"
  }
}
```

## Field definitions

| Field                     | Meaning                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `timestamp`               | UTC ISO-8601 time at which the observation was created.              |
| `requestId`               | Cube request ID when available; otherwise a generated UUID.          |
| `operation`               | `plan` or `execute`.                                                 |
| `status`                  | `success`, `rejected`, or `error`.                                   |
| `question`                | Original user question, unchanged.                                   |
| `requestedMode`           | Requested `auto`, `semantic`, or `tpch` mode.                        |
| `requestedPlanner`        | Requested `auto` or `deterministic` planner.                         |
| `route`                   | Selected `semantic` or `tpch` execution route.                       |
| `queryId`                 | Certified query ID such as `S5`, or `DYNAMIC`.                       |
| `strategy`                | `certified` or `dynamic` for an LLM plan.                            |
| `planner`                 | Planner that produced the plan: `llm` or `deterministic`.            |
| `fallback`                | Present when LLM planning failed and deterministic routing was used. |
| `cubeQuery`               | Final validated Cube Query sent to Cube.                             |
| `sql`                     | Final SQL generated by Cube or the certified SQL template.           |
| `sqlValues`               | SQL bind values returned by Cube.                                    |
| `validation`              | SQL safety-validation result.                                        |
| `timings.llmMs`           | Time spent waiting for AI query planning.                            |
| `timings.deterministicMs` | Time spent in deterministic routing.                                 |
| `timings.fallbackMs`      | Time spent routing after an LLM failure.                             |
| `timings.routingMs`       | Entire route-selection stage.                                        |
| `timings.sqlGenerationMs` | Cube `/sql` call or certified-template generation.                   |
| `timings.validationMs`    | Local SQL safety validation.                                         |
| `timings.totalMs`         | Total plan generation time.                                          |
| `timings.planningMs`      | Plan time copied to an execute observation.                          |
| `timings.explainMs`       | Databend `EXPLAIN` time for certified SQL routes.                    |
| `timings.queryMs`         | Cube/Databend query execution time.                                  |
| `timings.summaryMs`       | AI result-summary generation time.                                   |
| `timings.totalRequestMs`  | End-to-end `/execute` request time.                                  |
| `result.source`           | `Cube semantic query` or `Certified TPC-H SQL`.                      |
| `result.rowCount`         | Number of result rows returned by the demo API.                      |
| `result.summary`          | Generated result summary, when available.                            |
| `error`                   | Error message for failed requests.                                   |

Fields that do not apply to an operation are omitted instead of being emitted as
`null`. In particular, a `plan` record does not have execution, summary, or
result fields.

## Rejected and failed requests

A rejected plan is still observable:

```json
{
  "operation": "plan",
  "status": "rejected",
  "question": "删除所有订单",
  "requestedMode": "auto",
  "requestedPlanner": "auto",
  "planner": "llm",
  "timings": {
    "llmMs": 2100.4,
    "routingMs": 2100.5,
    "totalMs": 2100.6
  }
}
```

An exception uses `status: "error"` and includes `error`. If planning completed
before execution failed, the record still contains the Cube Query, final SQL,
validation result, and plan timings, which makes failed-query diagnosis possible.

## Reading and aggregating the log

Show the latest records:

```bash
tail -n 20 logs/query-observability.jsonl | jq .
```

Show the main latency stages:

```bash
jq -r '[.timestamp, .question, .timings.llmMs, .timings.sqlGenerationMs, .timings.queryMs, .timings.summaryMs, .timings.totalRequestMs] | @tsv' \
  logs/query-observability.jsonl
```

Calculate the average LLM planning latency:

```bash
jq -s 'map(select(.timings.llmMs != null)) | (map(.timings.llmMs) | add / length)' \
  logs/query-observability.jsonl
```
