const { compileMemberCatalog } = require("./compiler");
const { loadManifest } = require("./manifest");
const { validateSemanticQuery } = require("./semantic-query");

const MAX_WORKFLOW_STAGES = 2;
const MAX_EXPORTED_KEYS = 100;
const MAX_DETAIL_ROWS = 1000;
const MAX_WORKFLOW_DIMENSIONS = 16;

function validateSemanticWorkflow(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Semantic workflow must be an object");
  if (
    !Array.isArray(input.stages) ||
    input.stages.length !== MAX_WORKFLOW_STAGES
  )
    throw new Error(
      `Semantic workflow requires exactly ${MAX_WORKFLOW_STAGES} stages`,
    );

  const catalog = compileMemberCatalog(loadManifest());
  const [parentInput, detailInput] = input.stages;
  const parent = validateParentStage(parentInput, catalog);
  const detail = validateDetailStage(detailInput, parent, catalog);
  if (input.outputStage && input.outputStage !== detail.id)
    throw new Error("Semantic workflow output must be the detail stage");

  return {
    stages: [parent, detail],
    outputStage: detail.id,
    limits: {
      maxStages: MAX_WORKFLOW_STAGES,
      maxExportedKeys: MAX_EXPORTED_KEYS,
      maxDetailRows: MAX_DETAIL_ROWS,
    },
  };
}

function validateParentStage(input, catalog) {
  assertStage(input, "parent");
  const query = validateSemanticQuery(input.query, catalog, {
    maxUngroupedLimit: MAX_EXPORTED_KEYS,
  });
  if (!query.ungrouped)
    throw new Error("Semantic workflow parent stage must be ungrouped");
  if (!query.order || !Object.keys(query.order).length)
    throw new Error(
      "Semantic workflow parent stage requires an explicit order",
    );
  for (const member of Object.keys(query.order)) {
    if (!query.dimensions?.includes(member))
      throw new Error("Parent order members must be selected as dimensions");
  }
  if (query.limit > MAX_EXPORTED_KEYS)
    throw new Error(
      `Parent stage can export at most ${MAX_EXPORTED_KEYS} keys`,
    );
  const exportMember = String(input.exportMember || "");
  if (!query.dimensions?.includes(exportMember))
    throw new Error("Parent exportMember must be selected as a dimension");
  return { id: input.id, role: "parent", query, exportMember };
}

function validateDetailStage(input, parent, catalog) {
  assertStage(input, "detail");
  if (input.dependsOn !== parent.id)
    throw new Error("Detail stage must depend on the parent stage");
  const binding = input.binding;
  if (!binding || binding.fromStage !== parent.id)
    throw new Error("Detail stage requires a parent-stage binding");
  if (binding.sourceMember !== parent.exportMember)
    throw new Error(
      "Detail binding sourceMember must match parent exportMember",
    );
  const targetMember = String(binding.targetMember || "");
  const queryInput = structuredClone(input.query || {});
  queryInput.filters = [
    ...(queryInput.filters || []),
    { member: targetMember, operator: "equals", values: ["__workflow_key__"] },
  ];
  const query = validateSemanticQuery(queryInput, catalog, {
    maxDimensions: MAX_WORKFLOW_DIMENSIONS,
    maxUngroupedLimit: MAX_DETAIL_ROWS,
    maxFilterValues: MAX_EXPORTED_KEYS,
  });
  if (!query.ungrouped)
    throw new Error("Semantic workflow detail stage must be ungrouped");
  return {
    id: input.id,
    role: "detail",
    dependsOn: parent.id,
    query,
    binding: {
      fromStage: parent.id,
      sourceMember: parent.exportMember,
      targetMember,
    },
  };
}

function bindWorkflowDetail(workflow, parentData) {
  const [parent, detail] = workflow.stages;
  const values = [
    ...new Set(
      parentData
        .map((row) => row[parent.exportMember])
        .filter((value) => value !== undefined && value !== null)
        .map(String),
    ),
  ];
  if (!values.length) return { query: detail.query, values, empty: true };
  if (values.length > MAX_EXPORTED_KEYS)
    throw new Error(`Workflow exported more than ${MAX_EXPORTED_KEYS} keys`);
  const query = structuredClone(detail.query);
  const filter = query.filters.find(
    (item) =>
      item.member === detail.binding.targetMember &&
      item.values?.[0] === "__workflow_key__",
  );
  if (!filter) throw new Error("Workflow detail binding filter is missing");
  filter.values = values;
  return { query, values, empty: false };
}

function assertStage(input, role) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error(`Semantic workflow ${role} stage must be an object`);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(String(input.id || "")))
    throw new Error(`Semantic workflow ${role} stage has an invalid id`);
}

module.exports = {
  bindWorkflowDetail,
  validateSemanticWorkflow,
  MAX_DETAIL_ROWS,
  MAX_EXPORTED_KEYS,
};
