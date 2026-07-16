const YAML = require("yaml");

const NUMERIC_TYPE =
  /(tinyint|smallint|int|bigint|float|double|decimal|number|numeric)/i;
const TIME_TYPE = /(date|time|timestamp|datetime)/i;
const BOOLEAN_TYPE = /boolean/i;
const ID_NAME = /(^id$|_id$|key$|_key$)/i;
const AMOUNT_NAME = /(amount|price|revenue|sales|balance|cost|tax|discount)/i;
const QUANTITY_NAME = /(quantity|qty|count|number)/i;

function generateEntityDraft(table) {
  const entityName = toPascalCase(singularize(table.name));
  const candidates = table.columns.map((column) => classifyColumn(column));
  const primary = choosePrimaryKey(candidates, table.name);
  const dimensions = [];
  const timeDimensions = [];
  const facts = [];
  for (const candidate of candidates) {
    const member = {
      name: candidate.memberName,
      title: humanize(candidate.memberName),
      description: `Generated from ${table.name}.${candidate.column.name}; requires human review.`,
      expr: candidate.column.name,
      type: candidate.semanticType,
      status: "draft",
    };
    if (candidate.kind === "time_dimension") timeDimensions.push(member);
    else if (candidate.kind === "fact") facts.push(member);
    else dimensions.push(member);
  }
  const metrics = [
    {
      name: "count",
      title: `${humanize(entityName)}数量`,
      description: `Number of rows in ${table.database}.${table.name}; requires grain review.`,
      type: "count",
      expr: primary || dimensions[0]?.name,
      status: "draft",
    },
    ...facts
      .filter(
        (fact) => AMOUNT_NAME.test(fact.name) || QUANTITY_NAME.test(fact.name),
      )
      .map((fact) => ({
        name: `total${capitalize(fact.name)}`,
        title: `${fact.title}总计`,
        description: `Generated sum of ${fact.name}; requires business definition review.`,
        type: "sum",
        expr: fact.name,
        status: "draft",
      })),
  ];
  return {
    entity: compact({
      name: entityName,
      title: humanize(entityName),
      description: `Generated semantic draft for ${table.database}.${table.name}.`,
      source: compact({
        catalog: table.catalog === table.database ? undefined : table.catalog,
        schema: table.database,
        table: table.name,
      }),
      keys: primary ? { primary } : undefined,
      dimensions,
      time_dimensions: timeDimensions,
      facts,
      metrics,
      governance: {
        status: "draft",
        generated: true,
        requires_human_review: true,
      },
    }),
    diagnostics: {
      table: `${table.database}.${table.name}`,
      primaryKeyCandidate: primary,
      warnings: primary ? [] : ["No reliable primary key candidate was found."],
    },
  };
}

function generateDrafts(tables) {
  return tables.map(generateEntityDraft);
}

function draftYaml(draft) {
  return YAML.stringify({ entity: draft.entity }, { lineWidth: 120 });
}

function classifyColumn(column) {
  const memberName = toCamelCase(stripPrefix(column.name));
  const type = String(column.dataType || "string");
  if (TIME_TYPE.test(type))
    return { column, memberName, kind: "time_dimension", semanticType: "time" };
  if (NUMERIC_TYPE.test(type) && !ID_NAME.test(column.name))
    return {
      column,
      memberName,
      kind: "fact",
      semanticType: /int/i.test(type) ? "number" : "decimal",
    };
  return {
    column,
    memberName,
    kind: "dimension",
    semanticType: BOOLEAN_TYPE.test(type)
      ? "boolean"
      : NUMERIC_TYPE.test(type)
        ? "number"
        : "string",
  };
}

function choosePrimaryKey(candidates, tableName) {
  const singular = singularize(tableName).replace(/_/g, "");
  const exact = candidates.find((item) =>
    ["id", `${singular}id`, `${singular}key`].includes(
      item.memberName.toLowerCase(),
    ),
  );
  return (exact || candidates.find((item) => ID_NAME.test(item.column.name)))
    ?.memberName;
}

function stripPrefix(name) {
  return name.replace(/^[a-z]{1,3}_/, "");
}
function singularize(name) {
  return name.endsWith("ies")
    ? `${name.slice(0, -3)}y`
    : name.endsWith("s") && !name.endsWith("ss")
      ? name.slice(0, -1)
      : name;
}
function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
function toPascalCase(value) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(capitalize)
    .join("");
}
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function humanize(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
}
function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

module.exports = {
  classifyColumn,
  draftYaml,
  generateDrafts,
  generateEntityDraft,
};
