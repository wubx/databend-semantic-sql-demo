# Snowflake Semantic View and Cube Model: Comparison and Combined Design

## Executive conclusion

Snowflake Semantic View and Cube Model are not competing definitions of the
same product. Their core semantic concepts overlap, but they optimize for
different responsibilities:

- **Snowflake Semantic View** is an AI-oriented semantic knowledge contract. It
  combines business concepts, synonyms, verified questions, SQL examples,
  governance metadata, and Cortex Analyst instructions.
- **Cube Model** is an executable semantic query contract. It combines metrics,
  dimensions, joins, runtime query generation, caching, refresh policy,
  pre-aggregations, and APIs.

Combining their strengths can produce a stronger semantic layer than using
either format alone:

```text
AI-oriented semantic knowledge
              +
Executable metrics and query planning
              +
Governed certified queries
              +
Databend execution
```

The recommended result is not to merge both YAML grammars directly. It is to
create a portable source-of-truth manifest that can compile into Cube models,
AI catalogs, certified-query catalogs, and tests.

## Capability comparison

| Capability                      | Snowflake Semantic View          | Cube Model                         | Combined interpretation                     |
| ------------------------------- | -------------------------------- | ---------------------------------- | ------------------------------------------- |
| Logical entity                  | `tables`                         | `cubes`                            | Direct conceptual match                     |
| Physical source                 | `base_table`                     | `sql_table` / `sql`                | Mostly direct match                         |
| Dimensions                      | `dimensions`                     | `dimensions`                       | Direct match                                |
| Time dimensions                 | Separate collection              | Dimension with `type: time`        | Syntax difference only                      |
| Row-level facts                 | First-class `facts`              | Usually embedded in measure SQL    | Preserve facts in portable manifest         |
| Aggregated metrics              | `metrics`                        | `measures`                         | Direct for simple aggregations              |
| Reusable filters                | `filters`                        | `segments` / query filters         | Mostly direct match                         |
| Relationships                   | Join columns, ASOF, range        | Join SQL and cardinality           | Need richer common relationship model       |
| Synonyms                        | First-class                      | No complete first-class equivalent | Feed AI member catalog                      |
| Verified questions              | `verified_queries`               | No direct model section            | Generate certified-query catalog/tests      |
| AI instructions                 | First-class modules              | Outside Cube Model                 | Keep in AI policy layer                     |
| Search/entity resolution        | Cortex Search integration        | No direct equivalent               | Pluggable entity resolver                   |
| Access modifier                 | Public/private semantic concepts | Member visibility/exposure         | Normalize governance policy                 |
| Governance tags                 | Snowflake tag objects            | No complete equivalent             | Portable key/value metadata                 |
| Runtime semantic query          | Cortex Analyst produces SQL      | Cube Query JSON                    | Prefer Cube Query JSON for governed metrics |
| Query APIs                      | Snowflake/Cortex APIs            | REST, GraphQL, SQL API             | Cube as application-facing service          |
| Refresh and cache               | Outside semantic-view emphasis   | `refresh_key`, cache orchestration | Cube responsibility                         |
| Pre-aggregation                 | Outside semantic-view emphasis   | Native `pre_aggregations`          | Cube responsibility                         |
| Rolling and multi-stage metrics | Mostly SQL/metric expressions    | Structured execution features      | Compile to Cube where supported             |

## Where they are close

Approximately 60–70 percent of common semantic modeling is conceptually
compatible:

```text
logical table  ↔ cube
base table     ↔ sql_table
SQL definition ↔ sql
regular dimension ↔ dimension
 time dimension ↔ dimension(type=time)
metric         ↔ measure
filter         ↔ segment
basic equality relationship ↔ join
```

A simple Snowflake table can be converted with little ambiguity.

Snowflake:

```yaml
tables:
  - name: orders
    base_table:
      database: analytics
      schema: tpch_100
      table: orders
    dimensions:
      - name: order_status
        expr: o_orderstatus
        data_type: varchar
    facts:
      - name: order_total
        expr: o_totalprice
        data_type: number
    metrics:
      - name: total_order_amount
        expr: SUM(order_total)
```

Cube:

```yaml
cubes:
  - name: orders
    sql_table: tpch_100.orders
    dimensions:
      - name: order_status
        sql: o_orderstatus
        type: string
    measures:
      - name: total_order_amount
        sql: o_totalprice
        type: sum
```

For simple `SUM`, `COUNT`, `AVG`, `MIN`, and `MAX` metrics, conversion can be
automated.

## Where the models differ

### Facts versus measures

Snowflake separates row-level facts from aggregate metrics:

```text
physical expression → fact → metric
```

Cube normally combines the expression and aggregation:

```text
physical expression → measure
```

This is primarily an abstraction difference, not an execution limitation. A
portable model should retain facts because they improve lineage, explanation,
and metric reuse, then compile them into Cube measure SQL.

### Relationship semantics

