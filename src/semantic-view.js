const { loadManifest } = require("./manifest");

const MEMBER_GROUPS = [
  ["dimensions", "dimension"],
  ["time_dimensions", "time_dimension"],
  ["facts", "fact"],
  ["metrics", "measure"],
  ["filters", "segment"],
];

function buildSemanticView(manifest = loadManifest()) {
  const verifiedQueries = (manifest.verified_queries || [])
    .filter((query) => query.route === "semantic")
    .map((query) => ({
      id: query.id,
      title: query.title,
      question: query.question,
      cubeQuery: query.cube_query,
      verifiedBy: query.verified_by,
    }));
  const usage = buildUsage(verifiedQueries);
  const entities = manifest.entities.map((entity) => {
    const members = MEMBER_GROUPS.flatMap(([property, kind]) =>
      (entity[property] || []).map((member) => ({
        id: `${entity.name}.${member.name}`,
        name: member.name,
        title: member.title || member.name,
        description: member.description || "",
        kind,
        type: member.type,
        expression: member.expr,
        synonyms: member.synonyms || [],
        enum: member.enum || [],
        public: member.access !== "private",
        format: member.format,
        filters: member.filters || [],
        primaryKey: entity.keys?.primary === member.name,
        usedBy: usage.get(`${entity.name}.${member.name}`) || [],
      })),
    );
    return {
      name: entity.name,
      title: entity.title || entity.name,
      description: entity.description || "",
      source: entity.source,
      primaryKey: entity.keys?.primary,
      members,
      counts: countKinds(members),
    };
  });
  const relationships = (manifest.relationships || []).map((relationship) => ({
    name: relationship.name,
    from: relationship.from,
    to: relationship.to,
    cardinality: relationship.cardinality,
    columns: relationship.columns || [],
    sql: relationship.sql,
  }));
  const members = entities.flatMap((entity) => entity.members);
  return {
    metadata: manifest.metadata,
    apiVersion: manifest.api_version,
    policy: manifest.ai_policy || {},
    stats: {
      entities: entities.length,
      members: members.length,
      publicMembers: members.filter((member) => member.public).length,
      measures: members.filter((member) => member.kind === "measure").length,
      relationships: relationships.length,
      verifiedQueries: verifiedQueries.length,
    },
    entities,
    relationships,
    verifiedQueries,
  };
}

function buildUsage(queries) {
  const usage = new Map();
  for (const query of queries) {
    const cubeQuery = query.cubeQuery || {};
    const members = [
      ...(cubeQuery.measures || []),
      ...(cubeQuery.dimensions || []),
      ...(cubeQuery.timeDimensions || []).map((item) => item.dimension),
      ...(cubeQuery.filters || []).map((item) => item.member),
      ...(cubeQuery.segments || []),
      ...Object.keys(cubeQuery.order || {}),
    ];
    for (const member of new Set(members)) {
      if (!usage.has(member)) usage.set(member, []);
      usage.get(member).push({ id: query.id, title: query.title });
    }
  }
  return usage;
}

function countKinds(members) {
  return Object.fromEntries(
    MEMBER_GROUPS.map(([, kind]) => [
      kind,
      members.filter((member) => member.kind === kind).length,
    ]),
  );
}

module.exports = { buildSemanticView };
