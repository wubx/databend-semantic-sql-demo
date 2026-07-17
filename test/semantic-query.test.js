const test = require("node:test");
const assert = require("node:assert/strict");

const { compileMemberCatalog } = require("../src/compiler");
const { loadManifest } = require("../src/manifest");
const { validateSemanticQuery } = require("../src/semantic-query");

const catalog = compileMemberCatalog(loadManifest());

test("accepts a yearly sales Cube query", () => {
  assert.deepEqual(
    validateSemanticQuery(
      {
        measures: ["Orders.totalPrice"],
        timeDimensions: [
          { dimension: "Orders.orderDate", granularity: "year" },
        ],
        order: { "Orders.orderDate": "asc" },
      },
      catalog,
    ),
    {
      measures: ["Orders.totalPrice"],
      timeDimensions: [{ dimension: "Orders.orderDate", granularity: "year" }],
      order: { "Orders.orderDate": "asc" },
      limit: 100,
      timezone: "UTC",
    },
  );
});

test("accepts a filtered monthly semantic query", () => {
  const query = validateSemanticQuery(
    {
      measures: ["Orders.count", "Orders.totalPrice"],
      timeDimensions: [
        {
          dimension: "Orders.orderDate",
          granularity: "month",
          dateRange: ["1994-01-01", "1994-12-31"],
        },
      ],
      filters: [{ member: "Orders.status", operator: "equals", values: ["F"] }],
      limit: 10000,
    },
    catalog,
  );
  assert.equal(query.limit, 500);
  assert.deepEqual(query.filters[0].values, ["F"]);
});

test("accepts a governed semantic segment", () => {
  const query = validateSemanticQuery(
    {
      measures: ["LineItem.count"],
      segments: ["LineItem.delayedReceipt"],
    },
    catalog,
  );
  assert.deepEqual(query.segments, ["LineItem.delayedReceipt"]);
});

test("accepts up to eight dimensions for richer dynamic queries", () => {
  const query = validateSemanticQuery(
    {
      measures: ["LineItem.count"],
      dimensions: [
        "LineItem.orderKey",
        "LineItem.partKey",
        "LineItem.supplierKey",
        "LineItem.lineNumber",
        "LineItem.lineStatus",
        "LineItem.returnFlag",
        "LineItem.shipMode",
        "LineItem.shipInstruction",
      ],
      limit: 10,
    },
    catalog,
  );
  assert.equal(query.dimensions.length, 8);
  assert.equal(query.limit, 10);
});

test("accepts a measure-free detail query with three date fields", () => {
  const query = validateSemanticQuery(
    {
      dimensions: [
        "LineItem.orderKey",
        "LineItem.lineNumber",
        "LineItem.partKey",
        "LineItem.supplierKey",
        "LineItem.lineStatus",
        "LineItem.returnFlag",
        "LineItem.shipMode",
        "LineItem.shipInstruction",
      ],
      timeDimensions: [
        { dimension: "LineItem.shipDate" },
        { dimension: "LineItem.commitDate" },
        { dimension: "LineItem.receiptDate" },
      ],
      order: {
        "LineItem.orderKey": "asc",
        "LineItem.lineNumber": "asc",
      },
      ungrouped: true,
      limit: 1000,
    },
    catalog,
  );
  assert.deepEqual(query.measures, []);
  assert.equal(query.dimensions.length, 8);
  assert.equal(query.timeDimensions.length, 3);
  assert.equal(query.limit, 100);
  assert.equal(query.ungrouped, true);
});

test("accepts public facts in ungrouped detail queries", () => {
  const query = validateSemanticQuery(
    {
      dimensions: ["Orders.orderKey", "Orders.orderTotal"],
      order: { "Orders.orderTotal": "desc" },
      ungrouped: true,
      limit: 10,
    },
    catalog,
  );
  assert.deepEqual(query.dimensions, ["Orders.orderKey", "Orders.orderTotal"]);
  assert.deepEqual(query.order, { "Orders.orderTotal": "desc" });
  assert.equal(query.ungrouped, true);
  assert.equal(query.limit, 10);
});

test("rejects facts in grouped queries", () => {
  assert.throws(
    () =>
      validateSemanticQuery(
        {
          dimensions: ["Orders.orderKey", "Orders.orderTotal"],
          order: { "Orders.orderTotal": "desc" },
          limit: 10,
        },
        catalog,
      ),
    /Orders.orderTotal must be one of: dimension/,
  );
});

test("accepts time members as selected dimensions in rich ungrouped details", () => {
  const query = validateSemanticQuery(
    {
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
      order: { "LineItem.orderKey": "asc", "LineItem.lineNumber": "asc" },
      ungrouped: true,
      limit: 10,
    },
    catalog,
  );
  assert.equal(query.dimensions.length, 15);
  assert.equal(query.timeDimensions, undefined);
  assert.equal(query.limit, 10);
});

test("rejects measures in ungrouped detail queries", () => {
  assert.throws(
    () =>
      validateSemanticQuery(
        {
          measures: ["LineItem.count"],
          dimensions: ["LineItem.orderKey"],
          ungrouped: true,
        },
        catalog,
      ),
    /cannot contain measures/,
  );
});

test("rejects an empty dynamic query", () => {
  assert.throws(
    () => validateSemanticQuery({}, catalog),
    /at least one measure, dimension, or time dimension/,
  );
});

test("rejects unknown metrics and invalid time dimensions", () => {
  assert.throws(
    () => validateSemanticQuery({ measures: ["Orders.profit"] }, catalog),
    /Unknown or private/,
  );
  assert.throws(
    () =>
      validateSemanticQuery(
        {
          measures: ["Orders.count"],
          timeDimensions: [{ dimension: "Orders.status", granularity: "year" }],
        },
        catalog,
      ),
    /must be one of: time_dimension/,
  );
});

test("rejects unsupported granularities and enum values", () => {
  assert.throws(
    () =>
      validateSemanticQuery(
        {
          measures: ["Orders.totalPrice"],
          timeDimensions: [
            { dimension: "Orders.orderDate", granularity: "second" },
          ],
        },
        catalog,
      ),
    /Unsupported time granularity/,
  );
  assert.throws(
    () =>
      validateSemanticQuery(
        {
          measures: ["Orders.count"],
          filters: [
            {
              member: "Orders.status",
              operator: "equals",
              values: ["FINISHED"],
            },
          ],
        },
        catalog,
      ),
    /Invalid enum value/,
  );
});
