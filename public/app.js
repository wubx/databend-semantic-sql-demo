const elements = Object.fromEntries(
  [
    "health",
    "question",
    "examples",
    "plan",
    "run",
    "error",
    "route",
    "interpretation",
    "cubeQuery",
    "validation",
    "explain",
    "executeSql",
    "sql",
    "explainResult",
    "result",
    "metrics",
    "summaryCard",
    "summary",
    "queryPage",
    "semanticPage",
    "semanticDescription",
    "semanticStats",
    "semanticSearch",
    "kindFilters",
    "entityList",
    "relationshipCount",
    "relationshipGraph",
    "entityHeading",
    "memberCount",
    "memberGrid",
    "verifiedQueryList",
  ].map((id) => [id, document.getElementById(id)]),
);
let currentPlan;
let semanticModel;
let selectedEntity = "all";
let selectedKind = "all";

boot();

async function boot() {
  await Promise.all([loadHealth(), loadExamples(), loadSemanticModel()]);
  elements.plan.addEventListener("click", () => plan(false));
  elements.run.addEventListener("click", () => plan(true));
  elements.explain.addEventListener("click", explain);
  elements.executeSql.addEventListener("click", executePlannedSql);
  elements.semanticSearch.addEventListener("input", renderMembers);
  elements.kindFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind]");
    if (!button) return;
    selectedKind = button.dataset.kind;
    renderKindFilters();
    renderMembers();
  });
  elements.entityList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entity]");
    if (!button) return;
    selectedEntity = button.dataset.entity;
    renderEntities();
    renderMembers();
  });
  document
    .querySelectorAll("[data-page]")
    .forEach((tab) =>
      tab.addEventListener("click", () => showPage(tab.dataset.page)),
    );
}

function showPage(page) {
  document
    .querySelectorAll("[data-page]")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.page === page),
    );
  elements.queryPage.classList.toggle("active", page === "query");
  elements.semanticPage.classList.toggle("active", page === "semantic");
}

async function loadHealth() {
  try {
    const health = await api("/api/health");
    elements.health.textContent = health.ok
      ? `${health.semanticGateway === "embedded" ? "Embedded Cube Compiler" : "Cube"} 与 Databend 已连接${health.aiEnabled ? ` · AI ${health.aiModel}` : ""}`
      : "依赖服务异常";
    elements.health.className = `health ${health.ok ? "ok" : "bad"}`;
  } catch (error) {
    elements.health.textContent = "Demo API 未连接";
    elements.health.className = "health bad";
  }
}

async function loadExamples() {
  const { queries } = await api("/api/query/examples");
  elements.examples.innerHTML = queries
    .map(
      (query) =>
        `<button class="example" data-question="${escapeHtml(query.question)}">${query.id} · ${escapeHtml(query.title)}</button>`,
    )
    .join("");
  elements.examples.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question]");
    if (button) elements.question.value = button.dataset.question;
  });
}

