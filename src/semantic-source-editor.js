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
const EDITABLE_FILES = new Set(["relationships.yaml"]);

async function validateSemanticSource(id, content) {
  assertEditable(id);
  const parsed = YAML.parse(String(content || ""));
  if (!Array.isArray(parsed?.relationships))
    throw new Error("relationships.yaml 必须包含 relationships 数组");
  const candidate = assembleManifest();
  candidate.relationships = parsed.relationships;
  validateManifest(candidate);
  const compiler = new EmbeddedCompilerGateway({ manifest: candidate });
  const health = await compiler.health();
  return {
    valid: true,
    compiled: true,
    relationships: candidate.relationships.length,
    cubes: health.cubes,
    candidate,
  };
}

async function saveSemanticSource(id, content) {
  const validation = await validateSemanticSource(id, content);
  const target = path.join(ROOT, id);
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    BACKUP_ROOT,
    `${path.basename(id, ".yaml")}.${timestamp}.yaml`,
  );
  fs.copyFileSync(target, backupPath);
  const normalized = YAML.stringify(YAML.parse(content), { lineWidth: 120 });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, normalized);
  fs.renameSync(temporary, target);
  return {
    ...validation,
    path: `semantic/${id}`,
    backupPath: path.relative(ROOT, backupPath),
    savedAt: new Date().toISOString(),
  };
}

function assertEditable(id) {
  if (!EDITABLE_FILES.has(id))
    throw new Error("当前只允许在线维护 relationships.yaml");
}

module.exports = { EDITABLE_FILES, saveSemanticSource, validateSemanticSource };
