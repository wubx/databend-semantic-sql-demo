const crypto = require("node:crypto");

const { requestCompletion, isEnabled } = require("./llm");
const { listQueryObservations } = require("./query-log");
const { readSemanticSourceFile } = require("./semantic-source-files");

async function listEvolutionIssues() {
  const { observations } = await listQueryObservations({
    status: "rejected",
    limit: 500,
  });
  const groups = new Map();
  for (const item of observations) {
    const rejection = item.rejection || {};
    const key = issueKey(rejection, item.question);
    const existing = groups.get(key) || {
      id: crypto.createHash("sha1").update(key).digest("hex").slice(0, 12),
      category: rejection.category || "unclassified",
      count: 0,
      firstSeen: item.timestamp,
      lastSeen: item.timestamp,
      questions: [],
      reasons: [],
      missingMembers: [],
      affectedEntities: [],
      suggestedActions: [],
      yamlCandidates: [],
    };
    existing.count += 1;
    if (item.timestamp < existing.firstSeen)
      existing.firstSeen = item.timestamp;
    if (item.timestamp > existing.lastSeen) existing.lastSeen = item.timestamp;
    pushUnique(existing.questions, item.question, 10);
    pushUnique(existing.reasons, rejection.reason || rejection.message, 10);
    mergeUnique(existing.missingMembers, rejection.missingMembers);
    mergeUnique(existing.affectedEntities, rejection.affectedEntities);
    mergeUnique(existing.suggestedActions, rejection.suggestedActions);
    mergeUnique(existing.yamlCandidates, rejection.yamlCandidates);
    groups.set(key, existing);
  }
  const issues = [...groups.values()].sort(
    (a, b) => b.count - a.count || String(b.lastSeen).localeCompare(a.lastSeen),
  );
  return {
    issues,
    stats: {
      rejectedRecords: observations.length,
      issueCount: issues.length,
      categories: countBy(issues, (issue) => issue.category),
      repeatedIssues: issues.filter((issue) => issue.count > 1).length,
    },
  };
}

async function analyzeEvolutionIssue(issueId, reviewerContext = "") {
  if (!isEnabled())
    throw new Error("AI semantic evolution analysis is disabled");
  const { issues } = await listEvolutionIssues();
  const issue = issues.find((item) => item.id === issueId);
  if (!issue) throw new Error("Unknown semantic evolution issue");
  const sources = issue.yamlCandidates.flatMap((candidate) => {
    const id = String(candidate).replace(/^semantic\//, "");
    try {
      const source = readSemanticSourceFile(id);
      return [{ path: candidate, content: source.content.slice(0, 16000) }];
    } catch {
      return [];
    }
  });
  const proposal = await requestCompletion(
    [
      {
        role: "system",
        content: [
          "You are a semantic-layer maintenance assistant for Databend Semantic Query Lab.",
          "Analyze rejected user questions and propose the smallest governed improvement.",
          "Never claim a business definition is certified. Never silently choose grain, attribution, denominator, allocation, or permissions.",
          "Prefer an existing member when possible. Otherwise propose a metric, dimension, relationship, entity, verified query, certified SQL, policy, or planner improvement.",
          "YAML drafts are review-only. Include explicit grain, numerator/denominator, multi-value attribution, fan-out, security, and performance risks.",
          "Return JSON only with this shape:",
          '{"summary":string,"proposalType":"reuse|metric|dimension|relationship|entity|verified-query|certified-sql|policy|planner","businessDefinition":string,"grain":string,"affectedFiles":string[],"membersToAdd":string[],"relationshipsToAdd":string[],"reviewQuestions":string[],"risks":string[],"validationPlan":string[],"yamlDrafts":[{"path":string,"content":string}],"replayQuestions":string[]}',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          issue,
          reviewerContext: String(reviewerContext || "").slice(0, 4000),
          relevantSemanticSources: sources,
        }),
      },
    ],
    {
      operation: "semantic-evolution-analysis",
      maxTokens: Number(process.env.SEMANTIC_EVOLUTION_AI_MAX_TOKENS || 2400),
      timeoutMs: Number(process.env.SEMANTIC_EVOLUTION_AI_TIMEOUT_MS || 90000),
    },
  );
  return { issue, proposal, reviewRequired: true, publishEnabled: false };
}

function issueKey(rejection, question) {
  const category = rejection.category || "unclassified";
  const entities = [...(rejection.affectedEntities || [])].sort().join("|");
  const missing = [...(rejection.missingMembers || [])].sort().join("|");
  if (entities || missing) return `${category}:${entities}:${missing}`;
  return `${category}:${normalizeQuestion(question)}`;
}

function normalizeQuestion(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[，。？！,.?!\s]+/g, "")
    .slice(0, 120);
}

function pushUnique(target, value, limit = 20) {
  if (value && !target.includes(value) && target.length < limit)
    target.push(value);
}

function mergeUnique(target, values) {
  for (const value of values || []) pushUnique(target, value);
}

function countBy(items, key) {
  return Object.fromEntries(
    [
      ...items.reduce((map, item) => {
        const value = key(item);
        map.set(value, (map.get(value) || 0) + 1);
        return map;
      }, new Map()),
    ].sort((a, b) => b[1] - a[1]),
  );
}

module.exports = { analyzeEvolutionIssue, listEvolutionIssues };
