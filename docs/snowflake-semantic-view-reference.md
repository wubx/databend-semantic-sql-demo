# Snowflake Semantic View YAML Reference

This document preserves and explains Snowflake's semantic view YAML shape as a
reference for Databend Semantic Query Lab. It is **not** a Cube model file
and cannot be loaded by Cube directly.

Its main value is architectural: it combines physical data sources, business
semantics, relationships, certified queries, and AI instructions in one
version-controlled contract.

## Conceptual hierarchy

```text
semantic view
├── tables
│   ├── base_table / SQL definition
│   ├── dimensions
│   ├── time_dimensions
│   ├── facts
│   ├── metrics
│   ├── filters
│   └── tags
├── relationships
├── variables
├── view-level derived metrics
├── verified_queries
├── module_custom_instructions
└── tags
```

## Top-level identity

```yaml
name: tpch_sales
# Stable machine-readable semantic-view name.

description: TPC-H sales and order analysis
# Natural-language description used by people and AI systems.
```

`name` identifies the semantic domain. `description` explains what questions it
is intended to answer and should be explicit about business scope.

## `tables`: logical business entities

A semantic view contains one or more logical tables. A logical table is not
necessarily a physical table; it is a business-facing entity layered on top of
a physical table or SQL query.

```yaml
tables:
  - name: orders
    description: Customer purchase orders
    base_table:
      database: analytics
      schema: tpch_100
      table: orders
```

Instead of `database` / `schema` / `table`, a logical table can use a query:

```yaml
base_table:
  definition: |
    SELECT *
    FROM analytics.tpch_100.orders
    WHERE deleted_at IS NULL
```

Use `definition` when the semantic entity requires row filtering, projection,
union, or another reusable SQL transformation. Treat it as governed code: it
can change row cardinality and therefore metric results.

## `dimensions`: grouping and filtering attributes

Dimensions represent descriptive attributes such as order status, customer
name, region, or product category.

```yaml
dimensions:
  - name: order_status
    synonyms: [status, order state, 订单状态]
    description: Lifecycle status of an order
    expr: o_orderstatus
    data_type: varchar
    unique: false
    is_enum: true
```

Fields:

- `name`: stable semantic identifier.
- `synonyms`: alternative business or natural-language terms. These are highly
  valuable for NL-to-SQL matching.
- `description`: business meaning, not merely the physical column name.
- `expr`: SQL expression evaluated in the logical table context.
- `data_type`: resulting semantic/SQL type.
- `unique`: declares whether the value uniquely identifies a row. Incorrectly
  marking this can produce unsafe join assumptions.
- `is_enum`: indicates a finite domain such as `F`, `O`, and `P`.
- `labels`: optional behavior metadata; `filter` indicates intended WHERE usage.
- `tags`: governance metadata linked to Snowflake tag objects.

### Cortex Search service

```yaml
cortex_search_service:
  service: customer_name_search
  literal_column: customer_name
  database: analytics
  schema: search
```

This connects a dimension to Cortex Search for literal/entity resolution. For
example, a user might type an approximate customer name and the service can map
it to stored values. It is Snowflake-specific and has no direct Cube equivalent.

## `time_dimensions`: time-aware attributes

```yaml
time_dimensions:
  - name: order_date
    synonyms: [date, order time, 下单日期]
    description: Date on which the order was created
    expr: o_orderdate
    data_type: date
    unique: false
```

These are separated from regular dimensions so an analyst can understand time
ranges and granularities such as year, quarter, month, week, and day.

Cube expresses the same distinction with a dimension whose `type` is `time`.

## `facts`: row-level numeric expressions

```yaml
facts:
  - name: order_total
    synonyms: [amount, order value, 订单金额]
    description: Total price recorded on an individual order
    access_modifier: public_access
    expr: o_totalprice
    data_type: number
```

A fact is a row-level value, not necessarily an aggregated business metric. It
is typically the raw input to metrics such as `SUM(order_total)`.

This distinction is useful:

```text
fact:   one row's o_totalprice
metric: SUM(o_totalprice) across a query grouping
```

`access_modifier` controls whether the concept is available publicly inside the
semantic interface. Sensitive intermediate facts can use `private_access` while
approved metrics remain public.

## Table-scoped `metrics`: certified aggregations

```yaml
metrics:
  - name: total_order_amount
    synonyms: [sales amount, GMV, 订单总金额]
    description: Sum of order prices
    access_modifier: public_access
    expr: SUM(order_total)
```

A regular metric belongs to one logical table and defines an approved business
calculation. This is conceptually close to a Cube measure.

### Non-additive dimensions

```yaml
non_additive_dimensions:
  - table: account_balances
    dimension: snapshot_date
    sort_direction: descending
    null_order: last
```

This declares that a metric cannot safely be summed across a dimension. A
snapshot balance, inventory level, or account balance is usually non-additive
over time. The sorting rule indicates which record should represent the metric,
for example the latest snapshot.

### `using_relationships`

```yaml
using_relationships:
  - orders_to_customer
```

This makes relationship usage explicit when a metric depends on related tables,
reducing ambiguous join-path selection.

## `filters`: reusable predicates

```yaml
filters:
  - name: completed_orders
    synonyms: [finished orders, 已完成订单]
    description: Orders with final status F
    expr: o_orderstatus = 'F'
```

A named filter packages a governed predicate for reuse. Snowflake recommends
entity-level filters where possible; standalone filters are included for shared
business conditions.

