const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const DEFAULT_MODEL_PATH = path.join(__dirname, "..", "semantic", "model.yaml");

function assembleManifest(modelPath = DEFAULT_MODEL_PATH, overrides = {}) {
  const root = path.dirname(modelPath);
  const model = readYaml(modelPath, overrides["model.yaml"]);
  const includes = model.includes || {};
  const entityIncludes = Array.isArray(includes.entities)
    ? includes.entities
    : expandEntityPattern(root, includes.entities || "entities/*.yaml");
  const entities = entityIncludes.map(
    (file) => readYaml(path.join(root, file), overrides[file]).entity,
  );
  const relationships = readInclude(
    root,
    includes.relationships,
    overrides[includes.relationships],
  );
  const verifiedQueries = readInclude(
    root,
    includes.verified_queries,
    overrides[includes.verified_queries],
  );
  const policy = readInclude(root, includes.policy, overrides[includes.policy]);
  return {
    api_version: model.api_version,
    kind: model.kind,
    metadata: model.metadata,
    entities,
    relationships: relationships.relationships || [],
    verified_queries: verifiedQueries.verified_queries || [],
    ai_policy: policy.ai_policy || {},
    extensions: policy.extensions || {},
  };
}

function expandEntityPattern(root, pattern) {
  const directory = path.join(root, path.dirname(pattern));
  const suffix = path.basename(pattern).replace("*", "");
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .map((file) => path.join(path.dirname(pattern), file));
}

function readInclude(root, relativePath, override) {
  return relativePath ? readYaml(path.join(root, relativePath), override) : {};
}

function readYaml(filePath, override) {
  return override ?? YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function stringifyManifest(manifest) {
  return YAML.stringify(manifest, { lineWidth: 120 });
}

module.exports = { DEFAULT_MODEL_PATH, assembleManifest, stringifyManifest };
