const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const { validateManifest } = require("./manifest");
const {
  assembleManifest,
  DEFAULT_MODEL_PATH,
} = require("./semantic-assembler");
const { EmbeddedCompilerGateway } = require("./semantic-gateway/embedded");

const ROOT = path.dirname(DEFAULT_MODEL_PATH);
const BACKUP_ROOT = path.join(ROOT, "backups");
const PROTECTED_FILES = new Set(["model.yaml"]);

async function validateSemanticSource(id, content) {
  assertEditable(id);
  const parsed = parseSource(id, content);
  const candidate = assembleManifest(DEFAULT_MODEL_PATH, { [id]: parsed });
  validateManifest(candidate);
  const compiler = new EmbeddedCompilerGateway({ manifest: candidate });
  const health = await compiler.health();
  return summary(candidate, health.cubes);
}

async function saveSemanticSource(id, content) {
  const validation = await validateSemanticSource(id, content);
  const target = sourcePath(id);
  const backupPath = backupFile(target, id);
  writeAtomic(target, YAML.stringify(YAML.parse(content), { lineWidth: 120 }));
  return {
    ...validation,
    path: `semantic/${id}`,
    backupPath: path.relative(ROOT, backupPath),
    savedAt: new Date().toISOString(),
  };
}

async function validateSemanticSourceDeletion(id) {
  assertDeletable(id);
  const model = readModel();
  const nextModel = removeInclude(model, id);
  const overrides = { "model.yaml": nextModel };
  const candidate = assembleManifest(DEFAULT_MODEL_PATH, overrides);
  validateManifest(candidate);
  const compiler = new EmbeddedCompilerGateway({ manifest: candidate });
  const health = await compiler.health();
  return {
    ...summary(candidate, health.cubes),
    deleting: id,
    model: nextModel,
  };
}

async function deleteSemanticSource(id) {
  const validation = await validateSemanticSourceDeletion(id);
  const target = sourcePath(id);
  const backupPath = backupFile(target, id);
  const modelBackupPath = backupFile(DEFAULT_MODEL_PATH, "model.yaml");
  writeAtomic(
    DEFAULT_MODEL_PATH,
    YAML.stringify(validation.model, { lineWidth: 120 }),
  );
  fs.unlinkSync(target);
  return {
    ...validation,
    deleted: `semantic/${id}`,
    backupPath: path.relative(ROOT, backupPath),
    modelBackupPath: path.relative(ROOT, modelBackupPath),
    deletedAt: new Date().toISOString(),
  };
}

function parseSource(id, content) {
  const parsed = YAML.parse(String(content || ""));
  if (!parsed || typeof parsed !== "object")
    throw new Error("YAML 顶层必须是对象");
  if (id === "model.yaml") validateModelIncludes(parsed);
  if (id.startsWith("entities/") && !parsed.entity)
    throw new Error("实体 YAML 必须包含 entity 对象");
  if (id === "relationships.yaml" && !Array.isArray(parsed.relationships))
    throw new Error("relationships.yaml 必须包含 relationships 数组");
  if (id === "verified-queries.yaml" && !Array.isArray(parsed.verified_queries))
    throw new Error("verified-queries.yaml 必须包含 verified_queries 数组");
  return parsed;
}

function validateModelIncludes(model) {
  const includes = model.includes || {};
  const values = [
    ...(Array.isArray(includes.entities) ? includes.entities : []),
    includes.relationships,
    includes.verified_queries,
    includes.policy,
  ].filter(Boolean);
  for (const value of values) {
    if (!/^(entities\/)?[A-Za-z0-9][A-Za-z0-9_.-]*\.yaml$/.test(value))
      throw new Error(`model.yaml 包含不安全的文件路径：${value}`);
    if (!fs.existsSync(path.join(ROOT, value)))
      throw new Error(`model.yaml 引用了不存在的文件：${value}`);
  }
}

function removeInclude(model, id) {
  const result = structuredClone(model);
  if (id.startsWith("entities/")) {
    result.includes.entities = result.includes.entities.filter(
      (file) => file !== id,
    );
  } else if (result.includes.relationships === id)
    delete result.includes.relationships;
  else if (result.includes.verified_queries === id)
    delete result.includes.verified_queries;
  else if (result.includes.policy === id) delete result.includes.policy;
  else throw new Error(`文件未被 model.yaml 引用：${id}`);
  return result;
}

function summary(candidate, cubes) {
  return {
    valid: true,
    compiled: true,
    entities: candidate.entities.length,
    relationships: candidate.relationships.length,
    verifiedQueries: candidate.verified_queries.length,
    cubes,
    candidate,
  };
}

function assertEditable(id) {
  const files = sourceFileIds();
  if (!files.has(id)) throw new Error("未知或不可编辑的语义源文件");
}

function assertDeletable(id) {
  assertEditable(id);
  if (PROTECTED_FILES.has(id))
    throw new Error("model.yaml 是模型入口，不能删除");
}

function sourceFileIds() {
  const model = readModel();
  return new Set(
    [
      "model.yaml",
      ...(model.includes?.entities || []),
      model.includes?.relationships,
      model.includes?.verified_queries,
      model.includes?.policy,
    ].filter(Boolean),
  );
}

function readModel() {
  return YAML.parse(fs.readFileSync(DEFAULT_MODEL_PATH, "utf8"));
}

function sourcePath(id) {
  const target = path.resolve(ROOT, id);
  if (!target.startsWith(`${ROOT}${path.sep}`) && target !== DEFAULT_MODEL_PATH)
    throw new Error("不安全的语义文件路径");
  return target;
}

function backupFile(target, id) {
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = id.replace(/\//g, "__").replace(/\.yaml$/, "");
  const backupPath = path.join(BACKUP_ROOT, `${name}.${timestamp}.yaml`);
  fs.copyFileSync(target, backupPath);
  return backupPath;
}

function writeAtomic(target, content) {
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, target);
}

module.exports = {
  PROTECTED_FILES,
  deleteSemanticSource,
  saveSemanticSource,
  validateSemanticSource,
  validateSemanticSourceDeletion,
};