async function loadSemanticModel() {
  semanticModel = await api("/api/semantic-model");
  elements.semanticDescription.textContent = `${semanticModel.metadata.description} · Owner: ${semanticModel.metadata.owner}`;
  const stats = [
    [semanticModel.stats.entities, "实体"],
    [semanticModel.stats.publicMembers, "公开成员"],
    [semanticModel.stats.measures, "指标"],
    [semanticModel.stats.relationships, "关系"],
    [semanticModel.stats.verifiedQueries, "认证查询"],
  ];
  elements.semanticStats.innerHTML = stats
    .map(
      ([value, label]) =>
        `<div><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("");
  renderKindFilters();
  renderEntities();
  renderRelationships();
  renderMembers();
  renderVerifiedQueries();
}

const kindLabels = {
  all: "全部",
  measure: "指标",
  dimension: "维度",
  time_dimension: "时间",
  segment: "分群",
  fact: "事实字段",
};

function renderKindFilters() {
  elements.kindFilters.innerHTML = Object.entries(kindLabels)
    .map(
      ([kind, label]) =>
        `<button class="kind-filter${kind === selectedKind ? " active" : ""}" data-kind="${kind}">${label}</button>`,
    )
    .join("");
}

function renderEntities() {
  const entities = [
    {
      name: "all",
      title: "全部实体",
      members: semanticModel.entities.flatMap((entity) => entity.members),
    },
    ...semanticModel.entities,
  ];
  elements.entityList.innerHTML = entities
    .map((entity) => {
      const measures = entity.members.filter(
        (member) => member.kind === "measure",
      ).length;
      return `<button class="entity-item${entity.name === selectedEntity ? " active" : ""}" data-entity="${entity.name}"><span><strong>${escapeHtml(entity.title)}</strong><small>${escapeHtml(entity.name === "all" ? "完整语义模型" : entity.name)}</small></span><span class="entity-count">${entity.members.length}<small>${measures} 指标</small></span></button>`;
    })
    .join("");
}

function renderRelationships() {
  elements.relationshipCount.textContent = `${semanticModel.relationships.length} 条关系`;
  elements.relationshipGraph.innerHTML = semanticModel.relationships
    .map((relationship) => {
      const columns = relationship.columns
        .map((column) => `${column.from} = ${column.to}`)
        .join(" · ");
      return `<div class="relationship"><button data-open-entity="${relationship.from}">${escapeHtml(relationship.from)}</button><span class="relationship-line"><small>${formatCardinality(relationship.cardinality)}</small><i></i></span><button data-open-entity="${relationship.to}">${escapeHtml(relationship.to)}</button><code>${escapeHtml(columns || relationship.sql || "自定义关系")}</code></div>`;
    })
    .join("");
  elements.relationshipGraph.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-entity]");
    if (!button) return;
    selectedEntity = button.dataset.openEntity;
    renderEntities();
    renderMembers();
  });
}

function renderMembers() {
  if (!semanticModel) return;
  const entity =
    selectedEntity === "all"
      ? null
      : semanticModel.entities.find((item) => item.name === selectedEntity);
  const search = elements.semanticSearch.value.trim().toLowerCase();
  const members = (
    entity
      ? entity.members
      : semanticModel.entities.flatMap((item) => item.members)
  )
    .filter((member) => selectedKind === "all" || member.kind === selectedKind)
    .filter(
      (member) =>
        !search ||
        [member.id, member.title, member.description, ...member.synonyms]
          .join(" ")
          .toLowerCase()
          .includes(search),
    );
  elements.entityHeading.textContent = entity
    ? `${entity.title} · ${entity.name}`
    : "全部语义成员";
  elements.memberCount.textContent = `${members.length} 个成员`;
  elements.memberGrid.innerHTML = members.length
    ? members.map(renderMemberCard).join("")
    : '<div class="empty">没有找到匹配的语义成员。</div>';
}

function renderMemberCard(member) {
  const badges = [
    kindLabels[member.kind],
    member.type,
    member.primaryKey ? "主键" : null,
    member.public ? "公开" : "私有",
  ].filter(Boolean);
  const enumValues = member.enum.length
    ? `<div class="member-detail"><span>可选值</span><div>${member.enum.map((value) => `<code>${escapeHtml(value)}</code>`).join(" ")}</div></div>`
    : "";
  const synonyms = member.synonyms.length
    ? `<div class="member-detail"><span>业务说法</span><p>${member.synonyms.map(escapeHtml).join(" · ")}</p></div>`
    : "";
  const usage = member.usedBy.length
    ? `<div class="member-detail"><span>认证查询</span><p>${member.usedBy.map((query) => escapeHtml(`${query.id} ${query.title}`)).join(" · ")}</p></div>`
    : "";
  return `<article class="member-card ${member.public ? "" : "private"}"><div class="member-card-head"><div><h3>${escapeHtml(member.title)}</h3><code>${escapeHtml(member.id)}</code></div><div class="member-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div></div><p>${escapeHtml(member.description || "暂无业务说明")}</p><div class="member-detail"><span>Databend 表达式</span><code>${escapeHtml(member.expression)}</code></div>${enumValues}${synonyms}${usage}</article>`;
}

function renderVerifiedQueries() {
  elements.verifiedQueryList.innerHTML = semanticModel.verifiedQueries
    .map(
      (query) =>
        `<article><div><span>${escapeHtml(query.id)}</span><strong>${escapeHtml(query.title)}</strong><p>${escapeHtml(query.question)}</p></div><button class="tiny" data-ask-question="${escapeHtml(query.question)}">去查询</button></article>`,
    )
    .join("");
  elements.verifiedQueryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ask-question]");
    if (!button) return;
    elements.question.value = button.dataset.askQuestion;
    showPage("query");
    elements.question.focus();
  });
}

function formatCardinality(value) {
  return (
    { many_to_one: "多对一", one_to_many: "一对多", one_to_one: "一对一" }[
      value
    ] || value
  );
}

