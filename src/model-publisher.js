const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const {
  assembleManifest,
  DEFAULT_MODEL_PATH,
} = require("./semantic-assembler");
const { validateManifest } = require("./manifest");

const SEMANTIC_ROOT = path.dirname(DEFAULT_MODEL_PATH);
const ENTITY_ROOT = path.join(SEMANTIC_ROOT, "entities");
const BACKUP_ROOT = path.join(SEMANTIC_ROOT, "backups");

function parseEntityYaml(source) {
  const document = YAML.parse(String(source || ""));
  const entity = document?.entity;
  if (!entity || typeof entity !== "object")
    throw new Error("YAML 必须包含 entity 对象");
  if (!/^[A-Z][A-Za-z0-9]*$/.test(String(entity.name || "")))
    throw new Error("entity.name 必须是 PascalCase 标识符");
  if (!entity.source?.table && !entity.source?.sql)
    throw new Error("entity.source.table 或 entity.source.sql 必填");
  return entity;
}

function prepareEntityPublication(source) {
  const entity = parseEntityYaml(source);
  const current = assembleManifest();
  const existingIndex = current.entities.findIndex(
    (item) =>
      item.name === entity.name || sameSource(item.source, entity.source),
  );
  const candidate = structuredClone(current);
  if (existingIndex >= 0) candidate.entities[existingIndex] = entity;
  else candidate.entities.push(entity);
  validateManifest(candidate);
  const model = YAML.parse(fs.readFileSync(DEFAULT_MODEL_PATH, "utf8"));
  const existingPath = findEntityPath(model, current.entities[existingIndex]);
  const relativePath = existingPath || `entities/${slugify(entity.name)}.yaml`;
  return {
    entity,
    candidate,
    model,
    relativePath,
    targetPath: path.join(SEMANTIC_ROOT, relativePath),
    replacing: existingIndex >= 0,
    existingEntity: existingIndex >= 0 ? current.entities[existingIndex] : null,
  };
}

function publishPreparedEntity(prepared) {
  assertCompatibleReplacement(prepared);
  fs.mkdirSync(ENTITY_ROOT, { recursive: true });
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  let backupPath = null;
  if (fs.existsSync(prepared.targetPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(
      BACKUP_ROOT,
      `${path.basename(prepared.targetPath, ".yaml")}.${timestamp}.yaml`,
    );
    fs.copyFileSync(prepared.targetPath, backupPath);
  }
  const temporary = `${prepared.targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    YAML.stringify({ entity: prepared.entity }, { lineWidth: 120 }),
  );
  fs.renameSync(temporary, prepared.targetPath);
  if (!prepared.replacing) {
    prepared.model.includes.entities.push(prepared.relativePath);
    backupModelFile();
    writeAtomic(
      DEFAULT_MODEL_PATH,
      YAML.stringify(prepared.model, { lineWidth: 120 }),
    );
  }
  return {
    entity: prepared.entity.name,
    relativePath: prepared.relativePath,
    backupPath: backupPath ? path.relative(SEMANTIC_ROOT, backupPath) : null,
    replaced: prepared.replacing,
    publishedAt: new Date().toISOString(),
  };
}

function assertCompatibleReplacement(prepared) {
  if (
    prepared.replacing &&
    prepared.existingEntity?.name !== prepared.entity.name
  ) {
    throw new Error(
      `该表已由实体 ${prepared.existingEntity.name} 建模。发布前请将 entity.name 从 ${prepared.entity.name} 改为 ${prepared.existingEntity.name}，避免认证查询和关系失效。`,
    );
  }
}

function backupModelFile() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(
    DEFAULT_MODEL_PATH,
    path.join(BACKUP_ROOT, `model.${timestamp}.yaml`),
  );
}

function findEntityPath(model, entity) {
  if (!entity) return null;
  for (const relativePath of model.includes?.entities || []) {
    const filePath = path.join(SEMANTIC_ROOT, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const value = YAML.parse(fs.readFileSync(filePath, "utf8"));
    if (value.entity?.name === entity.name) return relativePath;
  }
  return null;
}

function sameSource(left = {}, right = {}) {
  return (
    left.table &&
    right.table &&
    left.table === right.table &&
    left.schema === right.schema &&
    (left.catalog || "") === (right.catalog || "")
  );
}

function slugify(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function writeAtomic(filePath, content) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
}

module.exports = {
  BACKUP_ROOT,
  parseEntityYaml,
  prepareEntityPublication,
  publishPreparedEntity,
};
