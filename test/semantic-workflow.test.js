const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bindWorkflowDetail,
  validateSemanticWorkflow,
} = require("../src/semantic-workflow");

function workflow() {
  return {
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
            "LineItem.lineNumber",
            "Part.name",
            "Supplier.name",
            "CustomerNation.name",
            "SupplierNation.name",
            "LineItem.quantity",
          ],
          order: {
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
  };
}

test("validates and binds a two-stage semantic workflow", () => {
  const result = validateSemanticWorkflow(workflow());
  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].query.limit, 100);
  assert.equal(result.stages[1].query.limit, 1000);
  const bound = bindWorkflowDetail(result, [
    { "Orders.orderKey": "10" },
    { "Orders.orderKey": "20" },
    { "Orders.orderKey": "10" },
  ]);
  assert.deepEqual(bound.values, ["10", "20"]);
  assert.deepEqual(
    bound.query.filters.find((item) => item.member === "LineItem.orderKey")
      .values,
    ["10", "20"],
  );
});

test("rejects unsafe workflow structure and mismatched exports", () => {
  const tooManyStages = workflow();
  tooManyStages.stages.push({ id: "third", query: {} });
  assert.throws(
    () => validateSemanticWorkflow(tooManyStages),
    /exactly 2 stages/,
  );

  const missingOrder = workflow();
  delete missingOrder.stages[0].query.order;
  assert.throws(
    () => validateSemanticWorkflow(missingOrder),
    /requires an explicit order/,
  );

  const wrongExport = workflow();
  wrongExport.stages[0].exportMember = "Orders.customerKey";
  assert.throws(
    () => validateSemanticWorkflow(wrongExport),
    /exportMember must be selected/,
  );
});