Snowflake structures equality, ASOF, and range relationships. Cube emphasizes
join SQL and relationship cardinality such as `many_to_one` because cardinality
is critical to avoiding multiplied measures.

A combined relationship model should include both:

```yaml
relationships:
  - name: orders_to_customer
    from: orders
    to: customer
    cardinality: many_to_one
    join_type: equality
    columns:
      - from: customer_key
        to: customer_key
```

For temporal relationships it should additionally allow:

```yaml
join_type: asof
```

or:

```yaml
join_type: range
range:
  start: valid_from
  end: valid_to
```

Compilation should fail or require an explicit custom SQL implementation when a
target engine cannot represent the relationship safely.

### AI context

Snowflake has first-class fields for:

- synonyms;
- verified questions and SQL;
- onboarding questions;
- Cortex Search services;
- SQL-generation instructions;
- question-categorization instructions.

Cube Model intentionally focuses on structured semantic execution and does not
carry all of this AI context. This does not need to be forced into Cube syntax.
It should remain in the portable manifest and compile into the AI service's
member catalog and policies.

### Execution and acceleration

Cube has execution-oriented capabilities not represented by the Snowflake
semantic-view format:

- Cube Query JSON;
- cache and refresh keys;
- pre-aggregations and query rewrites;
- rolling windows;
- multi-stage calculations;
- REST, GraphQL, and PostgreSQL-compatible SQL APIs;
- query orchestration and concurrency management.

These should remain Cube-specific target extensions in a portable design.

## Why combining them can produce a better semantic layer

A useful production semantic layer has at least four planes.

### 1. Knowledge plane

Defines what business concepts mean:

```text
entities
facts
metrics
dimensions
synonyms
descriptions
business scope
```

Snowflake Semantic View contributes strongly here.

### 2. Execution plane

Turns governed concepts into correct and efficient queries:

```text
join cardinality
Cube Query JSON
SQL generation
caching
pre-aggregations
refresh policy
query APIs
```

Cube contributes strongly here.

### 3. Trust plane

Establishes what has been reviewed and how correctness is measured:

```text
verified questions
certified Cube queries
certified SQL templates
expected results
verification owner and time
regression tests
```

Snowflake's `verified_queries` is a strong starting point, while Cube's
structured query protocol makes semantic tests reproducible.

### 4. AI control plane

Controls what an AI system may understand and do:

```text
member retrieval
synonym resolution
entity resolution
question classification
allowlisted query planning
parameter extraction
refusal policy
result explanation
```

This belongs above Cube, not inside the database driver. The AI should prefer
Cube Query JSON for governed metrics and use certified SQL only for queries that
cannot yet be represented by the semantic model.

Combined architecture:

```text
                    Portable Semantic Manifest
                 (single reviewed source of truth)
                              │
          ┌───────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
   Cube model compiler   AI catalog compiler   Test compiler
          │                   │                    │
          ▼                   ▼                    ▼
 Cube cubes/measures/    synonyms, policies,   verified query
 dimensions/joins/       examples, entities    regression suite
 pre-aggregations              │                    │
          │                    └─────────┬──────────┘
          ▼                              ▼
     Cube Query JSON ◀──────────── Guarded AI Planner
          │
          ▼
   Databend SQL dialect
          │
          ▼
       Databend
```

## Recommended source-of-truth design

A first portable manifest should be deliberately smaller than the union of both
formats. It should cover stable concepts and leave target-specific features in
extensions.

```yaml
api_version: semantic.databend.dev/v1alpha1
kind: SemanticManifest

metadata:
  name: tpch_order_analytics
  description: Governed order and customer analytics
  owner: analytics-team
  tags:
    domain: sales
    sensitivity: internal

entities:
  - name: orders
    description: Customer purchase orders
    source:
      catalog: default
      schema: tpch_100
      table: orders

    keys:
      primary: order_key

    dimensions:
      - name: order_status
        expr: o_orderstatus
        type: string
        synonyms: [status, order state, 订单状态]
        enum: [F, O, P]

    time_dimensions:
      - name: order_date
        expr: o_orderdate
        type: date
        synonyms: [order time, 下单日期]

    facts:
      - name: order_total
        expr: o_totalprice
        type: decimal

    metrics:
      - name: order_count
        type: count
        expr: order_key
        synonyms: [number of orders, 订单数量]

      - name: total_order_amount
        type: sum
        expr: order_total
        synonyms: [GMV, sales amount, 订单总金额]

    filters:
      - name: fulfilled_orders
        expr: order_status = 'F'
        synonyms: [completed orders, 已完成订单]

relationships:
  - name: orders_to_customer
    from: orders
    to: customer
    cardinality: many_to_one
    join_type: equality
    columns:
      - from: customer_key
        to: customer_key

verified_queries:
  - name: amount_by_status
    question: 按订单状态统计订单数量和金额
    route: semantic
    cube_query:
      measures: [Orders.count, Orders.totalPrice]
      dimensions: [Orders.status]
    verified_by: analytics-team

ai_policy:
  question_scope: Only answer order and customer analytics questions.
  prefer_semantic_queries: true
  allow_free_sql: false
  reject_write_operations: true

extensions:
  cube:
    refresh_key:
      every: 1 hour
    pre_aggregations: []
```

