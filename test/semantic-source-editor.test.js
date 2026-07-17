const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const {
  validateSemanticSource,
  validateSemanticSourceDeletion,
} = require("../src/semantic-source-editor");
const { DEFAULT_MODEL_PATH } = require("../src/semantic-assembler");

process.env.CUBE_REPOSITORY_PATH ||= path.resolve(
  __dirname,
  "..",
  "..",
  "cube",
);

const relationshipsPath = require("node:path").join(
  require("node:path").dirname(DEFAULT_MODEL_PATH),
  "relationships.yaml",
);

test("validates relationships through full manifest and Cube compilation", async () => {
  const content = fs.readFileSync(relationshipsPath, "utf8");
  const result = await validateSemanticSource("relationships.yaml", content);
  assert.equal(result.valid, true);
  assert.equal(result.compiled, true);
  assert.equal(result.relationships, 11);
  assert.ok(result.cubes.includes("Orders"));
});

test("allows editing all source YAML and protects referenced entity deletion", async () => {
  const ordersPath = path.join(
    path.dirname(DEFAULT_MODEL_PATH),
    "entities",
    "orders.yaml",
  );
  const result = await validateSemanticSource(
    "entities/orders.yaml",
    fs.readFileSync(ordersPath, "utf8"),
  );
  assert.equal(result.valid, true);
  assert.equal(result.entities, 12);
  await assert.rejects(
    validateSemanticSourceDeletion("entities/orders.yaml"),
    /unknown entity|unknown member/,
  );
  await assert.rejects(
    validateSemanticSourceDeletion("model.yaml"),
    /不能删除/,
  );
});

test("rejects invalid and unknown source files", async () => {
  await assert.rejects(
    validateSemanticSource(
      "relationships.yaml",
      "relationships:\n  - name: bad\n    from: Unknown\n    to: Orders\n    cardinality: many_to_one\n",
    ),
    /unknown entity/,
  );
  await assert.rejects(
    validateSemanticSource("unknown.yaml", "value: true"),
    /未知或不可编辑/,
  );
});
