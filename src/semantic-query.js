const ALLOWED_GRANULARITIES = new Set(['year', 'quarter', 'month', 'week', 'day']);
const ALLOWED_OPERATORS = new Set([
  'equals', 'notEquals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte', 'inDateRange', 'notInDateRange', 'set', 'notSet',
]);
const MAX_MEASURES = 3;
const MAX_DIMENSIONS = 3;
const MAX_FILTERS = 5;
const MAX_LIMIT = 500;

function validateSemanticQuery(input, memberCatalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cube query must be an object');
  const members = new Map(memberCatalog.members.map((member) => [member.member, member]));
  const measures = uniqueStrings(input.measures || [], 'measures', MAX_MEASURES);
  const dimensions = uniqueStrings(input.dimensions || [], 'dimensions', MAX_DIMENSIONS);
  if (!measures.length) throw new Error('Dynamic Cube query requires at least one measure');

  for (const name of measures) requireMember(members, name, ['measure']);
  for (const name of dimensions) requireMember(members, name, ['dimension']);

  const timeDimensions = (input.timeDimensions || []).map((item) => {
    if (!item || typeof item !== 'object') throw new Error('timeDimensions entries must be objects');
    requireMember(members, item.dimension, ['time_dimension']);
    const result = { dimension: item.dimension };
    if (item.granularity != null) {
      if (!ALLOWED_GRANULARITIES.has(item.granularity)) throw new Error(`Unsupported time granularity: ${item.granularity}`);
      result.granularity = item.granularity;
    }
    if (item.dateRange != null) result.dateRange = validateDateRange(item.dateRange);
    return result;
  });
  if (timeDimensions.length > 2) throw new Error('At most 2 time dimensions are allowed');

  const filters = (input.filters || []).map((filter) => validateFilter(filter, members));
  if (filters.length > MAX_FILTERS) throw new Error(`At most ${MAX_FILTERS} filters are allowed`);

  const order = {};
  for (const [name, direction] of Object.entries(input.order || {})) {
    requireMember(members, name, ['measure', 'dimension', 'time_dimension']);
    if (!['asc', 'desc'].includes(direction)) throw new Error(`Invalid order direction for ${name}`);
    order[name] = direction;
  }
  if (Object.keys(order).length > 3) throw new Error('At most 3 order entries are allowed');

  const requestedLimit = input.limit == null ? 100 : Number(input.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error('limit must be a positive integer');

  return compact({
    measures,
    dimensions: dimensions.length ? dimensions : undefined,
    timeDimensions: timeDimensions.length ? timeDimensions : undefined,
    filters: filters.length ? filters : undefined,
    order: Object.keys(order).length ? order : undefined,
    limit: Math.min(requestedLimit, MAX_LIMIT),
    timezone: 'UTC',
  });
}

function validateFilter(filter, members) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) throw new Error('filters entries must be objects');
  const member = requireMember(members, filter.member, ['dimension', 'time_dimension']);
  if (!ALLOWED_OPERATORS.has(filter.operator)) throw new Error(`Unsupported filter operator: ${filter.operator}`);
  const noValues = filter.operator === 'set' || filter.operator === 'notSet';
  const values = noValues ? undefined : uniqueStrings(filter.values || [], `filter values for ${filter.member}`, 20);
  if (!noValues && !values.length) throw new Error(`Filter ${filter.member} requires values`);

  if ((filter.operator === 'inDateRange' || filter.operator === 'notInDateRange')) {
    if (member.kind !== 'time_dimension') throw new Error(`${filter.operator} requires a time dimension`);
    validateDateRange(values);
  }
  if (member.enum && ['equals', 'notEquals'].includes(filter.operator)) {
    for (const value of values) {
      if (!member.enum.includes(value)) throw new Error(`Invalid enum value ${value} for ${filter.member}`);
    }
  }
  if (member.kind === 'time_dimension' && ['contains', 'startsWith'].includes(filter.operator)) {
    throw new Error(`${filter.operator} is not allowed for time dimensions`);
  }
  return compact({ member: filter.member, operator: filter.operator, values });
}

function requireMember(members, name, kinds) {
  const member = members.get(name);
  if (!member || !member.public) throw new Error(`Unknown or private semantic member: ${name}`);
  if (!kinds.includes(member.kind)) throw new Error(`${name} must be one of: ${kinds.join(', ')}`);
  return member;
}

function validateDateRange(value) {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.length > 2 || values.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(String(item)))) {
    throw new Error('dateRange must contain one or two YYYY-MM-DD values');
  }
  return values.map(String);
}

function uniqueStrings(value, label, maximum) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (value.length > maximum) throw new Error(`${label} can contain at most ${maximum} entries`);
  const result = value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) throw new Error(`${label} must contain non-empty strings`);
    return item.trim();
  });
  return [...new Set(result)];
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

module.exports = { ALLOWED_GRANULARITIES, ALLOWED_OPERATORS, validateSemanticQuery };
