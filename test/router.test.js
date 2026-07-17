const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deterministicPlan,
  exactCertifiedPlan,
  extractQ6Parameters,
} = require("../src/router");
const { validateSql } = require("../src/sql-safety");

test("routes semantic questions deterministically", () => {
  assert.equal(deterministicPlan("订单总数是多少？").queryId, "S1");
  assert.equal(deterministicPlan("按订单状态统计订单金额。").queryId, "S2");
  assert.equal(deterministicPlan("每月订单金额趋势是什么？").queryId, "S3");
});

test("finds an exact certified query without fuzzy routing", () => {
  const plan = exactCertifiedPlan("统计延迟收货的明细数量", "auto");
  assert.equal(plan.queryId, "S5");
  assert.equal(plan.confidence, 1);
  assert.equal(exactCertifiedPlan("延迟收货情况怎么样", "auto"), null);
});

test("routes certified TPC-H queries", () => {
  assert.equal(deterministicPlan("执行 TPC-H Q1 定价汇总报表。").queryId, "Q1");
  assert.equal(
    deterministicPlan("执行 Q21，查询等待订单的供应商。").queryId,
    "Q21",
  );
});

test("extracts Q6 parameters", () => {
  assert.deepEqual(
    extractQ6Parameters("执行 Q6，折扣在 5% 到 7% 之间，数量小于 24。"),
    {
      discountMin: 0.05,
      discountMax: 0.07,
      quantity: 24,
    },
  );
});

test("rejects unsupported questions", () => {
  assert.equal(deterministicPlan("请删除数据库里的所有表").supported, false);
});

test("allows read-only schema-qualified SQL", () => {
  assert.equal(validateSql("SELECT COUNT(*) FROM tpch_100.orders").valid, true);
  assert.equal(
    validateSql(`SELECT value FROM (
      WITH source AS (
        SELECT o_orderkey AS value FROM tpch_100.orders
      )
      SELECT value FROM source
    ) AS governed_source`).valid,
    true,
  );
});

test("rejects writes, multiple statements, and other schemas", () => {
  assert.equal(validateSql("DROP TABLE tpch_100.orders").valid, false);
  assert.equal(validateSql("SELECT 1; SELECT 2").valid, false);
  assert.equal(validateSql("SELECT * FROM production.orders").valid, false);
});