Cube's closest concept is a `segment`, although Cube Query JSON can also contain
dynamic filters.

## `tags`: governance metadata

Tags can appear on views, tables, dimensions, facts, and metrics:

```yaml
tags:
  - name:
      database: governance
      schema: tags
      tag: sensitivity
    value: internal
```

They can express ownership, sensitivity, certification, domain, or other data
governance classifications. They refer to Snowflake tag objects, so a portable
format would normally simplify this to key/value metadata.

## `relationships`: governed join graph

```yaml
relationships:
  - name: orders_to_customer
    left_table: orders
    right_table: customer
    relationship_columns:
      - left_column: customer_key
        right_column: customer_key
```

Relationships tell the analyst which joins are valid. This is critical because
correct columns alone do not guarantee a correct join or correct cardinality.

The basic form is an equality join. Multiple column entries form a composite
join key.

### ASOF and range joins

```yaml
relationship_columns:
  - left_column: event_time
    right_column: effective_at
    type: asof
```

An ASOF relationship matches a row based on time ordering, often the latest
record effective at an event time.

```yaml
relationship_columns:
  - left_column: event_date
    right_column: validity_range
    type: range
    right_range:
      start_column: valid_from
      end_column: valid_to
```

A range relationship matches a left value within a right-side interval. These
are useful for slowly changing dimensions, price validity, and effective-dated
reference data.

Cube joins primarily express SQL equality conditions plus relationship
cardinality; Snowflake's explicit `asof` and `range` declarations are richer
metadata for these temporal cases.

## `variables`: controlled parameters

```yaml
variables:
  - name: reporting_currency
    data_type: varchar
    default_value: USD
    description: Currency used by converted metrics
```

Variables parameterize semantic definitions without requiring an entirely new
view. They should have strict types, allowlists or ranges, and safe defaults.
They are not arbitrary SQL substitution points.

## View-level derived `metrics`

Top-level metrics combine table-scoped metrics across logical tables:

```yaml
metrics:
  - name: revenue_per_customer
    synonyms: [ARPC, 客户平均收入]
    description: Total order amount divided by distinct customers
    access_modifier: public_access
    expr: orders.total_order_amount / customer.customer_count
```

This separates local aggregations from cross-entity business KPIs. In Cube,
derived measures and views can provide similar behavior, but the modeling syntax
is different.

## `verified_queries`: certified NL-to-SQL examples

```yaml
verified_queries:
  - name: order_amount_by_status
    question: 按订单状态统计订单金额
    verified_at: 1784073600
    verified_by: analytics-team
    use_as_onboarding_question: true
    sql: |
      SELECT o_orderstatus, SUM(o_totalprice)
      FROM analytics.tpch_100.orders
      GROUP BY o_orderstatus
```

This section is especially important for AI:

- it links a real user question to approved SQL;
- it provides retrieval/few-shot examples;
- it creates regression-test cases;
- it records verification ownership and time;
- it can provide safe onboarding questions.

It is very close to this demo's `S1`/`S2`/`S3` and `Q1`/`Q6`/`Q21` certified
query catalog. The demo additionally separates semantic Cube queries from SQL
templates so business metrics continue to be governed by Cube.

## Custom instructions

Legacy view-wide guidance:

```yaml
custom_instructions: Always use certified metrics when available.
```

Preferred module-scoped guidance:

```yaml
module_custom_instructions:
  sql_generation: |
    Only generate read-only SQL. Fully qualify all table names.
  question_categorization: |
    Reject requests outside order and customer analytics.
```

Module-scoped instructions are safer and clearer because query classification
and SQL generation are different tasks. Instructions are guidance, not a
security boundary: generated output still requires structural validation and
read-only database credentials.

## How it maps to this project

| Snowflake semantic view | Cube / this demo |
| --- | --- |
| `tables[].base_table` | Cube `sql_table` or `sql` |
| `dimensions` | Cube dimensions |
| `time_dimensions` | Cube dimensions with `type: time` |
| `facts` | Physical expressions used by measures |
| table metrics | Cube measures |
| `filters` | Cube segments / query filters |
| `relationships` | Cube joins |
| view-level metrics | Derived measures / governed cross-cube metrics |
| `verified_queries` | Certified query catalog and evaluation cases |
| `synonyms`, descriptions | LLM retrieval and member matching metadata |
| custom instructions | Guarded LLM planner prompt policy |
| tags/access modifiers | Governance metadata and exposure controls |

The key architectural difference is that Cube separates the model definition
from query execution JSON:

```text
Snowflake semantic view YAML
  = semantic model + AI context + verified SQL in one contract

Cube model YAML/JS
  = semantic model
Cube Query JSON
  = runtime query against that model
Demo certified-query catalog
  = AI routing examples and certified TPC-H SQL
```

## Recommended portable design

For this Databend demo, do not copy this schema verbatim as an executable Cube
model. Use it as the design basis for a portable semantic manifest:

```text
semantic manifest
├── entities and physical sources
├── dimensions, facts, and metrics
├── joins and cardinality
├── synonyms and descriptions
├── access/governance metadata
├── certified semantic queries
├── certified SQL templates
└── AI policies
```

A compiler can then produce:

```text
portable manifest
├── Cube YAML/JS models
├── LLM member catalog
├── certified-query router catalog
└── regression tests
```

This avoids coupling the customer-facing semantic contract directly to either
Snowflake Cortex Analyst or Cube's current modeling syntax.
