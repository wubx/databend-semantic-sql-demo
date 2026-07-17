const { requestCompletion } = require("./llm");

async function enrichDraftWithLlm(draft, context = {}, options = {}) {
  const result = await requestCompletion(
    [
      {
        role: "system",
        content: [
          "You enrich a generated Databend semantic-model draft for human review.",
          "Never change source catalog/schema/table, column expressions, data types, aggregation types, primary keys, or access settings.",
          "Return JSON only. Suggest business-facing titles, descriptions, business definitions, and Chinese/English synonyms.",
          "Do not claim a metric is certified. Keep all generated items in draft status.",
          "Do not invent joins, filters, enum values, units, or business rules that are not supported by the supplied metadata.",
          'Shape: {"entity":{"title":string,"description":string},"members":{"memberName":{"title":string,"description":string,"business_definition":string,"synonyms":string[]}},"warnings":string[]}',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          draft: draft.entity,
          businessContext: context,
        }),
      },
    ],
    {
      maxTokens: Number(process.env.MODELER_AI_MAX_TOKENS || 1800),
      timeoutMs: Number(process.env.MODELER_AI_TIMEOUT_MS || 90000),
      operation: "model-enrichment",
      ...options,
    },
  );
  return applyEnrichment(draft, result);
}

function applyEnrichment(draft, enrichment) {
  const result = structuredClone(draft);
  if (enrichment.entity?.title) result.entity.title = enrichment.entity.title;
  if (enrichment.entity?.description)
    result.entity.description = enrichment.entity.description;
  for (const group of [
    "dimensions",
    "time_dimensions",
    "facts",
    "metrics",
    "filters",
  ]) {
    for (const member of result.entity[group] || []) {
      const proposal = enrichment.members?.[member.name];
      if (!proposal) continue;
      if (proposal.title) member.title = String(proposal.title);
      if (proposal.description)
        member.description = String(proposal.description);
      if (proposal.business_definition)
        member.business_definition = String(proposal.business_definition);
      if (Array.isArray(proposal.synonyms))
        member.synonyms = proposal.synonyms.map(String).slice(0, 12);
    }
  }
  result.diagnostics.llmWarnings = Array.isArray(enrichment.warnings)
    ? enrichment.warnings.map(String)
    : [];
  result.diagnostics.llmEnriched = true;
  return result;
}

module.exports = { applyEnrichment, enrichDraftWithLlm };
