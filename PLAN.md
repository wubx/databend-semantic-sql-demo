# Databend Semantic Query Lab Plan

## Goal

Build a stable customer demo that turns natural-language questions into either
Cube semantic queries or certified TPC-H SQL, displays the resulting Databend
SQL, validates it, executes it against Databend, and presents the results.

## Architecture

```text
Natural language
       |
       v
Lightweight query router
       |
       +-- Semantic mode --> Embedded Cube compiler --> Databend SQL --+
       |                                                              |
       +-- TPC-H mode ----> Certified SQL template --------------------+
                                                                      |
                                                                      v
                                                               SQL validation
                                                                      |
                                                                   Databend
                                                                      |
                                                       results / duration / query ID
```

`SEMANTIC_GATEWAY=cube-server` keeps the previous Cube Server HTTP path when
Cube runtime caching, pre-aggregations, or access policies are required.

## Scope

### Included

- Cube semantic queries for common business metrics
- Certified Databend TPC-H SQL templates
- Query routing and parameter extraction
- Read-only SQL validation
- Databend `EXPLAIN` and execution
- A single customer-facing SQL Copilot page
- Generated SQL, results, duration, and query ID
- Rule-based offline fallback
- Optional structured LLM routing after the deterministic flow works

### Excluded from the first demo

- General ontology platform
- Autonomous semantic-model publishing
- Unrestricted Text-to-SQL execution
- Multi-agent workflows
- Long-term memory
- MCP and OAuth
- BYOM administration
- Cube Cloud AI replacement
- Multi-database support
- Production-grade BI dashboarding

## Repository Boundaries

- `wubx/cube`, branch `feat/databend-driver`: Databend Driver only
- `wubx/databend-semantic-query-lab`: models, TPC-H knowledge, API, web UI,
  evaluation, and deployment scripts

The demo may initially depend on the unpublished driver branch. It should move
to a released driver dependency once one is available.

## Milestone 0 — Driver Gate

This milestone is completed in `wubx/cube`, not this repository.

- [ ] Current Databend Node.js SDK can be installed by Yarn 1
- [ ] Connections are deterministically released
- [ ] Cube refresh keys execute without queue timeout
- [ ] 100 sequential Cube queries pass
- [ ] 10 concurrent Cube queries pass
- [ ] Errors do not block later queries
- [ ] Cube shuts down without leaked processes or connections
- [ ] Real Databend integration test passes

No customer demo is considered stable until this gate passes.

## Milestone 1 — Query Baseline

### Cube semantic model

- [x] Model `orders`
- [x] Model `customer` and `supplier`
- [x] Model `lineitem`
- [x] Model `nation` and `region`
- [x] Add tested joins between the models
- [x] Define titles, descriptions, and synonyms for exposed members

### Certified semantic queries

- [x] S1 — Total order count
- [x] S2 — Order amount by order status
- [x] S3 — Monthly order amount trend
- [x] S4 — Yearly shipped quantity
- [x] S5 — Delayed receipt line-item count
- [x] S6 — Shipping-mode efficiency analysis
- [x] S7 — Order amount by region

### Certified TPC-H queries

- [x] Q1 — Pricing summary report
- [x] Q6 — Forecasting revenue change
- [x] Q21 — Suppliers who kept orders waiting

### Verification

- [ ] Store expected query results or deterministic result checks
- [ ] Record baseline execution duration
- [ ] Add `scripts/verify-demo.sh`
- [ ] All six queries pass without an LLM

## Milestone 2 — Rule-Based Demo

### API

- [x] `GET /api/health`
- [x] `GET /api/query/examples`
- [x] `POST /api/query/plan`
- [x] `POST /api/query/validate`
- [x] `POST /api/query/execute`
- [x] `POST /api/query/execute-sql` with Semantic parameter binding through Cube

### Query router

- [x] Route common metric questions to certified semantic queries
- [x] Route Q1, Q6, and Q21 questions to certified SQL templates
- [x] Extract supported template parameters deterministically
- [x] Reject unsupported questions with a clear message

### SQL safety

- [x] Allow only a single `SELECT`, `WITH ... SELECT`, or `EXPLAIN` statement
- [x] Restrict access to `tpch_100`
- [x] Reject DDL, DML, `COPY`, `SET`, `USE`, `KILL`, and multi-statement SQL
- [ ] Use a read-only Databend account
- [ ] Enforce query timeout
- [x] Limit result rows
- [x] Run `EXPLAIN` before execution

### Web UI

- [x] Natural-language input
- [x] Example question selector
- [x] Auto, Semantic, and TPC-H modes
- [x] Query interpretation panel
- [x] Cube Query panel when applicable
- [x] Generated Databend SQL panel
- [x] Validate, Explain, and Run actions
- [x] Result table
- [x] Duration and source/request metadata

### Acceptance

- [ ] All six certified questions work offline without an external LLM
- [ ] One-command startup
- [ ] Health checks verify every service
- [ ] Generated SQL is visible before execution

## Milestone 3 — Lightweight LLM Integration

The LLM performs only routing, parameter extraction, and result explanation.
It does not execute SQL or change semantic models.

