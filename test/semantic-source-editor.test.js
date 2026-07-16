const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const path = require("node:path");

const { validateSemanticSource } = require("../src/semantic-source-editor");
const { DEFAULT_MODEL_PATH } = require("../src/semantic-assembler");

const relationshipsPath = require("node:path").join(
  require("node:path").dirname(DEFAULT_MODEL_PATH),
  "relationships.yaml",
);

test("validates relationships through full manifest and Cube compilation", async () => {
  process.env.CUBE_REPOSITORY_PATH ||= path.resolve(
    __dirname,
    "..",
    "..",
    "cube",
  );
  const content = fs.readFileSync(relationshipsPath, "utf8");
  const result = await validateSemanticSource("relationships.yaml", content);
  assert.equal(result.valid, true);
  assert.equal(result.compiled, true);
  assert.equal(result.relationships, 6);
  assert.ok(result.cubes.includes("Orders"));
});

test("rejects invalid and non-editable source files", async () => {
  await assert.rejects(
    validateSemanticSource(
      "relationships.yaml",
      "relationships:\n  - name: bad\n    from: Unknown\n    to: Orders\n    cardinality: many_to_one\n",
    ),
    /unknown entity/,
  );
  await assert.rejects(
    validateSemanticSource("entities/orders.yaml", "entity: {}"),
    /只允许在线维护 relationships.yaml/,
  );
});
