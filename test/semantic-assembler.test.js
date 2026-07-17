const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assembleManifest,
  stringifyManifest,
} = require("../src/semantic-assembler");
const { loadManifest } = require("../src/manifest");

test("assembles modular semantic sources into one runtime manifest", () => {
  const assembled = assembleManifest();
  const loaded = loadManifest();
  assert.equal(assembled.entities.length, 12);
  assert.deepEqual(assembled, loaded);
  assert.deepEqual(
    assembled.entities.map((entity) => entity.name),
    [
      "Orders",
      "LineItem",
      "Customer",
      "Supplier",
      "Nation",
      "CustomerNation",
      "SupplierNation",
      "Region",
      "Part",
      "Partsupp",
      "RegionalShipping",
      "OrderShipping",
    ],
  );
  assert.match(stringifyManifest(assembled), /verified_queries:/);
});