async function plan(execute) {
  setBusy(true);
  clearError();
  try {
    const payload = {
      question: elements.question.value,
      mode: document.querySelector('input[name="mode"]:checked').value,
      planner: document.querySelector('input[name="planner"]:checked').value,
    };
    const response = await api(
      execute ? "/api/query/execute" : "/api/query/plan",
      { method: "POST", body: JSON.stringify(payload) },
    );
    currentPlan = execute ? response.plan : response;
    renderPlan(currentPlan);
    if (execute) renderResult(response);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function renderPlan(plan) {
  if (!plan.supported) {
    elements.route.textContent = "不支持";
    elements.interpretation.textContent = plan.message;
    return;
  }
  elements.route.textContent =
    plan.route === "semantic" ? "Semantic" : "TPC-H SQL";
  elements.interpretation.innerHTML = [
    ["认证查询", `${plan.queryId} · ${plan.title}`],
    [
      "计划器",
      plan.fallback
        ? `${plan.planner}（AI 回退：${plan.fallback.reason}）`
        : plan.planner,
    ],
    [
      "查询理解",
      plan.queryUnderstanding?.llmUsed
        ? `使用 LLM（${plan.queryUnderstanding.method}）`
        : `未使用 LLM（${plan.queryUnderstanding?.method || "deterministic"}）`,
    ],
    ["可信度", `${Math.round(plan.confidence * 100)}%`],
    [
      "执行路径",
      plan.route === "semantic"
        ? `${plan.semanticGateway === "embedded" ? "Embedded Cube Compiler" : "Cube Semantic Query"} → Databend`
        : "Certified SQL → Databend",
    ],
    ["查询参数", formatQueryParameters(plan)],
    ["计划耗时", formatTimings(plan.timings)],
  ]
    .map(
      ([key, value]) =>
        `<div class="interpretation-row"><span>${key}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
  elements.cubeQuery.textContent = plan.cubeQuery
    ? JSON.stringify(plan.cubeQuery, null, 2)
    : "此查询使用认证的 TPC-H SQL 模板。";
  elements.sql.textContent = plan.sql || "尚未生成";
  elements.validation.textContent = plan.validation?.valid
    ? "安全检查通过"
    : "安全检查失败";
  elements.validation.style.color = plan.validation?.valid
    ? "#55dfc5"
    : "#ff8da3";
  elements.explain.disabled = !plan.validation?.valid;
  elements.executeSql.disabled = !plan.validation?.valid;
  elements.explainResult.classList.add("hidden");
}

async function explain() {
  if (!currentPlan?.sql) return;
  setBusy(true);
  try {
    const response = await api("/api/query/explain", {
      method: "POST",
      body: JSON.stringify({ sql: currentPlan.sql }),
    });
    elements.explainResult.textContent = response.rows
      .map((row) => Object.values(row).join(" "))
      .join("\n");
    elements.explainResult.classList.remove("hidden");
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function executePlannedSql() {
  if (!currentPlan?.sql || !currentPlan?.validation?.valid) return;
  setBusy(true);
  clearError();
  try {
    const response = await api("/api/query/execute-sql", {
      method: "POST",
      body: JSON.stringify({
        question: elements.question.value,
        sql: currentPlan.sql,
        sqlValues: currentPlan.sqlValues || [],
        plan: {
          queryId: currentPlan.queryId,
          route: currentPlan.route,
          planner: currentPlan.planner,
          strategy: currentPlan.strategy,
          cubeQuery: currentPlan.cubeQuery,
          confidence: currentPlan.confidence,
          queryParameters: currentPlan.queryParameters,
          queryUnderstanding: currentPlan.queryUnderstanding,
          timings: currentPlan.timings,
        },
      }),
    });
    renderResult(response);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function renderResult(response) {
  const rows = response.data || [];
  elements.metrics.textContent = `${response.source} · ${response.durationMs} ms · ${rows.length} rows · ${formatTimings(response.timings)}`;
  if (response.summary) {
    elements.summary.textContent = response.summary;
    elements.summaryCard.classList.remove("hidden");
  } else {
    elements.summaryCard.classList.add("hidden");
  }
  if (!rows.length) {
    elements.result.innerHTML =
      '<div class="empty">查询成功，但没有返回数据。</div>';
    return;
  }
  const columns = [...new Set(rows.flatMap(Object.keys))];
  elements.result.innerHTML = `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(format(row[column]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ||
        body.message ||
        body.errors?.join("; ") ||
        `HTTP ${response.status}`,
    );
  return body;
}

function formatQueryParameters(plan) {
  const parameters = plan.queryParameters || plan.parameters || {};
  return Object.keys(parameters).length ? JSON.stringify(parameters) : "无";
}

function formatTimings(timings) {
  if (!timings) return "未记录";
  const labels = {
    llmMs: "LLM",
    exactMatchMs: "精确匹配",
    deterministicMs: "规则路由",
    fallbackMs: "回退",
    sqlGenerationMs: "Cube SQL",
    validationMs: "校验",
    planningMs: "计划",
    explainMs: "EXPLAIN",
    queryMs: "查询",
    summaryMs: "总结",
    totalMs: "总计",
  };
  return Object.entries(timings)
    .filter(([key, value]) => labels[key] && Number.isFinite(value))
    .map(([key, value]) => `${labels[key]} ${value} ms`)
    .join(" · ");
}
function setBusy(busy) {
  elements.plan.disabled = busy;
  elements.run.disabled = busy;
  elements.explain.disabled = busy || !currentPlan?.validation?.valid;
  elements.executeSql.disabled = busy || !currentPlan?.validation?.valid;
  elements.plan.textContent = busy ? "处理中…" : "生成计划";
}
function showError(message) {
  elements.error.textContent = message;
  elements.error.classList.remove("hidden");
}
function clearError() {
  elements.error.classList.add("hidden");
}
function format(value) {
  return value == null
    ? "null"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
}
