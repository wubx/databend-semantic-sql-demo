const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSemanticView } = require("../src/semantic-view");

test("builds a user-facing semantic model view", () => {
  const view = buildSemanticView();
  assert.equal(view.stats.entities, 10);
  assert.equal(view.stats.verifiedQueries, 7);
  assert.ok(view.stats.members >= view.stats.publicMembers);
  assert.ok(view.stats.measures > 0);
  assert.ok(view.relationships.length > 0);

  const orders = view.entities.find((entity) => entity.name === "Orders");
  const totalPrice = orders.members.find(
    (member) => member.id === "Orders.totalPrice",
  );
  assert.equal(totalPrice.kind, "measure");
  assert.equal(totalPrice.expression, "orderTotal");
  assert.ok(totalPrice.synonyms.includes("订单金额合计"));
  assert.ok(totalPrice.usedBy.some((query) => query.id === "S2"));
  const regionalShipping = view.entities.find(
    (entity) => entity.name === "RegionalShipping",
  );
  assert.ok(
    regionalShipping.members.some(
      (member) => member.id === "RegionalShipping.regionalCustomerUsageRate",
    ),
  );
  const orderShipping = view.entities.find(
    (entity) => entity.name === "OrderShipping",
  );
  assert.ok(
    orderShipping.members.some(
      (member) => member.id === "OrderShipping.averageOrderAmount",
    ),
  );
});

test("semantic model view exposes relationship and privacy metadata", () => {
  const view = buildSemanticView();
  const relationship = view.relationships.find(
    (item) => item.from === "Orders" && item.to === "Customer",
  );
  assert.equal(relationship.cardinality, "many_to_one");

  const lineItem = view.entities.find((entity) => entity.name === "LineItem");
  const privateKey = lineItem.members.find(
    (member) => member.id === "LineItem.lineItemKey",
  );
  assert.equal(privateKey.public, false);
  assert.equal(privateKey.primaryKey, true);
});
