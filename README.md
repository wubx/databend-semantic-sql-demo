# Databend Semantic SQL Demo

A customer-facing natural-language demo for Cube and Databend:

```text
Natural language
  → deterministic certified-query router
  → Cube semantic query or certified TPC-H SQL
  → SQL safety validation and EXPLAIN
  → Databend execution
  → real result table
```

## Implemented queries

- `S1` — Total order count through Cube
- `S2` — Order amount by status through Cube
- `S3` — Monthly order amount trend through Cube
- `S4` — Yearly shipped quantity through Cube
- `Q1` — TPC-H pricing summary SQL
- `Q6` — Parameterized forecasting revenue SQL
- `Q21` — Supplier waiting SQL with `EXISTS` and `NOT EXISTS`

The demo includes an optional OpenAI-compatible planner. It first prefers an
exact certified query, then may compose a dynamic Cube Query from public
manifest members. Every dynamic query is validated locally against member kind,
filter operator, enum value, time granularity, and size limits. The model cannot
generate or execute SQL. Provider failure automatically falls back to the
deterministic certified-query router. Result summaries receive only the natural
language question, query plan, and real result rows.

## Run locally

Requirements:

- Cube's built schema compiler and Databend dialect available through `CUBE_REPOSITORY_PATH` (embedded mode)
- Databend available to the local machine
- Node.js 20 or later

```bash
cp .env.example .env
# Set DATABEND_DSN to a read-only Databend account.
npm install
npm start
```

Open:

```text
http://localhost:4100
```

Run tests:

```bash
npm test
```

## Semantic model explorer

Open `http://localhost:4100` and select **语义层** to inspect the live Portable
Semantic Manifest as a business-facing catalog. It shows searchable entities,
measures, dimensions, time dimensions, segments, Databend expressions,
synonyms, enum values, privacy, relationships, and certified-query usage.

The backing endpoint is:

```text
GET /api/semantic-model
```

## Semantic model references

Snowflake's Cortex Analyst semantic-view format is preserved as an architecture
reference:

- [Field-by-field explanation](./docs/snowflake-semantic-view-reference.md)
- [Snowflake vs. Cube and combined semantic-layer design](./docs/snowflake-vs-cube-combined-semantic-layer.md)
- [Embedded Cube compiler mode](./docs/embedded-cube-compiler.md)
- [Query observability JSONL format](./docs/query-observability-log.md)
- [Regression and Cube metadata validation](./docs/validation-and-regression.md)
- [Original placeholder template](./references/snowflake-semantic-view.template.yaml)
- [TPC-H order analytics example](./references/snowflake-tpch-order-analytics.example.yaml)

These files are documentation, not directly executable Cube models. The first
portable implementation now lives at
[`semantic/semantic-manifest.yaml`](./semantic/semantic-manifest.yaml). It is
the source for generated Cube YAML, the LLM member catalog, and the verified
semantic-query catalog:

```bash
npm run build:semantic
```

Generated artifacts are written to the ignored `generated/` directory. The
runtime router loads S1/S2/S3 from the manifest rather than duplicating those
queries in JavaScript. Certified TPC-H SQL templates remain code-backed because
they require typed parameter validation.

## Runtime configuration

Runtime configuration and credentials are loaded from environment variables.
The `.env` file and all `.env.*` variants except `.env.example` are ignored by
Git. Never commit real Cube, Databend, or AI provider credentials.

The demo writes one JSONL observation per plan and execution request to
`logs/query-observability.jsonl` by default. Each record includes the original
question, validated Cube Query, final SQL, stage timings, and execution outcome.
See the [query observability log format](./docs/query-observability-log.md) for
the schema, configuration, security considerations, and analysis commands.

External AI requests can use:

```env
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
NO_PROXY=127.0.0.1,localhost,192.168.1.100
```

See [PLAN.md](./PLAN.md) for milestones and acceptance criteria. Driver work
continues in [`wubx/cube`](https://github.com/wubx/cube) on
`feat/databend-driver`.