## Compilation outputs

One manifest should generate multiple artifacts rather than serving every
runtime directly.

### Cube model

Generated content:

```text
entities → cubes
facts + metric aggregations → measures
dimensions → dimensions
time dimensions → time dimensions
relationships + cardinality → joins
filters → segments
Cube extensions → refresh keys and pre-aggregations
```

### AI member catalog

Generated content:

```json
{
  "member": "Orders.totalPrice",
  "kind": "measure",
  "title": "订单总金额",
  "synonyms": ["GMV", "销售额", "订单金额"],
  "description": "Sum of order total prices",
  "allowedOperators": []
}
```

The LLM sees semantic members and descriptions, not database credentials.

### Certified-query catalog

Generated content:

```text
natural-language examples
approved Cube Query JSON
approved SQL templates
allowlisted parameters
verification metadata
```

### Regression tests

Each verified query becomes a test:

```text
compile manifest
validate member references
request SQL from Cube
run EXPLAIN
optionally execute against a test dataset
compare deterministic result assertions
```

## Query-routing policy

The preferred route order should be:

```text
1. Match a verified semantic query.
2. Build a validated Cube Query JSON from modeled members.
3. Match a certified SQL template for unsupported complex SQL patterns.
4. Reject the question.
```

Free-form Text-to-SQL should not be the default. If added later, it should be a
review-required draft with AST validation and explicit confirmation.

This gives the semantic layer a stable trust hierarchy:

```text
verified Cube query > validated dynamic Cube query > certified SQL template
> reviewed free SQL draft > reject
```

## Governance and lifecycle

A good combined semantic layer also needs process, not only schema.

### Development lifecycle

```text
Draft → Validate → Review → Certify → Publish → Observe → Deprecate
```

### Validation gates

Before publishing a manifest:

- all names are unique and references resolve;
- source columns exist;
- metric expressions compile;
- join cardinalities are explicitly declared;
- no relationship introduces unsafe measure multiplication;
- synonyms do not create unresolved high-confidence ambiguity;
- verified Cube Query members exist in Cube metadata;
- certified SQL is read-only and schema restricted;
- every public metric has a description and owner;
- changed metrics trigger affected verified-query tests.

### Versioning

Metric meaning is an API contract. A breaking metric change should not silently
reuse the same identity. Use semantic versioning or explicit metric versions and
record deprecations.

## Risks and boundaries

Combining both systems is valuable, but several mistakes should be avoided.

### Do not create two sources of truth

Hand-maintaining Snowflake YAML, Cube YAML, and an AI catalog independently will
create semantic drift. The portable manifest must own shared concepts; generated
artifacts should not be edited manually.

### Do not let the LLM define production metrics directly

AI may propose dimensions, synonyms, or metrics, but publishing must require:

```text
schema validation
SQL compilation
sample query execution
human review
version-controlled change
```

### Do not treat prompt instructions as security

Security still requires:

- read-only accounts;
- member and operator allowlists;
- SQL parser/AST checks for SQL routes;
- schema restrictions;
- timeouts and row limits;
- audit logs.

### Do not assume all features are portable

Cortex Search, Snowflake tag objects, Cube pre-aggregations, and Cube rolling
windows are target-specific. Keep them in namespaced extensions rather than
weakening the common model with target assumptions.

## Delivery recommendation

Build the combined layer incrementally.

### Phase 1: portable metadata

- entities and physical sources;
- dimensions, time dimensions, facts, and basic metrics;
- equality relationships and cardinality;
- synonyms and descriptions;
- verified semantic queries;
- validation CLI.

### Phase 2: Cube compiler

- generate Cube YAML;
- validate generated members with Cube `/meta`;
- generate semantic query catalog;
- replace duplicated hard-coded S1/S2/S3 metadata.

### Phase 3: AI and trust compiler

- generate LLM member catalog;
- generate router prompts and allowlists;
- generate verified-query tests;
- add ambiguity evaluation for synonyms.

### Phase 4: advanced semantics

- non-additive metrics;
- cross-entity derived metrics;
- temporal/range joins;
- entity resolution/search providers;
- Cube pre-aggregation extensions;
- controlled model-generation proposals.

## Final assessment

Yes, combining the two approaches can produce a strong semantic layer:

```text
Snowflake-inspired semantic knowledge and AI context
                         +
Cube executable metrics, APIs, caching, and acceleration
                         +
Databend scalable query execution
```

The valuable product is not another YAML format by itself. It is a governed
semantic development system where one reviewed definition produces executable
models, AI context, certified queries, and tests without semantic drift.
