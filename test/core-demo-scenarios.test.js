const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
require("dotenv").config();
process.env.CUBE_REPOSITORY_PATH ||= path.resolve(
  __dirname,
  "..",
  "..",
  "cube",
);

const { getCertifiedSqlQuery } = require("../src/certified-sql");
const { validateLlmPlan } = require("../src/llm");
const { exactCertifiedPlan, deterministicPlan } = require("../src/router");
const { EmbeddedCompilerGateway } = require("../src/semantic-gateway/embedded");
const { validateSemanticWorkflow } = require("../src/semantic-workflow");
const { validateSql } = require("../src/sql-safety");
const { fuseWorkflowToCte } = require("../src/workflow-cte");

const gateway = new EmbeddedCompilerGateway();

test("core demo S1 and S2 compile to governed Databend SQL", async () => {
  const s1 = exactCertifiedPlan("订单总数是多少？", "auto");
  const s2 = exactCertifiedPlan("按订单状态统计订单金额。", "auto");
  assert.equal(s1.queryId, "S1");
  assert.equal(s2.queryId, "S2");

  const [s1Sql, s2Sql] = await Promise.all([
    gateway.compile(s1.cubeQuery),
    gateway.compile(s2.cubeQuery),
  ]);
  assert.match(s1Sql.sql, /count\(/i);
  assert.match(s1Sql.sql, /FROM\s+tpch_100\.orders/i);
  assert.match(s2Sql.sql, /o_orderstatus/);
  assert.match(s2Sql.sql, /sum\("orders"\.o_totalprice\)/i);
  assert.match(s2Sql.sql, /GROUP BY 1/);
  assert.match(s2Sql.sql, /ORDER BY\s+3\s+DESC/);
  assert.equal(validateSql(s1Sql.sql).valid, true);
  assert.equal(validateSql(s2Sql.sql).valid, true);
});

test("core demo certified examples remain exact while nearby questions stay dynamic", () => {
  assert.equal(exactCertifiedPlan("一共有多少订单", "auto").queryId, "S1");
  assert.equal(
    exactCertifiedPlan("各状态订单金额是多少", "auto").queryId,
    "S2",
  );
  assert.equal(
    exactCertifiedPlan("订单最多的区域以及该区域的订单金额是多少？", "auto"),
    null,
  );
  assert.equal(
    exactCertifiedPlan("订单金额最高的前100个订单及其商品明细", "auto"),
    null,
  );
});

test("core demo TPC-H Q1 routes deterministically and preserves certified semantics", () => {
  const routed = deterministicPlan("执行 TPC-H Q1 定价汇总报表。", "auto");
  assert.equal(routed.queryId, "Q1");
  assert.equal(routed.route, "tpch");
  const query = getCertifiedSqlQuery("Q1");
  const sql = query.buildSql({ days: 90 });
  for (const expression of [
    "SUM(l_quantity) AS sum_qty",
    "SUM(l_extendedprice) AS sum_base_price",
    "SUM(l_extendedprice * (1 - l_discount)) AS sum_disc_price",
    "SUM(l_extendedprice * (1 - l_discount) * (1 + l_tax)) AS sum_charge",
    "AVG(l_quantity) AS avg_qty",
    "AVG(l_extendedprice) AS avg_price",
    "AVG(l_discount) AS avg_disc",
    "COUNT(*) AS count_order",
  ]) {
    assert.ok(sql.includes(expression), `missing Q1 expression: ${expression}`);
  }
  assert.match(sql, /DATE_SUB\(DAY, 90, DATE '1998-12-01'\)/);
  assert.match(sql, /GROUP BY l_returnflag, l_linestatus/);
  assert.match(sql, /ORDER BY l_returnflag, l_linestatus/);
  assert.equal(validateSql(sql).valid, true);
});

test("core demo dynamic Top 1 region uses the ranking metric and limit 1", async () => {
  const plan = validateLlmPlan(
    {
      supported: true,
      strategy: "dynamic",
      queryId: null,
      confidence: 0.98,
      cubeQuery: {
        measures: ["Orders.count", "Orders.totalPrice"],
        dimensions: ["Region.name"],
        order: { "Orders.count": "desc" },
        limit: 1,
      },
      reason: "按订单数量降序取第一名，并返回该区域订单金额。",
    },
    "订单最多的区域以及该区域的订单金额是多少？",
    "auto",
  );
  assert.equal(plan.strategy, "dynamic");
  assert.deepEqual(plan.cubeQuery.order, { "Orders.count": "desc" });
  assert.equal(plan.cubeQuery.limit, 1);

  const compiled = await gateway.compile(plan.cubeQuery);
  assert.match(compiled.sql, /tpch_100\.orders/);
  assert.match(compiled.sql, /tpch_100\.customer/);
  assert.match(compiled.sql, /tpch_100\.nation/);
  assert.match(compiled.sql, /tpch_100\.region/);
  assert.match(compiled.sql, /ORDER BY\s+2\s+DESC/);
  assert.match(compiled.sql, /LIMIT 1$/);
  assert.equal(validateSql(compiled.sql).valid, true);
});

test("core demo rich ten-row detail request remains a single ungrouped query", async () => {
  const plan = validateLlmPlan(
    {
      supported: true,
      strategy: "dynamic",
      queryId: null,
      confidence: 0.99,
      cubeQuery: {
        measures: [],
        dimensions: [
          "LineItem.orderKey",
          "LineItem.lineNumber",
          "LineItem.partKey",
          "LineItem.supplierKey",
          "LineItem.lineStatus",
          "LineItem.returnFlag",
          "LineItem.shipMode",
          "LineItem.shipInstruction",
          "LineItem.shipDate",
          "LineItem.commitDate",
          "LineItem.receiptDate",
          "LineItem.quantity",
          "LineItem.extendedPrice",
          "LineItem.discountRate",
          "LineItem.taxRate",
        ],
        order: {
          "LineItem.orderKey": "asc",
          "LineItem.lineNumber": "asc",
        },
        limit: 10,
        ungrouped: true,
      },
      reason: "查看订单明细表10行。",
    },
    "订单明细表10行",
    "auto",
  );
  assert.equal(plan.strategy, "dynamic");
  assert.equal(plan.cubeQuery.dimensions.length, 15);
  assert.equal(plan.cubeQuery.limit, 10);
  assert.equal(plan.cubeQuery.ungrouped, true);
  const compiled = await gateway.compile(plan.cubeQuery);
  for (const date of ["l_shipdate", "l_commitdate", "l_receiptdate"])
    assert.match(compiled.sql, new RegExp(`\\.${date}\\b`));
  assert.match(compiled.sql, /LIMIT 10$/);
  assert.equal(validateSql(compiled.sql).valid, true);
});

test("core demo dynamic Top N preserves an explicit requested limit", () => {
  const plan = validateLlmPlan(
    {
      supported: true,
      strategy: "dynamic",
      queryId: null,
      confidence: 0.98,
      cubeQuery: {
        measures: ["Orders.count", "Orders.totalPrice"],
        dimensions: ["Region.name"],
        order: { "Orders.count": "desc" },
        limit: 5,
      },
    },
    "订单最多的前5个区域以及订单金额是多少？",
    "auto",
  );
  assert.equal(plan.cubeQuery.limit, 5);
  assert.deepEqual(plan.cubeQuery.order, { "Orders.count": "desc" });
});

test("core demo Top 100 order-detail workflow compiles and fuses to one safe CTE", async () => {
  const workflow = validateSemanticWorkflow({
    stages: [
      {
        id: "top_orders",
        query: {
          dimensions: ["Orders.orderKey", "Orders.orderTotal"],
          order: { "Orders.orderTotal": "desc" },
          limit: 100,
          ungrouped: true,
        },
        exportMember: "Orders.orderKey",
      },
      {
        id: "order_details",
        dependsOn: "top_orders",
        query: {
          dimensions: [
            "LineItem.orderKey",
            "Orders.orderTotal",
            "Orders.status",
            "Customer.name",
            "CustomerNation.name",
            "LineItem.lineNumber",
            "Part.name",
            "Part.brand",
            "Supplier.name",
            "SupplierNation.name",
            "LineItem.quantity",
            "LineItem.extendedPrice",
            "LineItem.discountRate",
            "LineItem.taxRate",
            "LineItem.shipMode",
          ],
          order: {
            "Orders.orderTotal": "desc",
            "LineItem.orderKey": "asc",
            "LineItem.lineNumber": "asc",
          },
          limit: 1000,
          ungrouped: true,
        },
        binding: {
          fromStage: "top_orders",
          sourceMember: "Orders.orderKey",
          targetMember: "LineItem.orderKey",
        },
      },
    ],
    outputStage: "order_details",
  });

  const compiledStages = [];
  for (const stage of workflow.stages) {
    const compiled = await gateway.compile(stage.query);
    compiledStages.push({
      ...stage,
      sql: compiled.sql,
      sqlValues: compiled.values,
    });
  }
  const fused = fuseWorkflowToCte({ ...workflow, stages: compiledStages });
  assert.equal(fused.mode, "fused-cte");
  assert.match(fused.sql, /^WITH workflow_top_orders AS/);
  assert.match(
    fused.sql,
    /ORDER BY "orders_workflow_parent"\.o_totalprice DESC/,
  );
  assert.match(fused.sql, /LIMIT 100/);
  assert.match(fused.sql, /INNER JOIN workflow_top_orders AS "orders"/);
  assert.match(fused.sql, /p_name "part__name"/);
  assert.match(fused.sql, /s_name "supplier__name"/);
  assert.match(fused.sql, /"supplier_nation"\.n_name/);
  assert.match(fused.sql, /"customer_nation"\.n_name/);
  assert.match(fused.sql, /ORDER BY\s+2\s+DESC,\s+1\s+ASC,\s+6\s+ASC/);
  assert.match(fused.sql, /LIMIT 1000$/);
  assert.doesNotMatch(fused.sql, /__workflow_key__/);
  assert.doesNotMatch(fused.sql, /l_orderkey\s*=\s*\?/);
  assert.equal(validateSql(fused.sql).valid, true);
});

test("core demo workflow refuses unsafe fusion and retains staged execution", async () => {
  const workflow = validateSemanticWorkflow({
    stages: [
      {
        id: "top_orders",
        query: {
          dimensions: ["Orders.orderKey", "Orders.orderTotal"],
          order: { "Orders.orderTotal": "desc" },
          limit: 10,
          ungrouped: true,
        },
        exportMember: "Orders.orderKey",
      },
      {
        id: "filtered_details",
        dependsOn: "top_orders",
        query: {
          dimensions: ["LineItem.orderKey", "LineItem.lineNumber"],
          filters: [
            {
              member: "LineItem.shipMode",
              operator: "equals",
              values: ["AIR"],
            },
          ],
          limit: 1000,
          ungrouped: true,
        },
        binding: {
          fromStage: "top_orders",
          sourceMember: "Orders.orderKey",
          targetMember: "LineItem.orderKey",
        },
      },
    ],
    outputStage: "filtered_details",
  });
  const compiledStages = [];
  for (const stage of workflow.stages) {
    const compiled = await gateway.compile(stage.query);
    compiledStages.push({ ...stage, sql: compiled.sql });
  }
  assert.equal(
    fuseWorkflowToCte({ ...workflow, stages: compiledStages }),
    null,
  );
});
