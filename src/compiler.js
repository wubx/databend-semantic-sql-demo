const YAML = require('yaml');

const { loadManifest } = require('./manifest');

function compileManifest(manifest = loadManifest()) {
  return {
    cubeModel: compileCubeModel(manifest),
    memberCatalog: compileMemberCatalog(manifest),
    verifiedQueries: compileVerifiedQueries(manifest),
  };
}

function compileCubeModel(manifest) {
  const factsByEntity = new Map(manifest.entities.map((entity) => [
    entity.name,
    new Map((entity.facts || []).map((fact) => [fact.name, fact])),
  ]));
  const cubes = manifest.entities.map((entity) => {
    const cube = {
      name: entity.name,
      title: entity.title,
      description: entity.description,
    };
    if (entity.source.sql) cube.sql = entity.source.sql;
    else cube.sql_table = [entity.source.catalog, entity.source.schema, entity.source.table].filter(Boolean).join('.');

    cube.dimensions = [
      ...(entity.dimensions || []).map((dimension) => compileDimension(entity, dimension, false)),
      ...(entity.time_dimensions || []).map((dimension) => compileDimension(entity, dimension, true)),
    ];
    cube.measures = (entity.metrics || []).map((metric) => {
      const fact = factsByEntity.get(entity.name).get(metric.expr);
      const measure = compact({
        name: metric.name,
        title: metric.title,
        description: metric.description,
        sql: fact?.expr || metric.expr,
        type: metric.type,
        public: metric.access !== 'private',
        meta: semanticMeta(metric, { fact: fact?.name }),
      });
      if (metric.type === 'count' && metric.name === 'count') delete measure.sql;
      return measure;
    });
    if (entity.filters?.length) {
      cube.segments = entity.filters.map((filter) => compact({
        name: filter.name,
        title: filter.title,
        description: filter.description,
        sql: filter.expr,
        meta: semanticMeta(filter),
      }));
    }

    const joins = (manifest.relationships || [])
      .filter((relationship) => relationship.from === entity.name)
      .map((relationship) => ({
        name: relationship.to,
        relationship: relationship.cardinality,
        sql: relationship.sql || compileJoinSql(relationship),
      }));
    if (joins.length) cube.joins = joins;

    const cubeExtension = manifest.extensions?.cube || {};
    if (cubeExtension.refresh_key) cube.refresh_key = cubeExtension.refresh_key;
    return compact(cube);
  });
  return { cubes };
}

function compileDimension(entity, dimension, timeDimension) {
  return compact({
    name: dimension.name,
    title: dimension.title,
    description: dimension.description,
    sql: dimension.expr,
    type: timeDimension ? 'time' : dimension.type,
    primary_key: entity.keys?.primary === dimension.name,
    public: dimension.access !== 'private',
    meta: semanticMeta(dimension, { enum: dimension.enum }),
  });
}

function compileJoinSql(relationship) {
  if (relationship.join_type && relationship.join_type !== 'equality') {
    throw new Error(`relationship ${relationship.name} requires explicit sql for ${relationship.join_type}`);
  }
  if (!Array.isArray(relationship.columns) || !relationship.columns.length) {
    throw new Error(`relationship ${relationship.name} requires columns or explicit sql`);
  }
  return relationship.columns
    .map((column) => `\${CUBE}.${column.from} = \${${relationship.to}}.${column.to}`)
    .join(' AND ');
}

function compileMemberCatalog(manifest) {
  const members = [];
  for (const entity of manifest.entities) {
    const definitions = [
      ['dimension', entity.dimensions || []],
      ['time_dimension', entity.time_dimensions || []],
      ['fact', entity.facts || []],
      ['measure', entity.metrics || []],
      ['filter', entity.filters || []],
    ];
    for (const [kind, items] of definitions) {
      for (const item of items) {
        members.push(compact({
          member: `${entity.name}.${item.name}`,
          entity: entity.name,
          kind,
          title: item.title,
          description: item.description,
          synonyms: item.synonyms || [],
          type: item.type,
          enum: item.enum,
          public: item.access !== 'private',
          owner: manifest.metadata.owner,
          tags: manifest.metadata.tags,
        }));
      }
    }
  }
  return {
    manifest: manifest.metadata.name,
    policy: manifest.ai_policy || {},
    members,
  };
}

function compileVerifiedQueries(manifest) {
  return (manifest.verified_queries || []).map((query) => ({
    id: query.id,
    title: query.title,
    route: query.route,
    description: query.description || `通过认证语义查询 ${query.id} 执行。`,
    question: query.question,
    examples: query.examples || [],
    cubeQuery: query.cube_query,
    verifiedBy: query.verified_by,
  }));
}

function semanticMeta(item, extra = {}) {
  const result = compact({
    synonyms: item.synonyms?.length ? item.synonyms : undefined,
    semantic_type: item.type,
    ...extra,
  });
  return Object.keys(result).length ? result : undefined;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

function stringifyCubeModel(model) {
  return YAML.stringify(model, { lineWidth: 120 });
}

module.exports = {
  compileCubeModel,
  compileManifest,
  compileMemberCatalog,
  compileVerifiedQueries,
  stringifyCubeModel,
};
