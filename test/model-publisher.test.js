const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YAML = require("yaml");

const { parseEntityYaml } = require("../src/model-publisher");

test("parses editable entity-only Draft YAML", () => {
  const entity = parseEntityYaml(`
entity:
  name: Product
  title: 商品
  source:
    schema: sales
    table: products
  dimensions:
    - name: id
      expr: id
      type: number
  metrics:
    - name: count
      expr: id
      type: count
`);
  assert.equal(entity.name, "Product");
  assert.equal(entity.source.table, "products");
});

test("rejects malformed or unsafe entity names before publication", () => {
  assert.throws(
    () => parseEntityYaml("entity: { name: ../evil }"),
    /PascalCase/,
  );
  assert.throws(() => parseEntityYaml("metrics: []"), /entity 对象/);
});

test("backup naming preserves prior YAML content", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-backup-"));
  const source = path.join(directory, "orders.yaml");
  const backup = path.join(directory, "orders.2026.yaml");
  fs.writeFileSync(source, YAML.stringify({ entity: { name: "Orders" } }));
  fs.copyFileSync(source, backup);
  assert.equal(
    fs.readFileSync(backup, "utf8"),
    fs.readFileSync(source, "utf8"),
  );
});
