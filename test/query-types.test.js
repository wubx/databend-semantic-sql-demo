const test = require("node:test");
const assert = require("node:assert/strict");

const { compileManifest } = require("../src/compiler");
const { loadManifest } = require("../src/manifest");
const { deterministicPlan } = require("../src/router");
const { validateSemanticQuery } = require("../src/semantic-query");

const artifacts = compileManifest(loadManifest());

test("semantic type: certified measure and dimension", () => {
  const plan = deterministicPlan("按订单状态统计订单金额。");
  assert.deepEqual(plan.cubeQuery.measures, [
    "Orders.count",
    "Orders.totalPrice",
  ]);
  assert.deepEqual(plan.cubeQuery.dimensions, ["Orders.status"]);
});

test("segment type: governed delayed-receipt filter", () => {
  const plan = deterministicPlan("统计延迟收货的明细数量。");
  assert.deepEqual(plan.cubeQuery.segments, ["LineItem.delayedReceipt"]);
});

test("time type: monthly semantic trend", () => {
  const plan = deterministicPlan("每月订单金额趋势是什么？");
  assert.deepEqual(plan.cubeQuery.timeDimensions, [
    { dimension: "Orders.orderDate", granularity: "month" },
  ]);
});

test("join type: region analysis has a governed join chain", () => {
  const plan = deterministicPlan("按区域统计订单金额。");
  assert.deepEqual(plan.cubeQuery.dimensions, ["Region.name"]);
  const model = new Map(
    artifacts.cubeModel.cubes.map((cube) => [cube.name, cube]),
  );
  assert.deepEqual(
    model.get("Orders").joins.map((join) => join.name),
    ["Customer"],
  );
  assert.deepEqual(
    model.get("Customer").joins.map((join) => join.name),
    ["CustomerNation"],
  );
  assert.deepEqual(
    model.get("CustomerNation").joins.map((join) => join.name),
    ["Region"],
  );
});

test("dynamic type: validated member composition", () => {
  const query = validateSemanticQuery(
    {
      measures: ["LineItem.totalQuantity"],
      dimensions: ["LineItem.shipMode"],
      timeDimensions: [
        {
          dimension: "LineItem.shipDate",
          dateRange: ["1995-01-01", "1995-12-31"],
        },
      ],
    },
    artifacts.memberCatalog,
  );
  assert.equal(query.timeDimensions[0].dimension, "LineItem.shipDate");
});