- [x] Add an OpenAI-compatible provider interface
- [x] Load provider URL, API key, model, and timeout only from environment variables
- [ ] Keep `.env` and provider credentials out of Git; commit placeholders only in `.env.example`
- [x] Enforce structured JSON output and validate it locally
- [x] Select Semantic or TPC-H route
- [x] Select a certified query ID
- [x] Extract supported parameters
- [x] Generate a summary only from real query results
- [x] Add request timeout
- [x] Fall back to deterministic routing when unavailable
- [x] Never send Databend credentials to the model
- [ ] Add a secret scan to CI before enabling external contributions

### Evaluation

Prepare at least three paraphrases for each certified question.

- [ ] Routing accuracy ≥ 95%
- [ ] Template selection accuracy ≥ 95%
- [ ] Parameter extraction accuracy ≥ 95%
- [ ] Executed-query success rate = 100%
- [ ] Unsupported requests are rejected rather than guessed

## Milestone 4 — Expand the Demo

After the initial customer demo is stable:

- [x] Add Semantic S4 — Yearly shipped quantity
- [x] Add Semantic S5 — Delayed receipt count
- [x] Add Semantic S6 — Shipping-mode efficiency
- [x] Add Semantic S7 — Order amount by region
- [ ] Add TPC-H Q5 — Local supplier volume
- [ ] Add TPC-H Q17 — Small-quantity-order revenue
- [ ] Add simple result charts
- [ ] Add downloadable query evidence

## Optional Milestone 5 — Portable Semantic Manifest

Combine Snowflake-inspired AI semantics with Cube's executable semantic layer.
See [the combined design](./docs/snowflake-vs-cube-combined-semantic-layer.md).

- [x] Define a minimal versioned portable-manifest schema
- [x] Model entities, dimensions, facts, metrics, joins, and cardinality
- [x] Add synonyms, verified queries, AI policies, and governance metadata
- [x] Compile portable entities and metrics into Cube YAML
- [x] Compile synonyms and descriptions into an LLM member catalog
- [x] Compile verified semantic queries into the router catalog
- [x] Validate dynamic Cube Query members, types, operators, enums, granularities, and limits
- [x] Allow guarded LLM composition of dynamic Cube Query JSON
- [x] Validate generated members against Cube `/meta`
- [x] Generate routing regression tests from every verified query and example
- [x] Write JSONL observations with question, Cube Query, SQL, outcome, and stage timings
- [x] Generate status, route, LLM usage, gateway, and latency reports from observations
- [x] Keep Cube and provider-specific features in namespaced extensions

## Optional Milestone 6 — Controlled Free Text-to-SQL

This milestone is not required for the first customer demo.

- [ ] Retrieve relevant schema and relationship context
- [ ] Retrieve similar certified TPC-H examples
- [ ] Generate SQL as a review-required draft
- [ ] Parse SQL into an AST before execution
- [ ] Validate identifiers and schemas
- [ ] Run Databend `EXPLAIN`
- [ ] Require explicit user confirmation
- [ ] Label generated SQL separately from certified SQL

## Demo Questions

| ID  | Question                                     | Route          | Initial status |
| --- | -------------------------------------------- | -------------- | -------------- |
| S1  | 订单总数是多少？                             | Semantic       | Passed         |
| S2  | 按订单状态统计订单金额。                     | Semantic       | Passed         |
| S3  | 每月订单金额趋势是什么？                     | Semantic       | Implemented    |
| S4  | 按年统计发货商品数量。                       | Semantic       | Passed         |
| S5  | 统计延迟收货的明细数量。                     | Semantic       | Passed         |
| S6  | 分析运输方式及效率。                         | Semantic       | Passed         |
| S7  | 按区域统计订单金额。                         | Semantic       | Implemented    |
| Q1  | 执行 TPC-H Q1 定价汇总报表。                 | TPC-H template | Implemented    |
| Q6  | 执行 Q6，折扣在 5% 到 7% 之间，数量小于 24。 | TPC-H template | Passed         |
| Q21 | 查询沙特阿拉伯导致已完成订单等待的供应商。   | TPC-H template | Implemented    |

## Customer Demo Script

1. Ask “按订单状态统计订单金额。”
2. Show the selected Cube measure and dimension.
3. Show the Databend SQL generated by Cube.
4. Validate and execute the query.
5. Ask for TPC-H Q6 with modified parameters.
6. Show certified-template selection and extracted parameters.
7. Validate and execute the SQL.
8. Ask the Q21 supplier question to demonstrate `EXISTS` and `NOT EXISTS`.
9. Show duration, query ID, and real result rows.

## Definition of Done for the First Demo

- [ ] Driver stability gate passes
- [ ] Three semantic and three TPC-H questions pass
- [ ] The complete demo works without an external LLM
- [ ] LLM integration has a deterministic fallback
- [ ] SQL is visible and validated before execution
- [ ] Only read-only access to `tpch_100` is possible
- [ ] Query timeout and row limit are enforced
- [ ] Query failures never produce fabricated answers
- [ ] Setup and demo steps are documented
