const { getQuery: getSqlTemplateQuery, tpchQueries } = require('./sql-templates');
const { compileVerifiedQueries } = require('./compiler');
const { loadManifest } = require('./manifest');

const semanticQueries = Object.fromEntries(
  compileVerifiedQueries(loadManifest()).map((query) => [query.id, query]),
);

function listQueries() {
  return [...Object.values(semanticQueries), ...Object.values(tpchQueries)].map((query) => ({
    id: query.id,
    title: query.title,
    route: query.route,
    description: query.description,
    question: query.question,
    examples: query.examples,
    parameters: query.parameters || {},
  }));
}

function getQuery(id) {
  return semanticQueries[id] || getSqlTemplateQuery(id);
}

module.exports = { getQuery, listQueries, semanticQueries, tpchQueries };
