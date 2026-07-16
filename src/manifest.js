const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', 'semantic', 'semantic-manifest.yaml');

function loadManifest(filePath = process.env.SEMANTIC_MANIFEST_PATH || DEFAULT_MANIFEST_PATH) {
  const document = YAML.parse(fs.readFileSync(filePath, 'utf8'));
  validateManifest(document);
  return document;
}

function validateManifest(manifest) {
  const errors = [];
  if (manifest?.api_version !== 'semantic.databend.dev/v1alpha1') errors.push('unsupported api_version');
  if (manifest?.kind !== 'SemanticManifest') errors.push('kind must be SemanticManifest');
  if (!manifest?.metadata?.name) errors.push('metadata.name is required');
  if (!Array.isArray(manifest?.entities) || !manifest.entities.length) errors.push('at least one entity is required');

  const entityNames = uniqueNames(manifest.entities || [], 'entity', errors);
  const members = new Map();
  for (const entity of manifest.entities || []) {
    if (!entity.source?.table && !entity.source?.sql) errors.push(`entity ${entity.name} requires source.table or source.sql`);
    const entityMembers = [
      ...(entity.dimensions || []).map((member) => ({ ...member, kind: 'dimension' })),
      ...(entity.time_dimensions || []).map((member) => ({ ...member, kind: 'time_dimension' })),
      ...(entity.facts || []).map((member) => ({ ...member, kind: 'fact' })),
      ...(entity.metrics || []).map((member) => ({ ...member, kind: 'metric' })),
      ...(entity.filters || []).map((member) => ({ ...member, kind: 'filter' })),
    ];
    uniqueNames(entityMembers, `member in ${entity.name}`, errors);
    members.set(entity.name, new Map(entityMembers.map((member) => [member.name, member])));

    if (entity.keys?.primary && !members.get(entity.name).has(entity.keys.primary)) {
      errors.push(`entity ${entity.name} primary key ${entity.keys.primary} does not exist`);
    }
    for (const metric of entity.metrics || []) {
      if (!metric.type || !metric.expr) errors.push(`metric ${entity.name}.${metric.name} requires type and expr`);
    }
  }

  for (const relationship of manifest.relationships || []) {
    if (!entityNames.has(relationship.from) || !entityNames.has(relationship.to)) {
      errors.push(`relationship ${relationship.name} references an unknown entity`);
    }
    if (!['one_to_one', 'one_to_many', 'many_to_one'].includes(relationship.cardinality)) {
      errors.push(`relationship ${relationship.name} has unsupported cardinality`);
    }
  }

  const queryIds = new Set();
  for (const query of manifest.verified_queries || []) {
    if (!query.id || queryIds.has(query.id)) errors.push(`verified query id must be unique: ${query.id}`);
    queryIds.add(query.id);
    if (query.route !== 'semantic') continue;
    validateCubeQueryMembers(query.cube_query, members, errors, query.id);
  }

  if (errors.length) {
    const error = new Error(`Invalid semantic manifest:\n- ${errors.join('\n- ')}`);
    error.validationErrors = errors;
    throw error;
  }
  return manifest;
}

function validateCubeQueryMembers(query, members, errors, queryId) {
  if (!query) return errors.push(`verified query ${queryId} requires cube_query`);
  for (const name of query.measures || []) validateMember(name, 'metric', members, errors, queryId);
  for (const name of query.dimensions || []) validateMember(name, 'dimension', members, errors, queryId);
  for (const item of query.timeDimensions || []) validateMember(item.dimension, 'time_dimension', members, errors, queryId);
  for (const filter of query.filters || []) validateMember(filter.member, null, members, errors, queryId);
  for (const name of Object.keys(query.order || {})) validateMember(name, null, members, errors, queryId);
}

function validateMember(qualifiedName, expectedKind, members, errors, queryId) {
  const [entityName, memberName, ...rest] = String(qualifiedName || '').split('.');
  const member = rest.length ? null : members.get(entityName)?.get(memberName);
  if (!member) return errors.push(`verified query ${queryId} references unknown member ${qualifiedName}`);
  const compatibleKind = expectedKind === 'dimension' && member.kind === 'time_dimension';
  if (expectedKind && member.kind !== expectedKind && !compatibleKind) {
    errors.push(`verified query ${queryId} uses ${qualifiedName} as ${expectedKind}, but it is ${member.kind}`);
  }
}

function uniqueNames(items, label, errors) {
  const names = new Set();
  for (const item of items) {
    if (!item?.name) errors.push(`${label} name is required`);
    else if (names.has(item.name)) errors.push(`duplicate ${label} name: ${item.name}`);
    else names.add(item.name);
  }
  return names;
}

module.exports = { DEFAULT_MANIFEST_PATH, loadManifest, validateManifest };
